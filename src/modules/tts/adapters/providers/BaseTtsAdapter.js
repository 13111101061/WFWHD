const { audioStorageManager } = require('../../../../shared/utils/audioStorage');
const { voiceRegistry } = require('../../core/VoiceRegistry');
const credentials = require('../../../credentials');

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
    this._currentAccountId = null;
  }

  _getCredentials(context = {}) {
    if (credentials.selectCredentials) {
      const result = credentials.selectCredentials(
        this.provider,
        this.serviceType,
        context
      );
      if (result) {
        this._currentAccountId = result.accountId;
        return result.credentials;
      }
    }

    this._currentAccountId = null;
    return credentials.getCredentials(this.provider);
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

  _reportSuccess() {
    if (this._currentAccountId && credentials.reportSuccess) {
      credentials.reportSuccess(this.provider, this._currentAccountId, this.serviceType);
    }
  }

  _reportFailure(error) {
    if (this._currentAccountId && credentials.reportFailure) {
      credentials.reportFailure(this.provider, this._currentAccountId, this.serviceType, error);
    }
  }

  async synthesize(text, options = {}) {
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

  async synthesizeAndSave(text, options = {}) {
    const result = await this.synthesize(text, options);
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
        text: text.substring(0, 50)
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
    const voices = voiceRegistry.getByProviderAndService(this.provider, this.serviceType);
    if (voices.length === 0) return this.getFallbackVoices();
    return voices.map(v => this._mapVoice(v));
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
    if (text.length > 10000) {
      const error = new Error('Text too long, maximum 10000 characters');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
  }

  validateOptions(options) {
    return {
      voice: options.voice || 'default',
      speed: options.speed || 1.0,
      pitch: options.pitch || 1.0,
      volume: options.volume || 50,
      format: options.format || 'mp3',
      sampleRate: options.sampleRate || 16000,
      ...options
    };
  }

  _mapVoice(v) {
    return {
      id: v.sourceId || v.id,
      systemId: v.id,
      name: v.displayName || v.name,
      gender: v.gender,
      language: v.languages?.[0] || 'zh-CN',
      languages: v.languages || ['zh-CN'],
      tags: v.tags || [],
      description: v.description,
      ttsConfig: v.ttsConfig || {}
    };
  }

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

  async _retry(fn, maxRetries = this.config.maxRetries) {
    let lastError;
    for (let i = 0; i < maxRetries; i += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          await this._delay(this.config.retryDelay * (i + 1));
        }
      }
    }
    throw lastError;
  }
}

module.exports = BaseTtsAdapter;
