/**
 * BaseTtsAdapter - TTS提供者适配器基类
 *
 * 所有TTS提供者适配器都应继承此类
 * 实现端口: ITtsProvider
 */

const { audioStorageManager } = require('../../../../shared/utils/audioStorage');

class BaseTtsAdapter {
  /**
   * @param {Object} config
   * @param {string} config.provider - 提供商标识
   * @param {string} config.serviceType - 服务类型
   * @param {Object} config.credentials - 认证凭据
   */
  constructor(config = {}) {
    this.provider = config.provider || 'unknown';
    this.serviceType = config.serviceType || 'default';
    this.credentials = config.credentials || {};
    this.timeout = config.timeout || 30000;
    this.audioStorage = audioStorageManager;
  }

  /**
   * 执行TTS合成（子类必须实现）
   * @param {string} text - 要转换的文本
   * @param {Object} options - 转换选项
   * @returns {Promise<Object>} 转换结果
   */
  async synthesize(text, options = {}) {
    throw new Error('synthesize() must be implemented by subclass');
  }

  /**
   * 获取可用音色列表
   * @returns {Promise<Array>} 音色列表
   */
  async getAvailableVoices() {
    // 默认返回空数组，子类可覆盖
    return [];
  }

  /**
   * 获取服务状态
   * @returns {Object} 状态信息
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
   * @param {string} text
   */
  validateText(text) {
    if (!text || typeof text !== 'string') {
      throw this._createError('VALIDATION_ERROR', 'Text must be a non-empty string');
    }
    if (text.trim().length === 0) {
      throw this._createError('VALIDATION_ERROR', 'Text cannot be empty');
    }
    if (text.length > 10000) {
      throw this._createError('VALIDATION_ERROR', 'Text too long, maximum 10000 characters allowed');
    }
  }

  /**
   * 创建错误对象
   */
  _createError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.provider = this.provider;
    error.serviceType = this.serviceType;
    Object.assign(error, details);
    return error;
  }

  /**
   * 保存音频结果
   */
  async _saveAudioResult(audioBuffer, metadata) {
    return this.audioStorage.saveAudio(audioBuffer, {
      provider: this.provider,
      serviceType: this.serviceType,
      ...metadata
    });
  }
}

module.exports = BaseTtsAdapter;