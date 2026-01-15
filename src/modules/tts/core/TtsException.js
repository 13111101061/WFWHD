/**
 * TTS服务异常类
 * 统一的异常处理机制
 */
class TtsException extends Error {
  constructor(message, code = 'TTS_ERROR', statusCode = 500, details = {}) {
    super(message);
    this.name = 'TtsException';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  /**
   * 转换为JSON响应格式
   * @returns {Object} JSON响应对象
   */
  toJSON() {
    return {
      success: false,
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp
    };
  }

  /**
   * 创建参数错误异常
   * @param {string} message - 错误消息
   * @param {Object} details - 错误详情
   * @returns {TtsException} 异常实例
   */
  static BadRequest(message, details = {}) {
    return new TtsException(message, 'BAD_REQUEST', 400, details);
  }

  /**
   * 创建未授权异常
   * @param {string} message - 错误消息
   * @param {Object} details - 错误详情
   * @returns {TtsException} 异常实例
   */
  static Unauthorized(message, details = {}) {
    return new TtsException(message, 'UNAUTHORIZED', 401, details);
  }

  /**
   * 创建禁止访问异常
   * @param {string} message - 错误消息
   * @param {Object} details - 错误详情
   * @returns {TtsException} 异常实例
   */
  static Forbidden(message, details = {}) {
    return new TtsException(message, 'FORBIDDEN', 403, details);
  }

  /**
   * 创建资源未找到异常
   * @param {string} message - 错误消息
   * @param {Object} details - 错误详情
   * @returns {TtsException} 异常实例
   */
  static NotFound(message, details = {}) {
    return new TtsException(message, 'NOT_FOUND', 404, details);
  }

  /**
   * 创建请求超时异常
   * @param {string} message - 错误消息
   * @param {Object} details - 错误详情
   * @returns {TtsException} 异常实例
   */
  static Timeout(message, details = {}) {
    return new TtsException(message, 'TIMEOUT', 408, details);
  }

  /**
   * 创建服务不可用异常
   * @param {string} message - 错误消息
   * @param {Object} details - 错误详情
   * @returns {TtsException} 异常实例
   */
  static ServiceUnavailable(message, details = {}) {
    return new TtsException(message, 'SERVICE_UNAVAILABLE', 503, details);
  }

  /**
   * 创建速率限制异常
   * @param {string} message - 错误消息
   * @param {Object} details - 错误详情
   * @returns {TtsException} 异常实例
   */
  static RateLimited(message, details = {}) {
    return new TtsException(message, 'RATE_LIMITED', 429, details);
  }

  /**
   * 创建配额超限异常
   * @param {string} message - 错误消息
   * @param {Object} details - 错误详情
   * @returns {TtsException} 异常实例
   */
  static QuotaExceeded(message, details = {}) {
    return new TtsException(message, 'QUOTA_EXCEEDED', 429, details);
  }

  /**
   * 创建音频生成失败异常
   * @param {string} message - 错误消息
   * @param {Object} details - 错误详情
   * @returns {TtsException} 异常实例
   */
  static SynthesisFailed(message, details = {}) {
    return new TtsException(message, 'SYNTHESIS_FAILED', 500, details);
  }

  /**
   * 创建配置错误异常
   * @param {string} message - 错误消息
   * @param {Object} details - 错误详情
   * @returns {TtsException} 异常实例
   */
  static ConfigError(message, details = {}) {
    return new TtsException(message, 'CONFIG_ERROR', 500, details);
  }

  /**
   * 创建网络错误异常
   * @param {string} message - 错误消息
   * @param {Object} details - 错误详情
   * @returns {TtsException} 异常实例
   */
  static NetworkError(message, details = {}) {
    return new TtsException(message, 'NETWORK_ERROR', 500, details);
  }

  /**
   * 创建音频格式错误异常
   * @param {string} message - 错误消息
   * @param {Object} details - 错误详情
   * @returns {TtsException} 异常实例
   */
  static AudioFormatError(message, details = {}) {
    return new TtsException(message, 'AUDIO_FORMAT_ERROR', 400, details);
  }

  /**
   * 创建文本验证错误异常
   * @param {string} message - 错误消息
   * @param {Object} details - 错误详情
   * @returns {TtsException} 异常实例
   */
  static TextValidationError(message, details = {}) {
    return new TtsException(message, 'TEXT_VALIDATION_ERROR', 400, details);
  }
}

module.exports = TtsException;