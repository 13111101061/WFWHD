const { ProviderCatalog } = require('../catalog/ProviderCatalog');
const { VoiceCatalog } = require('../catalog/VoiceCatalog');
const { voiceRegistry } = require('../core/VoiceRegistry');
const ttsDefaults = require('../config/ttsDefaults');
const VoiceCodeGenerator = require('../config/VoiceCodeGenerator');
const VoiceNormalizer = require('./VoiceNormalizer');

// 兼容映射缓存（懒加载）
let _compatMap = null;

function loadCompatMap() {
  if (_compatMap === null) {
    try {
      const fs = require('fs');
      const path = require('path');
      const compatPath = path.join(__dirname, '../config/VoiceCodeCompatMap.json');
      const raw = fs.readFileSync(compatPath, 'utf8');
      _compatMap = JSON.parse(raw);
    } catch (e) {
      _compatMap = { legacyToVoiceCode: {}, voiceCodeIndex: {} };
    }
  }
  return _compatMap;
}

// 支持字段别名：voice_code/voiceCode, system_id/systemId, voice_id/voiceId, voice
const RESERVED_REQUEST_KEYS = new Set([
  'text', 'service', 'options',
  'voiceCode', 'voice_code',
  'systemId', 'system_id',
  'voiceId', 'voice_id', 'voice'
]);

/**
 * 标准化字段值提取（支持下划线和驼峰两种命名）
 */
