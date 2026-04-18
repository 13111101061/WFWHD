const { ProviderCatalog } = require('../catalog/ProviderCatalog');
const { VoiceCatalog } = require('../catalog/VoiceCatalog');
const { voiceRegistry } = require('../core/VoiceRegistry');
const ttsDefaults = require('../config/ttsDefaults');
const VoiceCodeGenerator = require('../config/VoiceCodeGenerator');

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
      if (rawVoice && rawVoice.provider && rawVoice.service) {
        service = `${rawVoice.provider}_${rawVoice.service}`;
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

    const defaults = ttsDefaults.getDefaults(canonicalKey);

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

    const runtimeOptions = this._buildRuntimeOptions({
      defaults,
      voiceRuntime: resolvedVoice.runtime,
      options,
      providerConfig
    });

    // 关键修复：使用实际目标服务的配置（确保使用 canonical key）
    // 优先使用从 voiceCode/systemId 解析出的服务，其次是用户请求的服务
    const finalServiceKey = resolvedVoice.expectedServiceKey ||
                            ProviderCatalog.resolveCanonicalKey(targetService) ||
                            canonicalKey;
    const finalProviderConfig = ProviderCatalog.get(finalServiceKey) || providerConfig;
    const finalDefaults = ttsDefaults.getDefaults(finalServiceKey) || defaults;

    const finalRuntimeOptions = this._buildRuntimeOptions({
      defaults: finalDefaults,
      voiceRuntime: resolvedVoice.runtime,
      options,
      providerConfig: finalProviderConfig
    });

    return {
      providerKey: finalProviderConfig.provider,
      serviceKey: finalProviderConfig.service,
      adapterKey: finalServiceKey,  // 使用 canonical key
      voiceCode: resolvedVoice.voiceCode,
      voiceId: resolvedVoice.providerVoiceId,  // 供应商真实ID
      systemId: resolvedVoice.systemId,
      voiceRuntime: resolvedVoice.runtime,
      runtimeOptions: finalRuntimeOptions
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
        const matched = allVoices.find(v => v.voiceCode === voiceCode);
        if (matched) {
          return {
            voiceCode,
            systemId: matched.id,
            providerVoiceId: matched.runtime?.voiceId || matched.ttsConfig?.voiceId || matched.ttsConfig?.sourceId,
            runtime: matched.runtime || this._buildRuntimeFromConfig(matched),
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

      return {
        voiceCode,
        systemId: voiceInfo.id,
        providerVoiceId: voiceInfo.providerVoiceId || rawVoice.runtime?.voiceId,
        runtime: rawVoice.runtime || this._buildRuntimeFromConfig(rawVoice),
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

      // 获取 provider_voice_id（runtime.voiceId > ttsConfig.voiceId > sourceId）
      const providerVoiceId = rawVoice.runtime?.voiceId ||
                              rawVoice.ttsConfig?.voiceId ||
                              rawVoice.ttsConfig?.sourceId;

      // 检查是否有兼容映射
      const compatMap = loadCompatMap();
      const mappedVoiceCode = compatMap.legacyToVoiceCode[systemId];

      // 推断期望的服务（用于一致性校验）
      let expectedServiceKey = null;
      if (rawVoice.provider && rawVoice.service) {
        // 构建 canonical key 如 "moss_tts"
        expectedServiceKey = `${rawVoice.provider}_${rawVoice.service}`;
      }

      return {
        voiceCode: mappedVoiceCode || rawVoice.voiceCode || null,
        systemId,
        providerVoiceId,
        runtime: rawVoice.runtime || this._buildRuntimeFromConfig(rawVoice),
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

      const providerVoiceId = rawVoice.runtime?.voiceId || rawVoice.ttsConfig?.voiceId || rawVoice.ttsConfig?.sourceId;

      return {
        voiceCode: mappedVoiceCode || rawVoice.voiceCode || null,
        systemId: voiceId,
        providerVoiceId,
        runtime: rawVoice.runtime || this._buildRuntimeFromConfig(rawVoice),
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

  _normalizeVoiceRuntime(voiceRuntime) {
    if (!voiceRuntime) return {};

    const normalized = { ...voiceRuntime };
    const providerOptions =
      voiceRuntime.providerOptions && typeof voiceRuntime.providerOptions === 'object'
        ? voiceRuntime.providerOptions
        : {};

    // Flatten provider options so existing adapters can consume them without refactor.
    for (const [key, value] of Object.entries(providerOptions)) {
      if (normalized[key] === undefined) {
        normalized[key] = value;
      }
    }

    if (!normalized.voiceId && normalized.voice) {
      normalized.voiceId = normalized.voice;
    }
    if (!normalized.voice && normalized.voiceId) {
      normalized.voice = normalized.voiceId;
    }

    return normalized;
  },

  /**
   * 从ttsConfig构建runtime数据（向后兼容）
   */
  _buildRuntimeFromConfig(rawVoice) {
    const config = rawVoice.ttsConfig || {};
    return {
      voiceId: config.voiceId || config.sourceId || rawVoice.sourceId,
      voice: config.voiceId || config.sourceId || rawVoice.sourceId,
      model: config.model,
      sampleRate: config.sampleRate,
      providerOptions: {
        samplingParams: config.samplingParams || {}
      }
    };
  },

  _buildRuntimeOptions({ defaults, voiceRuntime, options }) {
    const baseOptions = {
      speed: defaults.speed,
      pitch: defaults.pitch,
      volume: defaults.volume,
      format: defaults.format,
      sampleRate: defaults.sampleRate
    };

    const normalizedRuntime = this._normalizeVoiceRuntime(voiceRuntime);

    const merged = {
      ...baseOptions,
      ...normalizedRuntime,
      ...options
    };

    // 关键修复：voice/voiceId 优先使用音色运行时配置（服务商真实ID）
    // 不被前端传入的参数覆盖
    // voiceRuntime.voiceId 即为 provider_voice_id
    if (normalizedRuntime.voiceId || normalizedRuntime.voice) {
      merged.voice = normalizedRuntime.voice || normalizedRuntime.voiceId;
      merged.voiceId = normalizedRuntime.voiceId || normalizedRuntime.voice;
    } else if (!merged.voice) {
      merged.voice = 'default';
      merged.voiceId = merged.voiceId || 'default';
    }

    return merged;
  },

  validateText(text) {
    const { maxLength } = ttsDefaults.textLimits;

    if (!text) {
      const error = new Error('Missing required parameter: text');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (typeof text !== 'string' || text.trim().length === 0) {
      const error = new Error('Text must be a non-empty string');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (text.length > maxLength) {
      const error = new Error(`Text length must not exceed ${maxLength} characters`);
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
  },

  getDefaults(service) {
    const canonicalKey = ProviderCatalog.resolveCanonicalKey(service);
    return canonicalKey ? ttsDefaults.getDefaults(canonicalKey) : { ...ttsDefaults.common };
  }
};

module.exports = {
  VoiceResolver
};
