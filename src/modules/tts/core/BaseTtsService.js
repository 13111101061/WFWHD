const { audioStorageManager } = require('../../../shared/utils/audioStorage');
const TtsException = require('./TtsException');
const { voiceModelRegistry } = require('../config/VoiceModelRegistry');

/**
 * TTS服务基础抽象类
 * 为所有TTS服务提供统一的接口和基础功能
 */
class BaseTtsService {
  constructor(config = {}) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };

    // 音频存储管理器
    this.audioStorage = audioStorageManager;

    // 服务提供商和类型
    this.provider = config.provider || null;
    this.serviceType = config.serviceType || null;
  }

  /**
   * 文本转语音 - 抽象方法，子类必须实现
   * @param {string} text - 要转换的文本
   * @param {Object} options - 转换选项
   * @returns {Promise<Object>} 转换结果
   */
  async synthesize(text, options = {}) {
    throw TtsException.ConfigError('synthesize method must be implemented by subclass');
  }

  /**
   * 获取可用音色列表 - 从音色工厂统一获取
   * 所有子服务类继承此方法，自动从 VoiceModelRegistry 获取音色
   * @returns {Promise<Array>} 音色列表
   */
  async getAvailableVoices() {
    try {
      // 确保音色工厂已初始化
      if (!voiceModelRegistry.isLoaded) {
        await voiceModelRegistry.initialize();
      }

      // 验证 provider 和 serviceType 是否已设置
      if (!this.provider || !this.serviceType) {
        console.warn(`${this.constructor.name}: provider 或 serviceType 未设置，无法从音色工厂获取音色`);
        return this.getHardcodedVoices();
      }

      // 从音色工厂获取该服务商的所有音色
      const models = voiceModelRegistry.getModelsByProvider(this.provider);

      // 过滤出当前服务类型的音色
      const filteredModels = models.filter(m => m.service === this.serviceType);

      if (filteredModels.length === 0) {
        console.warn(`${this.constructor.name}: 在音色工厂中未找到 ${this.provider}/${this.serviceType} 的音色配置`);
        return this.getHardcodedVoices();
      }

      // 映射为统一格式
      return filteredModels.map(model => ({
        id: model.voiceId,              // 提供商ID（向后兼容）
        systemId: model.id,             // 系统ID（全局唯一）
        name: model.name,
        gender: model.gender,
        language: model.languages && model.languages[0] || 'zh-CN',
        languages: model.languages,
        tags: model.tags || [],
        description: model.description,
        model: model.model,
        _modelInfo: model               // 完整模型信息
      }));

    } catch (error) {
      console.error(`${this.constructor.name}: 从音色工厂获取音色失败:`, error.message);
      return this.getHardcodedVoices();
    }
  }

  /**
   * 获取硬编码音色列表 - 降级方案
   * 子类可以覆盖此方法提供备用音色数据
   * @returns {Array} 硬编码音色列表
   */
  getHardcodedVoices() {
    console.warn(`${this.constructor.name}: 使用降级方案，返回空音色列表`);
    return [];
  }

  /**
   * 获取支持的模型列表
   * @returns {Array<string>} 模型列表
   */
  getSupportedModels() {
    return [];
  }

  /**
   * 验证输入文本
   * @param {string} text - 输入文本
   * @returns {boolean} 验证结果
   */
  validateText(text) {
    if (!text || typeof text !== 'string') {
      throw TtsException.TextValidationError('Invalid text parameter');
    }

    if (text.trim().length === 0) {
      throw TtsException.TextValidationError('Text cannot be empty');
    }

    if (text.length > 10000) {
      throw TtsException.TextValidationError('Text too long, maximum 10000 characters allowed');
    }

    return true;
  }

  /**
   * 验证选项参数 - 使用ParameterMapper进行配置驱动验证
   * @param {Object} options - 选项参数
   * @returns {Object} 验证和映射后的参数
   */
  validateOptions(options = {}) {
    const { parameterMapper } = require('../config/ParameterMapper');

    // 确保ParameterMapper已初始化
    if (!parameterMapper.loaded) {
      parameterMapper.initialize();
    }

    // 使用ParameterMapper进行验证和映射
    try {
      const apiParams = parameterMapper.mapAndValidate(
        this.provider,
        this.serviceType,
        options
      );
      return apiParams;
    } catch (error) {
      // 如果是服务商或服务不支持，回退到基础验证
      if (error.code === 'NOT_FOUND') {
        return this.fallbackValidation(options);
      }
      throw error;
    }
  }

  /**
   * 回退验证（当配置不可用时）
   * @private
   */
  fallbackValidation(options = {}) {
    const { voice, speed, pitch, volume, format, sample_rate } = options;

    // 使用宽松的范围验证（支持所有服务商）
    if (speed !== undefined) {
      if (typeof speed !== 'number' || speed < 0 || speed > 5.0) {
        throw TtsException.BadRequest('Speed must be between 0 and 5.0');
      }
    }

    if (pitch !== undefined) {
      if (typeof pitch !== 'number' || pitch < -12 || pitch > 12) {
        throw TtsException.BadRequest('Pitch must be between -12 and 12');
      }
    }

    if (volume !== undefined) {
      if (typeof volume !== 'number' || volume < 0 || volume > 100) {
        throw TtsException.BadRequest('Volume must be between 0 and 100');
      }
    }

    if (sample_rate !== undefined) {
      const validRates = [8000, 16000, 22050, 24000, 32000, 44100, 48000];
      if (!validRates.includes(sample_rate)) {
        throw TtsException.BadRequest(`Invalid sample rate. Valid rates: ${validRates.join(', ')}`);
      }
    }

    if (format !== undefined) {
      const validFormats = ['mp3', 'wav', 'pcm', 'flac'];
      if (!validFormats.includes(format.toLowerCase())) {
        throw TtsException.BadRequest(`Invalid format. Valid formats: ${validFormats.join(', ')}`);
      }
    }

    return options;
  }

  /**
   * 带重试的请求执行
   * @param {Function} requestFn - 请求函数
   * @param {string} operation - 操作名称
   * @returns {Promise} 请求结果
   */
  async executeWithRetry(requestFn, operation = 'TTS operation') {
    let lastError;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;

        // 如果是最后一次尝试，直接抛出错误
        if (attempt === this.config.maxRetries) {
          break;
        }

        // 如果是客户端错误（4xx），不进行重试
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          break;
        }

        // 等待后重试
        await this.delay(this.config.retryDelay * attempt);
        console.warn(`Retry attempt ${attempt}/${this.config.maxRetries} for ${operation}: ${error.message}`);
      }
    }

    throw lastError;
  }

  /**
   * 延迟函数
   * @param {number} ms - 延迟毫秒数
   * @returns {Promise}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 生成唯一的任务ID
   * @returns {string} 任务ID
   */
  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 保存音频文件的便捷方法
   * @param {Buffer|string} audioData - 音频数据
   * @param {string} text - 原始文本（用于生成文件名）
   * @param {string} extension - 文件扩展名
   * @param {Object} options - 额外选项
   * @returns {Promise<Object>} 保存结果
   */
  async saveAudioFile(audioData, text, extension = 'mp3', options = {}) {
    return await this.audioStorage.saveAudioFile(audioData, {
      extension,
      metadata: {
        service: this.constructor.name,
        text: text ? text.substring(0, 50) : '',
        taskId: this.generateTaskId(),
        ...options
      },
      subDir: options.subDir || this.constructor.name.toLowerCase()
    });
  }

  /**
   * 清理文件名（保留用于向后兼容）
   * @param {string} filename - 文件名
   * @returns {string} 清理后的文件名
   */
  sanitizeFilename(filename) {
    return this.audioStorage.generateSafeFilename(filename, 'mp3');
  }

  /**
   * 记录操作日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: this.constructor.name,
      message,
      ...data
    };

    if (level === 'error') {
      console.error(`[${timestamp}] [${level.toUpperCase()}] [${this.constructor.name}] ${message}`, data);
    } else if (level === 'warn') {
      console.warn(`[${timestamp}] [${level.toUpperCase()}] [${this.constructor.name}] ${message}`, data);
    } else {
      console.log(`[${timestamp}] [${level.toUpperCase()}] [${this.constructor.name}] ${message}`, data);
    }
  }

  /**
   * 改进的错误处理方法，包含请求 ID 追踪和详细上下文
   * @param {Error} error - 原始错误
   * @param {Object} context - 错误上下文
   * @param {string} context.requestId - 请求 ID
   * @param {string} context.operation - 操作名称
   * @param {Object} context.params - 相关参数
   * @returns {TtsException} 增强的 TTS 异常
   */
  handleError(error, context = {}) {
    const {
      requestId = 'unknown',
      operation = 'unknown',
      params = {},
      originalError = null
    } = context;

    // 记录详细的错误日志
    this.log('error', `${this.provider}/${this.serviceType} error in ${operation}`, {
      requestId,
      errorType: error.constructor.name,
      errorMessage: error.message,
      errorStack: error.stack?.split('\n').slice(0, 3).join('\n'), // 只保留前3行堆栈
      params: this.sanitizeParams(params),
      originalError: originalError?.message
    });

    // 根据错误类型转换为 TtsException
    if (error instanceof TtsException) {
      // 如果已经是 TtsException，添加请求 ID
      error.requestId = requestId;
      return error;
    }

    // 根据错误消息分类
    let ttsException;
    const message = error.message.toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      ttsException = TtsException.TimeoutError(error.message);
    } else if (message.includes('network') || message.includes('econnrefused') || message.includes('enotfound')) {
      ttsException = TtsException.NetworkError(error.message);
    } else if (message.includes('api') && message.includes('key')) {
      ttsException = TtsException.ConfigError(error.message);
    } else if (message.includes('rate limit') || message.includes('too many')) {
      ttsException = TtsException.RateLimitError(error.message);
    } else if (message.includes('validation') || message.includes('invalid')) {
      ttsException = TtsException.BadRequest(error.message);
    } else {
      ttsException = TtsException.SynthesisFailed(
        `${this.provider} synthesis failed: ${error.message}`
      );
    }

    // 添加请求 ID 和上下文
    ttsException.requestId = requestId;
    ttsException.provider = this.provider;
    ttsException.serviceType = this.serviceType;
    ttsException.operation = operation;

    return ttsException;
  }

  /**
   * 清理敏感参数（用于日志记录）
   * @param {Object} params - 原始参数
   * @returns {Object} 清理后的参数
   */
  sanitizeParams(params) {
    const sanitized = { ...params };
    const sensitiveKeys = ['apiKey', 'api_key', 'secretKey', 'secret_key', 'token', 'password'];

    for (const key of sensitiveKeys) {
      if (sanitized[key]) {
        sanitized[key] = '***REDACTED***';
      }
    }

    return sanitized;
  }

  /**
   * 格式化统一响应对象
   * @param {Object} params - 响应参数
   * @param {Object} params.audioFile - 音频文件对象 (包含 url, path, filename)
   * @param {string} params.text - 原始文本
   * @param {Object} params.apiParams - API参数
   * @param {Object} params.extraInfo - 额外信息 (duration, fileSize, etc)
   * @returns {Object} 统一格式的响应
   */
  formatResponse({ audioFile, text, apiParams, extraInfo = {} }) {
    return {
      text: text,
      audioUrl: audioFile.url,
      filePath: audioFile.path,
      fileName: audioFile.filename,
      provider: this.provider,
      serviceType: this.serviceType,
      voice: apiParams.voice_id || apiParams.voice || 'unknown',
      model: apiParams.model || this.config.model || 'unknown',
      duration: extraInfo.duration || null,
      fileSize: extraInfo.fileSize || null,
      format: apiParams.format || 'mp3',
      sampleRate: apiParams.sample_rate || 32000,
      traceId: extraInfo.traceId || null,
      timestamp: new Date().toISOString(),
      _metadata: {
        ...extraInfo,
        provider: this.provider
      }
    };
  }

  /**
   * 获取服务状态
   * @returns {Object} 服务状态信息
   */
  getStatus() {
    return {
      service: this.constructor.name,
      config: this.config,
      status: 'active',
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = BaseTtsService;