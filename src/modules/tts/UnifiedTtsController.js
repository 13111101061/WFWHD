const { ttsServiceManager } = require('./core/TtsServiceManager');
const TtsException = require('./core/TtsException');
const path = require('path');

/**
 * 统一TTS控制器
 * 提供统一的TTS服务调用接口
 */
class UnifiedTtsController {
  constructor() {
    this.serviceManager = ttsServiceManager;
  }

  /**
   * TTS文本转语音
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async synthesize(req, res) {
    try {
      const { service, text, systemId, ...options } = req.body;

      // 验证必要参数
      if (!text) {
        throw TtsException.BadRequest('Text parameter is required');
      }

      let provider, serviceType;

      // 如果提供了 systemId，则从VoiceManager解析
      if (systemId) {
        const { voiceManager } = require('./core/VoiceManager');
        await voiceManager.waitForReady(5000);
        const voice = voiceManager.getById(systemId);

        if (!voice) {
          throw TtsException.NotFound(`System ID not found: ${systemId}`);
        }

        provider = voice.provider;
        serviceType = voice.service;

        // 如果 options 中没有 voice，使用 voice 的 sourceId
        if (!options.voice && voice.sourceId) {
          options.voice = voice.sourceId;
        }

        console.log(`📌 使用 systemId: ${systemId} -> ${provider}/${serviceType}`);
      } else if (service) {
        // 解析服务标识 (支持格式: "aliyun_cosyvoice", "aliyun_qwen_http", "tencent", "volcengine_http")
        const parsed = this.parseServiceIdentifier(service);
        provider = parsed.provider;
        serviceType = parsed.serviceType;
      } else {
        throw TtsException.BadRequest('Either service or systemId parameter is required');
      }

      // 验证文本
      this.validateText(text);

      // 归一化参数别名
      const normalizedOptions = this.normalizeOptions(options);

      // 验证选项（委托给 ParameterMapper）
      this.validateOptions(normalizedOptions);

      // 使用服务管理器进行合成
      const result = await this.serviceManager.synthesize(provider, serviceType, text, normalizedOptions);

      res.json({
        success: true,
        data: result,
        service: service || `${provider}_${serviceType}`,
        fromCache: (result && result.fromCache) || false,
        metadata: {
          provider: provider,
          serviceType: serviceType,
          systemId: systemId || null,
          requestId: req.requestId || null
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * 获取音色列表
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getVoices(req, res) {
    try {
      const { service } = req.query;

      if (!service) {
        // 返回所有服务的音色列表
        const allVoices = await this.serviceManager.getAllVoices();

        return res.json({
          success: true,
          data: allVoices,
          totalServices: Object.keys(allVoices).length,
          timestamp: new Date().toISOString()
        });
      }

      // 返回特定服务的音色列表
      const { provider, serviceType } = this.parseServiceIdentifier(service);
      const voices = await this.serviceManager.getVoices(provider, serviceType);

      res.json({
        success: true,
        data: {
          provider,
          service: serviceType,
          voices: voices
        },
        voiceCount: voices.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * 获取服务提供商列表
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getProviders(req, res) {
    try {
      const providers = this.serviceManager.factory.getAvailableProviders();

      res.json({
        success: true,
        data: providers,
        providerCount: providers.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * 获取服务健康状态
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getHealthStatus(req, res) {
    try {
      const health = this.serviceManager.factory.getHealthStatus();

      res.json({
        success: true,
        data: health,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * 解析服务标识符
   * @param {string} serviceIdentifier - 服务标识符
   * @returns {Object} 解析结果 { provider, serviceType }
   */
  parseServiceIdentifier(serviceIdentifier) {
    const parts = serviceIdentifier.split('_');

    if (parts.length === 1) {
      // 单一标识符，如 "tencent"
      return {
        provider: parts[0],
        serviceType: null
      };
    }

    if (parts.length === 2) {
      // 带类型标识符，如 "aliyun_cosyvoice"
      return {
        provider: parts[0],
        serviceType: parts[1]
      };
    }

    if (parts.length === 3) {
      // 带协议标识符，如 "aliyun_qwen_http"
      return {
        provider: parts[0],
        serviceType: parts[1] + '_' + parts[2] // qwen_http
      };
    }

    throw TtsException.BadRequest(`Invalid service identifier: ${serviceIdentifier}`);
  }