function extractField(request, camelKey, snakeKey) {
  return request[camelKey] !== undefined ? request[camelKey] :
         request[snakeKey] !== undefined ? request[snakeKey] : undefined;
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

/**
 * @typedef {Object} VoiceIdentity - VoiceResolver 输出结构
 *
 * VoiceResolver 职责已收缩为"身份解析"，不再负责参数合并。
 * 参数合并逻辑已迁移到 ParameterResolutionService。
 *
 * @property {string} serviceKey - canonical service key (如 "moss_tts")
 * @property {string} providerKey - 服务商标识 (如 "moss")
 * @property {string} modelKey - 模型标识 (如 "moss-tts")
 * @property {string} systemId - 系统音色ID (如 "moss-tts-ashui")
 * @property {string} voiceCode - 15位音色编码 (如 "001000030000005")
 * @property {string} providerVoiceId - 服务商真实音色ID (如 "2001257729754140672")
 * @property {Object} voiceRuntime - 音色运行时配置（来自音色数据，供 ParameterResolutionService 使用）
 */

function extractTopLevelOptions(request = {}) {
  // 主保留字集合（驼峰形式），用于判断
  const coreReserved = new Set(['text', 'service', 'options', 'voiceCode', 'systemId', 'voiceId', 'voice']);

  return Object.entries(request).reduce((acc, [key, value]) => {
    // 跳过所有保留字段（包括下划线别名）
    if (RESERVED_REQUEST_KEYS.has(key) && value !== undefined) {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});
}

const VoiceResolver = {
  /**
   * Normalize request shape to a single internal contract.
   * Supports:
   * - voice -> voiceId compatibility
   * - legacy top-level options (model/speed/...)
   * - options object (preferred)
   */
  normalizeRequest(request = {}) {
    const topLevelOptions = extractTopLevelOptions(request);
    const nestedOptions = request.options && typeof request.options === 'object'
      ? request.options
      : {};

    const normalizedOptions = {
      ...topLevelOptions,
      ...nestedOptions
    };

    // 使用字段提取函数支持下划线/驼峰命名（voice_code/voiceCode）
    const voiceCode = extractField(request, 'voiceCode', 'voice_code') ||
                      extractField(normalizedOptions, 'voiceCode', 'voice_code');

    const systemId = extractField(request, 'systemId', 'system_id') ||
                     extractField(normalizedOptions, 'systemId', 'system_id');

    // voiceId 解析优先级：voice_id > voiceId > voice（下划线优先）
    const voiceId = pickFirst(
      extractField(request, 'voiceId', 'voice_id'),
      request.voice,
      extractField(normalizedOptions, 'voiceId', 'voice_id'),
      normalizedOptions.voice
    );

    // 关键修复：如果传入了 voiceCode 或 systemId，先尝试从编码/音色解析服务
    // 而不是直接使用默认服务
    let service = request.service;
    if (!service && voiceCode) {
      // 尝试从 voiceCode 解析服务 (v2.0 格式，直接使用 serviceKey)
      const parsed = VoiceCodeGenerator.parse(voiceCode);
      if (parsed && parsed.providerKey && parsed.serviceKey) {
        // v2.0 格式直接返回 providerKey + serviceKey
        service = `${parsed.providerKey}_${parsed.serviceKey}`;
      }
    }
    if (!service && systemId) {
      // 尝试从 systemId 对应音色解析服务
      const rawVoice = voiceRegistry.get(systemId);
      // 支持新结构 (identity.provider/identity.service) 和旧结构
      const provider = rawVoice?.identity?.provider || rawVoice?.provider;
      const serviceType = rawVoice?.identity?.service || rawVoice?.service;
      if (provider && serviceType) {
        service = `${provider}_${serviceType}`;
      }
    }

    return {
      text: request.text,
      service: service || ttsDefaults.defaultService,
      voiceCode,
      systemId,
      voiceId,
      options: normalizedOptions
    };
  },

  /**
   * 从 voiceCode 解析结果构建服务标识符 (v2.0 简化版)
   * @param {Object} parsed - VoiceCodeGenerator.parse 结果
   * @returns {string|null} canonical service key
   */
  _buildServiceKeyFromVoiceCode(parsed) {
    if (!parsed || !parsed.providerKey || !parsed.serviceKey) return null;

    // v2.0 格式直接返回 providerKey + serviceKey
    // 例如: providerKey="aliyun", serviceKey="qwen_http" → "aliyun_qwen_http"
    return `${parsed.providerKey}_${parsed.serviceKey}`;
  },

  resolve(request) {
    const normalized = this.normalizeRequest(request);
    const { service, voiceId, voiceCode, systemId, options = {} } = normalized;

    const canonicalKey = ProviderCatalog.resolveCanonicalKey(service);
    if (!canonicalKey) {
      const error = new Error(`Unknown service: ${service}`);
      error.code = 'UNKNOWN_SERVICE';
      throw error;
    }

    const providerConfig = ProviderCatalog.get(canonicalKey);
    if (!providerConfig) {
      const error = new Error(`Provider config not found: ${canonicalKey}`);
      error.code = 'CONFIG_ERROR';
      throw error;
    }

    // 核心解析逻辑：voiceCode > systemId > legacy voice
    // 关键修复：如果原始请求没有指定 service，使用从 voiceCode/systemId 解析出的服务
    const targetService = voiceCode || systemId ? service : canonicalKey;
    const resolvedVoice = this._resolveVoice({ voiceCode, systemId, voiceId, service: targetService });

    // 校验：如果请求明确指定了 service，且与 voiceCode/systemId 解析出的服务不一致，返回 400 错误
    // 关键修复：先将 request.service 转换为 canonical key 再比较（支持别名）
    if (request.service && (voiceCode || systemId) && resolvedVoice.expectedServiceKey) {
      const requestedCanonicalKey = ProviderCatalog.resolveCanonicalKey(request.service);
      if (requestedCanonicalKey && resolvedVoice.expectedServiceKey !== requestedCanonicalKey) {
        const error = new Error(
          `Service mismatch: ${voiceCode ? 'voiceCode' : 'systemId'} ${voiceCode || systemId} belongs to ${resolvedVoice.expectedServiceKey}, ` +
          `but request specified ${request.service}`
        );
        error.code = 'SERVICE_MISMATCH';
        throw error;
      }
    }

    // 关键修复：使用实际目标服务的配置（确保使用 canonical key）
    // 优先使用从 voiceCode/systemId 解析出的服务，其次是用户请求的服务
    const finalServiceKey = resolvedVoice.expectedServiceKey ||
                            ProviderCatalog.resolveCanonicalKey(targetService) ||
                            canonicalKey;
    const finalProviderConfig = ProviderCatalog.get(finalServiceKey) || providerConfig;

    // 返回 VoiceIdentity（不再包含 runtimeOptions）
    // 参数合并逻辑已迁移到 ParameterResolutionService
    return {
      // 新字段（主要）
      serviceKey: finalServiceKey,
      providerKey: finalProviderConfig.provider,
      modelKey: resolvedVoice.runtime?.model || 'default',
      systemId: resolvedVoice.systemId,
      voiceCode: resolvedVoice.voiceCode,
      providerVoiceId: resolvedVoice.providerVoiceId,
      voiceRuntime: resolvedVoice.runtime,

      // 兼容字段（deprecated，后续版本移除）
      // @deprecated - 使用 providerVoiceId
      voiceId: resolvedVoice.providerVoiceId,
      // @deprecated - 使用 serviceKey
      adapterKey: finalServiceKey
    };
  },

  /**
   * 核心音色解析方法
   * 优先级：voiceCode > systemId > legacy voice
   * @param {Object} params
   * @param {string} [params.voiceCode] - 15位数字编码
   * @param {string} [params.systemId] - 系统音色ID（新标准，与voiceId分离）
   * @param {string} [params.voiceId] - 旧版音色ID/音色名称（legacy）
   * @param {string} params.service - canonical service key
   * @returns {{ voiceCode, systemId, providerVoiceId, runtime, expectedServiceKey }}
   */
  _resolveVoice({ voiceCode, systemId, voiceId, service }) {
    // 1. voiceCode 优先（新标准）
    if (voiceCode) {
      if (!VoiceCodeGenerator.isValid(voiceCode)) {
        const error = new Error(`Invalid voiceCode format: ${voiceCode}`);
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      const parsed = VoiceCodeGenerator.parse(voiceCode);
      if (!parsed) {
        const error = new Error(`voiceCode parse failed: ${voiceCode}`);
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      // 关键修复：从编码解析期望的服务（用于一致性校验）
      // 构建完整的 canonical key，而不是只用 modelKey
      const expectedServiceKey = this._buildServiceKeyFromVoiceCode(parsed);

      // 从兼容映射中查找 provider_voice_id
      const compatMap = loadCompatMap();
      const voiceInfo = compatMap.voiceCodeIndex[voiceCode];

      if (!voiceInfo) {
        // 尝试直接从 voiceRegistry 查找
        const allVoices = voiceRegistry.getAll();
        const matched = allVoices.find(v =>
          v.voiceCode === voiceCode || v.identity?.voiceCode === voiceCode
        );
        if (matched) {
          // 使用 VoiceNormalizer 提取运行时信息
          const stored = VoiceNormalizer.fromLegacy(matched);
          return {
            voiceCode,
            systemId: stored.identity.id,
            providerVoiceId: stored.runtime.voiceId,
            runtime: stored.runtime,
            expectedServiceKey
          };
        }

        const error = new Error(`voiceCode not found: ${voiceCode}`);
        error.code = 'VOICE_NOT_FOUND';
        throw error;
      }

      // 从 voiceRegistry 获取完整 runtime 数据
      const rawVoice = voiceRegistry.get(voiceInfo.id);
      if (!rawVoice) {
        const error = new Error(`Voice not found in registry: ${voiceInfo.id}`);
        error.code = 'VOICE_NOT_FOUND';
        throw error;
      }

      // 使用 VoiceNormalizer 提取运行时信息
      const stored = VoiceNormalizer.fromLegacy(rawVoice);
      return {
        voiceCode,
        systemId: voiceInfo.id,
        providerVoiceId: voiceInfo.providerVoiceId || stored.runtime.voiceId,
        runtime: stored.runtime,
        expectedServiceKey
      };
    }

    // 2. systemId 兼容（旧标准，明确的系统ID）
    if (systemId) {
      const rawVoice = voiceRegistry.get(systemId);
      if (!rawVoice) {
        const error = new Error(`System ID not found: ${systemId}`);
        error.code = 'VOICE_NOT_FOUND';
        throw error;
      }

      // 使用 VoiceNormalizer 提取运行时信息
      const stored = VoiceNormalizer.fromLegacy(rawVoice);

      // 检查是否有兼容映射
      const compatMap = loadCompatMap();
      const mappedVoiceCode = compatMap.legacyToVoiceCode[systemId];

      // 推断期望的服务（用于一致性校验）
      let expectedServiceKey = null;
      if (stored.identity.provider && stored.identity.service) {
        // 构建 canonical key 如 "moss_tts"
        expectedServiceKey = `${stored.identity.provider}_${stored.identity.service}`;
      }

      return {
        voiceCode: mappedVoiceCode || stored.identity.voiceCode || null,
        systemId,
        providerVoiceId: stored.runtime.voiceId,
        runtime: stored.runtime,
        expectedServiceKey
      };
    }

    // 3. legacy voiceId 路径（兼容旧请求）
    if (voiceId) {
      // 检查是否是 legacy system_id，如果是，查找对应的 voice_code
      const compatMap = loadCompatMap();
      const mappedVoiceCode = compatMap.legacyToVoiceCode[voiceId];

      const rawVoice = voiceRegistry.get(voiceId);
      if (!rawVoice) {
        const error = new Error(`Voice not found: ${voiceId}`);
        error.code = 'VOICE_NOT_FOUND';
        throw error;
      }

      // 使用 VoiceNormalizer 提取运行时信息
      const stored = VoiceNormalizer.fromLegacy(rawVoice);

      return {
        voiceCode: mappedVoiceCode || stored.identity.voiceCode || null,
        systemId: voiceId,
        providerVoiceId: stored.runtime.voiceId,
        runtime: stored.runtime,
        expectedServiceKey: null
      };
    }

    // 4. 无指定音色，使用默认
    const defaultVoiceId = ttsDefaults.getDefaultVoiceId(service);
    if (defaultVoiceId) {
      return this._resolveVoice({ systemId: defaultVoiceId, service });
    }

    const error = new Error(`No voice specified and no default available for: ${service}`);
    error.code = 'VOICE_NOT_FOUND';
    throw error;
  },

  /**
   * [已移除] _normalizeVoiceRuntime
   * 参数标准化逻辑已迁移到 ParameterResolutionService
   */

  /**
   * [已移除] _buildRuntimeFromConfig
   * 已废弃：使用 VoiceNormalizer.fromLegacy 代替
   */

  /**
   * [已移除] _buildRuntimeOptions
   * 参数合并逻辑已迁移到 ParameterResolutionService
   */

  /**
   * [已移除] validateText
   * 文本校验逻辑已在 TtsValidationService 中实现
   */

  /**
   * [已移除] getDefaults
   * 默认值获取已迁移到 CapabilityResolver
   */
};

module.exports = {
  VoiceResolver
};
