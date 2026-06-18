const { audioStorageManager, getProviderCode } = require('../../../shared/utils/audioStorage');
const credentials = require('../../credentials');
const { CapabilitySchema } = require('../schema/CapabilitySchema');
const VoiceNormalizer = require('../application/VoiceNormalizer');

class BaseTtsAdapter {
  constructor(config = {}) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };

    this.audioStorage = audioStorageManager;
    this.provider = config.provider || 'unknown';
    this.serviceType = config.serviceType || 'default';
    this.voiceRegistry = config.voiceRegistry || null;
    this._providerCode = getProviderCode(this.provider);
  }

  /**
   * 获取凭证（无副作用，不写实例状态）
   * @returns {{ credentials: Object|null, accountId: string|null }}
   */
  _getCredentials(context = {}) {
    if (credentials.selectCredentials) {
      const result = credentials.selectCredentials(
        this.provider,
        this.serviceType,
        context
      );
      if (result) {
        return { credentials: result.credentials, accountId: result.accountId };
      }
    }

    return { credentials: credentials.getCredentials(this.provider), accountId: null };
  }

  _getServiceConfig() {
    return credentials.getServiceConfig(this.provider, this.serviceType);
  }

  _hasCredentials() {
    return credentials.isConfigured(this.provider);
  }

  _isServiceAvailable() {
    return credentials.isServiceAvailable(this.provider, this.serviceType);
  }

  _reportSuccess(accountId) {
    if (accountId && credentials.reportSuccess) {
      credentials.reportSuccess(this.provider, accountId, this.serviceType);
    }
  }

  _reportFailure(accountId, error) {
    if (accountId && credentials.reportFailure) {
      credentials.reportFailure(this.provider, accountId, this.serviceType, error);
    }
  }

  async synthesize(text, options = {}, providerInput = null, signal = null) {
    throw new Error(`synthesize() must be implemented by ${this.constructor.name}`);
  }

  _extractResultMetadata(result = {}) {
    const excluded = new Set(['audio', 'audioUrl', 'format', 'provider', 'serviceType']);
    return Object.entries(result).reduce((acc, [key, value]) => {
      if (!excluded.has(key) && value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});
  }

  async synthesizeAndSave(text, options = {}, providerInput = null, signal = null) {
    const result = await this.synthesize(text, options, providerInput, signal);
    const metadata = this._extractResultMetadata(result);

    if (result.audioUrl) {
      return {
        url: result.audioUrl,
        format: result.format,
        size: 0,
        isRemote: true,
        ...metadata
      };
    }

    const saved = await this.audioStorage.saveAudioFile(result.audio, {
      extension: result.format || 'mp3',
      metadata: {
        provider: this.provider,
        service: this.serviceType,
        text: text.substring(0, 50),
        nameFormat: 'structured',
        type: 'syn',
        providerCode: this._providerCode
      }
    });

    return {
      url: saved.url,
      format: result.format,
      size: saved.size,
      filePath: saved.filePath,
      isRemote: false,
      ...metadata
    };
  }

  async getAvailableVoices() {
    if (!this.voiceRegistry) return this.getFallbackVoices();
    const voices = this.voiceRegistry.getByProviderAndService(this.provider, this.serviceType);
    if (voices.length === 0) return this.getFallbackVoices();
    return voices.map(v => VoiceNormalizer.toAdapterFormat(v));
  }

  getFallbackVoices() {
    return [];
  }

  getStatus() {
    return {
      provider: this.provider,
      serviceType: this.serviceType,
      status: 'active',
      timestamp: new Date().toISOString()
    };
  }

  validateText(text) {
    const maxLength = CapabilitySchema.platform.maxTextLength || 10000;

    if (!text || typeof text !== 'string') {
      const error = new Error('Text must be a non-empty string');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    if (text.trim().length === 0) {
      const error = new Error('Text cannot be empty');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    if (text.length > maxLength) {
      const error = new Error(`Text too long, maximum ${maxLength} characters`);
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
  }

  /**
   * 验证选项参数（改造后）
   *
   * 不再设置默认值，默认值由 ParameterResolutionService 处理
   * 只做基础的参数校验和透传
   *
   * @param {Object} options - 已映射的服务商参数
   * @returns {Object} 验证后的参数
   */
  validateOptions(options) {
    // 不再设置默认值，只透传参数
    // 默认值由 ParameterResolutionService 统一处理
    return { ...options };
  }

  _getNestedValue(obj, path) {
    if (!obj || !path) return undefined;

    const parts = Array.isArray(path) ? path : String(path).split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined || !Object.prototype.hasOwnProperty.call(current, part)) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  _pickOption(options, candidates = []) {
    for (const candidate of candidates) {
      const value = this._getNestedValue(options, candidate);
      if (value !== undefined && value !== null) {
        return value;
      }
    }

    return undefined;
  }

  /**
   * [已废弃] _extractResultMetadata
   * 此方法已移动到 synthesizeAndSave 内部使用
   */

  _error(code, message) {
    const error = new Error(message);
    error.code = code;
    error.provider = this.provider;
    error.serviceType = this.serviceType;
    return error;
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * @forbidden 重试由 ExecutionPolicy 统一管理，适配器层禁止自行重试。
   *            调用此方法会直接抛出错误，避免双重重试导致计费/熔断/指标异常。
   */
  async _retry() {
    throw new Error('Adapter-level retry forbidden; use ExecutionPolicy for retry management');
  }
}

module.exports = BaseTtsAdapter;
