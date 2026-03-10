/**
 * TtsHttpAdapter - TTS HTTP适配器
 *
 * 六边形架构中的HTTP适配器，是Express与领域服务之间的桥梁。
 * 这是TTS模块的唯一HTTP入口。
 *
 * 职责：
 * - 解析HTTP请求 → 构建领域请求对象
 * - 调用领域服务 → 执行业务逻辑
 * - 格式化HTTP响应 → 返回API响应
 * - 处理HTTP特定错误 → 统一错误格式
 *
 * 注意：此类只处理HTTP协议相关逻辑，不包含任何业务逻辑
 */

const SynthesisRequest = require('../../domain/SynthesisRequest');
const AudioResult = require('../../domain/AudioResult');

class TtsHttpAdapter {
  /**
   * @param {Object} synthesisService - TtsSynthesisService 领域服务
   */
  constructor(synthesisService) {
    this.synthesisService = synthesisService;
  }

  // ==================== HTTP入口方法 ====================

  /**
   * TTS合成
   * POST /api/tts/synthesize
   */
  async synthesize(req, res) {
    try {
      const request = SynthesisRequest.fromJSON(req.body);
      const result = await this.synthesisService.synthesize(request);

      res.json({
        success: true,
        data: result.toApiResponse(),
        service: request.getServiceKey(),
        fromCache: result.fromCache || false,
        metadata: {
          provider: result.provider,
          serviceType: result.serviceType,
          systemId: request.systemId || null,
          requestId: request.requestId
        },
        timestamp: result.timestamp
      });

    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * 批量合成
   * POST /api/tts/batch
   */
  async batchSynthesize(req, res) {
    try {
      const { service, texts, options = {} } = req.body;

      this._validateBatchRequest(service, texts);

      const requests = texts.map(text =>
        SynthesisRequest.fromJSON({ text, service, options })
      );

      const { results, errors } = await this.synthesisService.batchSynthesize(requests);

      res.json({
        success: true,
        data: {
          results: results.map(r => ({
            index: r.index,
            text: requests[r.index].text,
            success: true,
            data: r.data.toApiResponse()
          })),
          errors,
          summary: {
            total: texts.length,
            successful: results.length,
            failed: errors.length
          }
        },
        service,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * 获取音色列表
   * GET /api/tts/voices
   */
  async getVoices(req, res) {
    try {
      const { service } = req.query;

      if (!service) {
        const allVoices = await this.synthesisService.getAllVoices();
        return res.json({
          success: true,
          data: allVoices,
          totalServices: Object.keys(allVoices).length,
          timestamp: new Date().toISOString()
        });
      }

      const tempRequest = SynthesisRequest.fromJSON({ text: '', service });
      const { provider, serviceType } = tempRequest.parseServiceIdentifier();
      const voices = await this.synthesisService.getVoices(provider, serviceType);

      res.json({
        success: true,
        data: {
          provider,
          service: serviceType,
          voices
        },
        voiceCount: voices.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * 获取服务提供商列表
   * GET /api/tts/providers
   */
  async getProviders(req, res) {
    try {
      const providers = this.synthesisService.getProviders();

      res.json({
        success: true,
        data: providers,
        providerCount: providers.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * 获取健康状态
   * GET /api/tts/health
   */
  async getHealthStatus(req, res) {
    try {
      const health = await this.synthesisService.getHealthStatus();

      res.json({
        success: true,
        data: health,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * 获取统计信息
   * GET /api/tts/stats
   */
  async getStats(req, res) {
    try {
      const stats = this.synthesisService.getStats();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * 重置统计
   * POST /api/tts/reset-stats
   */
  async resetStats(req, res) {
    try {
      this.synthesisService.resetStats();

      res.json({
        success: true,
        message: 'Statistics reset successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * 清理缓存
   * POST /api/tts/clear-cache
   */
  async clearCache(req, res) {
    try {
      const { clearAllCache } = require('../../../../shared/utils/audioCache');
      const clearedCount = clearAllCache();

      res.json({
        success: true,
        clearedItems: clearedCount,
        message: 'Cache cleared successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this._handleError(error, res);
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 验证批量请求参数
   */
  _validateBatchRequest(service, texts) {
    if (!service || !texts || !Array.isArray(texts)) {
      const error = new Error('Service and texts array are required');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (texts.length === 0) {
      const error = new Error('Texts array cannot be empty');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (texts.length > 10) {
      const error = new Error('Maximum 10 texts allowed per batch request');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
  }

  /**
   * 统一错误处理
   */
  _handleError(error, res) {
    const statusCode = this._getStatusCode(error);
    const response = this._buildErrorResponse(error);

    // 开发环境下记录详细错误
    if (process.env.NODE_ENV === 'development') {
      console.error('[TtsHttpAdapter] Error:', error);
    }

    res.status(statusCode).json(response);
  }

  /**
   * 获取HTTP状态码
   */
  _getStatusCode(error) {
    switch (error.code) {
      case 'VALIDATION_ERROR':
        return 400;
      case 'VOICE_NOT_FOUND':
      case 'NOT_FOUND':
        return 404;
      case 'RATE_LIMIT_EXCEEDED':
        return 429;
      case 'CIRCUIT_BREAKER_OPEN':
      case 'SERVICE_UNAVAILABLE':
        return 503;
      default:
        return 500;
    }
  }

  /**
   * 构建错误响应
   */
  _buildErrorResponse(error) {
    const base = {
      success: false,
      error: error.message,
      code: error.code || 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    };

    // 添加额外信息
    if (error.errors) base.errors = error.errors;
    if (error.retryAfter) base.retryAfter = error.retryAfter;
    if (error.limit) base.limit = error.limit;

    return base;
  }
}

module.exports = TtsHttpAdapter;