  /**
   * 验证输入文本
   * @param {string} text - 输入文本
   */
  validateText(text) {
    if (!text || typeof text !== 'string') {
      throw TtsException.TextValidationError('Text must be a non-empty string');
    }

    if (text.trim().length === 0) {
      throw TtsException.TextValidationError('Text cannot be empty');
    }

    if (text.length > 10000) {
      throw TtsException.TextValidationError('Text too long, maximum 10000 characters allowed');
    }

    // 检查是否包含特殊字符
    const invalidChars = /[<>{}[\]\\]/g;
    if (invalidChars.test(text)) {
      throw TtsException.TextValidationError('Text contains invalid characters');
    }
  }

  /**
   * 统一错误处理
   * @param {Error} error - 错误对象
   * @param {Object} res - 响应对象
   */
  handleError(error, res) {
    if (error instanceof TtsException) {
      const statusCode = error.statusCode || 500;
      const response = error.toJSON();

      return res.status(statusCode).json(response);
    }

    // 处理其他类型的错误
    console.error('Unhandled TTS error:', error);

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 获取控制器统计信息
   * @returns {Object} 统计信息
   */
  /**
   * 验证选项参数
   * 注意：参数范围校验已委托给 ParameterMapper
   * Controller 只进行基本的参数存在性检查
   * @param {Object} options - 选项参数
   */
  validateOptions(options = {}) {
    // 参数校验已委托给 BaseTtsService.validateOptions -> ParameterMapper
    // 这里只做基本的存在性验证（如果需要的话）
    return true;
  }

  /**
   * 归一化参数别名
   * 支持旧版参数名，统一映射到标准参数名
   * @param {Object} options - 原始选项
   * @returns {Object} 归一化后的选项
   */
  normalizeOptions(options = {}) {
    const normalized = { ...options };

    // voice 参数别名归一化
    if (normalized.voiceType !== undefined && normalized.voice === undefined) {
      normalized.voice = normalized.voiceType;
      delete normalized.voiceType;
    }
    if (normalized.voice_id !== undefined && normalized.voice === undefined) {
      normalized.voice = normalized.voice_id;
      delete normalized.voice_id;
    }
    if (normalized.voice_type !== undefined && normalized.voice === undefined) {
      normalized.voice = normalized.voice_type;
      delete normalized.voice_type;
    }

    // format 参数别名归一化
    if (normalized.encoding !== undefined && normalized.format === undefined) {
      normalized.format = normalized.encoding;
      delete normalized.encoding;
    }

    return normalized;
  }

  /**
   * 获取详细统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return this.serviceManager.getStats();
  }

  /**
   * 清理缓存
   * @returns {Object} 清理结果
   */
  clearCache() {
    try {
      const { clearAllCache } = require('../../../shared/utils/audioCache');
      const clearedCount = clearAllCache();

      return {
        success: true,
        clearedItems: clearedCount,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 重置统计数据
   * @returns {Object} 重置结果
   */
  resetStats() {
    try {
      this.serviceManager.clearStats();
      return {
        success: true,
        message: 'Statistics cleared successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 批量文本转语音
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async batchSynthesize(req, res) {
    try {
      const { service, texts, options = {} } = req.body;

      // 验证参数
      if (!service || !texts || !Array.isArray(texts)) {
        throw TtsException.BadRequest('Service and texts array are required');
      }

      if (texts.length === 0) {
        throw TtsException.BadRequest('Texts array cannot be empty');
      }

      if (texts.length > 10) {
        throw TtsException.BadRequest('Maximum 10 texts allowed per batch request');
      }

      // 验证每个文本
      texts.forEach((text, index) => {
        if (!text || typeof text !== 'string') {
          throw TtsException.BadRequest(`Invalid text at index ${index}: must be non-empty string`);
        }
        this.validateText(text);
      });

      // 解析服务标识
      const { provider, serviceType } = this.parseServiceIdentifier(service);

      // 批量处理
      const results = [];
      const errors = [];

      for (let i = 0; i < texts.length; i++) {
        try {
          const result = await this.serviceManager.synthesize(
            provider,
            serviceType,
            texts[i],
            options
          );

          results.push({
            index: i,
            text: texts[i],
            success: true,
            data: result
          });
        } catch (error) {
          errors.push({
            index: i,
            text: texts[i],
            success: false,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        data: {
          results,
          errors,
          summary: {
            total: texts.length,
            successful: results.length,
            failed: errors.length
          }
        },
        service: service,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.handleError(error, res);
    }
  }
}

module.exports = UnifiedTtsController;
