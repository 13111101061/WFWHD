/**
 * VoiceResolver - 音色身份解析器
 *
 * 职责：
 * - 从请求中解析音色身份（voiceCode > systemId > legacy voiceId）
 * - 支持 voice_code/voiceCode、system_id/systemId、voice_id/voiceId 多种字段名
 * - 与 ProviderCatalog 协作校验 service matching
 *
 * 输出：VoiceIdentity { serviceKey, providerKey, modelKey, systemId, voiceCode, providerVoiceId, voiceRuntime }
 *
 * 参数合并逻辑已迁移到 ParameterResolutionService。
 */

const { ProviderCatalog } = require('../catalog/ProviderCatalog');
const VoiceCodeGenerator = require('../config/VoiceCodeGenerator');
const VoiceNormalizer = require('./VoiceNormalizer');
const CapabilitySchema = require('../schema/CapabilitySchema');

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
 * @property {string} serviceKey - canonical service key (如 "moss_tts")
 * @property {string} providerKey - 服务商标识 (如 "moss")
 * @property {string} modelKey - 模型标识 (如 "moss-tts")
 * @property {string} systemId - 系统音色ID (如 "moss-tts-ashui")
 * @property {string} voiceCode - 15位音色编码 (如 "001000030000005")
 * @property {string} providerVoiceId - 服务商真实音色ID (如 "2001257729754140672")
 * @property {Object} voiceRuntime - 音色运行时配置（来自音色数据，供 ParameterResolutionService 使用）
 */

function extractTopLevelOptions(request = {}) {
  return Object.entries(request).reduce((acc, [key, value]) => {
    if (RESERVED_REQUEST_KEYS.has(key) && value !== undefined) {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});
}

class VoiceResolver {
  /**
   * @param {Object} options
   * @param {Object} options.voiceRegistry - VoiceRegistry 实例
   */
  constructor({ voiceRegistry }) {
    this.registry = voiceRegistry;
  }

  /**
   * Normalize request shape to a single internal contract.
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

    const voiceCode = extractField(request, 'voiceCode', 'voice_code') ||
                      extractField(normalizedOptions, 'voiceCode', 'voice_code');

    const systemId = extractField(request, 'systemId', 'system_id') ||
                     extractField(normalizedOptions, 'systemId', 'system_id');

    const voiceId = pickFirst(
      extractField(request, 'voiceId', 'voice_id'),
      request.voice,
      extractField(normalizedOptions, 'voiceId', 'voice_id'),
      normalizedOptions.voice
    );

    let service = request.service;
    if (!service && voiceCode) {
      const parsed = VoiceCodeGenerator.parse(voiceCode);
      if (parsed && parsed.providerKey && parsed.serviceKey) {
        service = `${parsed.providerKey}_${parsed.serviceKey}`;
      }
    }
    if (!service && systemId) {
      const rawVoice = this.registry.get(systemId);
      const provider = rawVoice?.identity?.provider || rawVoice?.provider;
      const serviceType = rawVoice?.identity?.service || rawVoice?.service;
      if (provider && serviceType) {
        service = `${provider}_${serviceType}`;
      }
    }

    return {
      text: request.text,
      service: service || 'aliyun_qwen_http',
      voiceCode,
      systemId,
      voiceId,
      options: normalizedOptions
    };
  }

  buildServiceKeyFromVoiceCode(parsed) {
    if (!parsed || !parsed.providerKey || !parsed.serviceKey) return null;
    return `${parsed.providerKey}_${parsed.serviceKey}`;
  }

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

    const targetService = voiceCode || systemId ? service : canonicalKey;
    const resolvedVoice = this._resolveVoice({ voiceCode, systemId, voiceId, service: targetService });

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

    const finalServiceKey = resolvedVoice.expectedServiceKey ||
                            ProviderCatalog.resolveCanonicalKey(targetService) ||
                            canonicalKey;
    const finalProviderConfig = ProviderCatalog.get(finalServiceKey) || providerConfig;

    return {
      serviceKey: finalServiceKey,
      providerKey: finalProviderConfig.provider,
      modelKey: resolvedVoice.runtime?.model || 'default',
      systemId: resolvedVoice.systemId,
      voiceCode: resolvedVoice.voiceCode,
      providerVoiceId: resolvedVoice.providerVoiceId,
      voiceRuntime: resolvedVoice.runtime
    };
  }

  // ==================== 私有方法 ====================

  _resolveVoice({ voiceCode, systemId, voiceId, service }) {
    if (voiceCode) return this._resolveByVoiceCode(voiceCode);
    if (systemId) return this._resolveBySystemId(systemId);
    if (voiceId) return this._resolveByLegacyVoice(voiceId);

    const defaultVoiceId = CapabilitySchema.getDefaultVoiceId(service);
    if (defaultVoiceId) return this._resolveBySystemId(defaultVoiceId);

    const error = new Error(`No voice specified and no default available for: ${service}`);
    error.code = 'VOICE_NOT_FOUND';
    throw error;
  }

  _resolveByVoiceCode(voiceCode) {
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

    const expectedServiceKey = this.buildServiceKeyFromVoiceCode(parsed);

    // O(1) 查找：使用 voiceCodeIndex
    const voiceIdByCode = this.registry.voiceCodeIndex.get(voiceCode);
    if (!voiceIdByCode) {
      const error = new Error(`voiceCode not found: ${voiceCode}`);
      error.code = 'VOICE_NOT_FOUND';
      throw error;
    }

    const rawVoice = this.registry.get(voiceIdByCode);
    if (!rawVoice) {
      const error = new Error(`Voice not found in registry: ${voiceIdByCode}`);
      error.code = 'VOICE_NOT_FOUND';
      throw error;
    }

    const stored = VoiceNormalizer.normalize(rawVoice);
    return {
      voiceCode,
      systemId: voiceIdByCode,
      providerVoiceId: stored.runtime.voiceId,
      runtime: stored.runtime,
      expectedServiceKey
    };
  }

  _resolveBySystemId(systemId) {
    const rawVoice = this.registry.get(systemId);
    if (!rawVoice) {
      const error = new Error(`System ID not found: ${systemId}`);
      error.code = 'VOICE_NOT_FOUND';
      throw error;
    }

    const stored = VoiceNormalizer.normalize(rawVoice);
    const compatMap = this.registry.buildCompatMap();
    const mappedVoiceCode = compatMap.legacyToVoiceCode[systemId];

    let expectedServiceKey = null;
    if (stored.identity.provider && stored.identity.service) {
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

  _resolveByLegacyVoice(voiceId) {
    const compatMap = this.registry.buildCompatMap();
    const mappedVoiceCode = compatMap.legacyToVoiceCode[voiceId];

    const rawVoice = this.registry.get(voiceId);
    if (!rawVoice) {
      const error = new Error(`Voice not found: ${voiceId}`);
      error.code = 'VOICE_NOT_FOUND';
      throw error;
    }

    const stored = VoiceNormalizer.normalize(rawVoice);

    return {
      voiceCode: mappedVoiceCode || stored.identity.voiceCode || null,
      systemId: voiceId,
      providerVoiceId: stored.runtime.voiceId,
      runtime: stored.runtime,
      expectedServiceKey: null
    };
  }
}

module.exports = { VoiceResolver };
