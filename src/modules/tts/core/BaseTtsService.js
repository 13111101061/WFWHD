const { audioStorageManager } = require('../../../shared/utils/audioStorage');
const TtsException = require('./TtsException');
const { voiceManager } = require('./VoiceManager');

/**
 * TTS服务基础抽象类（v2.0）
 * 集成VoiceManager统一管理音色配置
 */
class BaseTtsService {
  constructor(config = {}) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };

    this.audioStorage = audioStorageManager;
    this.provider = config.provider || null;
    this.serviceType = config.serviceType || null;
  }

  async synthesize(text, options = {}) {
    throw TtsException.ConfigError('synthesize method must be implemented by subclass');
  }

  /**
   * 获取可用音色列表（v2.0 - 使用VoiceManager）
   */
  async getAvailableVoices() {
    try {
      // 1. 等待VoiceManager就绪（事件驱动）
      const ready = await voiceManager.waitForReady(5000);

      if (!ready) {
        console.warn(`${this.constructor.name}: VoiceManager not ready after 5s, using fallback`);
        return this.getHardcodedVoices();
      }

      // 2. 检查provider和serviceType
      if (!this.provider || !this.serviceType) {
        console.warn(`${this.constructor.name}: provider or serviceType not set`);
        return this.getHardcodedVoices();
      }

      // 3. 从VoiceManager获取音色
      const voices = voiceManager.getByProviderAndService(this.provider, this.serviceType);

      if (voices.length === 0) {
        console.warn(`${this.constructor.name}: No voices found for ${this.provider}/${this.serviceType}, using fallback`);
        return this.getHardcodedVoices();
      }

      // 4. 映射为统一格式（向后兼容）
      return voices.map(v => ({
        id: v.sourceId,              // 提供商原始ID
        systemId: v.id,              // 全局唯一ID
        name: v.displayName,
        gender: v.gender,
        language: v.languages?.[0] || 'zh-CN',
        languages: v.languages,
        tags: v.tags || [],
        description: v.description,
        preview: v.preview,
        ttsConfig: v.ttsConfig,
        _modelInfo: v               // 完整信息
      }));

    } catch (error) {
      console.error(`${this.constructor.name}: Failed to get voices from VoiceManager:`, error.message);
      return this.getHardcodedVoices();
    }
  }

  /**
   * 通过systemId获取完整音色信息
   */
  async getVoiceById(systemId) {
    try {
      await voiceManager.waitForReady(5000);
      const voice = voiceManager.getById(systemId);
      
      if (!voice) {
        throw TtsException.NotFound(`Voice not found: ${systemId}`);
      }
      
      return {
        id: voice.sourceId,
        systemId: voice.id,
        name: voice.displayName,
        gender: voice.gender,
        language: voice.languages?.[0] || 'zh-CN',
        languages: voice.languages,
        tags: voice.tags || [],
        description: voice.description,
        ttsConfig: voice.ttsConfig,
        _modelInfo: voice
      };
    } catch (error) {
      throw TtsException.ConfigError(`Failed to get voice ${systemId}: ${error.message}`);
    }
  }

  /**
   * 硬编码音色列表 - 降级方案
   * 子类可覆盖以提供特定降级数据
   */
  getHardcodedVoices() {
    console.warn(`${this.constructor.name}: Using hardcoded fallback voices`);
    return [];
  }

  getSupportedModels() {
    return [];
  }

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

  validateOptions(options = {}) {
    const { parameterMapper } = require('../config/ParameterMapper');

    if (!parameterMapper.loaded) {
      parameterMapper.initialize();
    }

    try {
      const apiParams = parameterMapper.mapAndValidate(
        this.provider,
        this.serviceType,
        options
      );
      return apiParams;
    } catch (error) {
      if (error.code === 'NOT_FOUND') {
        return this.fallbackValidation(options);
      }
      throw error;
    }
  }

  fallbackValidation(options = {}) {
    const { voice, speed, pitch, volume, format, sample_rate } = options;

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

  async executeWithRetry(requestFn, operation = 'TTS operation') {
    let lastError;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;

        if (attempt === this.config.maxRetries) {
          break;
        }

        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          break;
        }

        await this.delay(this.config.retryDelay * attempt);
        console.warn(`Retry attempt ${attempt}/${this.config.maxRetries} for ${operation}: ${error.message}`);
      }
    }

    throw lastError;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

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

  sanitizeFilename(filename) {
    return this.audioStorage.generateSafeFilename(filename, 'mp3');
  }

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

  handleError(error, context = {}) {
    const {
      requestId = 'unknown',
      operation = 'unknown',
      params = {},
      originalError = null
    } = context;

    this.log('error', `${this.provider}/${this.serviceType} error in ${operation}`, {
      requestId,
      errorType: error.constructor.name,
      errorMessage: error.message,
      errorStack: error.stack?.split('\n').slice(0, 3).join('\n'),
      params: this.sanitizeParams(params),
      originalError: originalError?.message
    });

    if (error instanceof TtsException) {
      error.requestId = requestId;
      return error;
    }

    const message = error.message.toLowerCase();

    let ttsException;
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
      ttsException = TtsException.SynthesisFailed(`${this.provider} synthesis failed: ${error.message}`);
    }

    ttsException.requestId = requestId;
    ttsException.provider = this.provider;
    ttsException.serviceType = this.serviceType;
    ttsException.operation = operation;

    return ttsException;
  }

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

  getStatus() {
    return {
      service: this.constructor.name,
      config: {
        provider: this.provider,
        serviceType: this.serviceType,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries
      },
      status: 'active',
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = BaseTtsService;
