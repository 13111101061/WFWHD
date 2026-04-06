const { ProviderCatalog } = require('../catalog/ProviderCatalog');
const { VoiceCatalog } = require('../catalog/VoiceCatalog');
const ttsDefaults = require('../config/ttsDefaults');

const RESERVED_REQUEST_KEYS = new Set(['text', 'service', 'voice', 'voiceId', 'options']);

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function extractTopLevelOptions(request = {}) {
  return Object.entries(request).reduce((acc, [key, value]) => {
    if (!RESERVED_REQUEST_KEYS.has(key) && value !== undefined) {
      acc[key] = value;
    }
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

    const voiceId = pickFirst(
      request.voiceId,
      request.voice,
      normalizedOptions.voiceId,
      normalizedOptions.voice
    );

    return {
      text: request.text,
      service: request.service || ttsDefaults.defaultService,
      voiceId,
      options: normalizedOptions
    };
  },

  resolve(request) {
    const normalized = this.normalizeRequest(request);
    const { service, voiceId, options = {} } = normalized;

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
    let effectiveVoiceId = voiceId || ttsDefaults.getDefaultVoiceId(canonicalKey);
    const voiceRuntime = effectiveVoiceId ? VoiceCatalog.getRuntime(effectiveVoiceId) : null;

    const runtimeOptions = this._buildRuntimeOptions({
      defaults,
      voiceRuntime,
      options,
      providerConfig
    });

    return {
      providerKey: providerConfig.provider,
      serviceKey: providerConfig.service,
      adapterKey: canonicalKey,
      voiceId: effectiveVoiceId,
      voiceRuntime,
      runtimeOptions
    };
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

    if (!merged.voice && merged.voiceId) {
      merged.voice = merged.voiceId;
    }
    if (!merged.voiceId && merged.voice) {
      merged.voiceId = merged.voice;
    }

    if (!merged.voice) {
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
