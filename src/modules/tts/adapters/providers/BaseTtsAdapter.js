/**
 * BaseTtsAdapter - TTS服务商适配器基类
 *
 * 所有TTS服务商适配器都应继承此类
 * 实现 ITtsProvider 端口接口
 */

const { audioStorageManager } = require('../../../../shared/utils/audioStorage');
const { voiceRegistry } = require('../../core/VoiceRegistry');
const credentials = require('../../../credentials');

class BaseTtsAdapter {
  /**
   * @param {Object} config
   * @param {string} config.provider - 提供商标识
   * @param {string} config.serviceType - 服务类型
   */
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
  }

  /**
   * 获取服务商凭证
   */
  _getCredentials() {
    return credentials.getCredentials(this.provider);
  }

  /**
   * 获取服务配置
   */
  _getServiceConfig() {
    return credentials.getServiceConfig(this.provider, this.serviceType);
  }

  /**
   * 检查凭证是否已配置
   */
  _hasCredentials() {
    return credentials.isConfigured(this.provider);
  }

  /**
   * 检查服务是否可用
   */
  _isServiceAvailable() {
    return credentials.isServiceAvailable(this.provider, this.serviceType);
  }

  /**
 * 执行TTS合成（子类必须实现）
 * 返回 { audio: Buffer, format: string }
 */
async synthesize(text, options = {}) {
    throw new Error(`synthesize() must be implemented by ${this.constructor.name}`);
  }

  /**
   * 合成并保存（返回URL）
   * @param {string} text
   * @param {Object} options
   * @returns {Promise<{url: string, format: string, size: number}>}
   */
  async synthesizeAndSave(text, options = {}) {
    const result = await this.synthesize(text, options);

    // URL模式：API已返回音频URL，无需保存
    if (result.audioUrl) {
      return {
        url: result.audioUrl,
        format: result.format,
        size: 0, // 云端文件，无法获取大小
        audioId: result.audioId,
        isRemote: true // 标记为远程URL
      };
    }

    // 二进制模式：保存到本地文件
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
      isRemote: false // 标记为本地URL
    };
  }

  /**
   * 获取可用音色列表
   */
  async getAvailableVoices() {
    const voices = voiceRegistry.getByProviderAndService(this.provider, this.serviceType);

    if (voices.length === 0) {
      return this.getFallbackVoices();
    }

    return voices.map(v => this._mapVoice(v));
  }

  /**
   * 备用音色列表（子类可覆盖）
   */
  getFallbackVoices() {
    return [];
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      provider: this.provider,
      serviceType: this.serviceType,
      status: 'active',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 验证文本
   */
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

  /**
   * 验证选项（子类可覆盖）
   */
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

  /**
   * 映射音色格式
   */
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

  /**
   * 创建错误
   */
  _error(code, message) {
    const error = new Error(message);
    error.code = code;
    error.provider = this.provider;
    error.serviceType = this.serviceType;
    return error;
  }

  /**
   * 延迟
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 带重试的执行
   */
  async _retry(fn, maxRetries = this.config.maxRetries) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
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