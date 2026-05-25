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
const { TtsErrorCodes, HTTP_STATUS_MAP, RETRYABLE_MAP } = require('../../TtsErrorCodes');

class TtsHttpAdapter {
  constructor(synthesisService, queryService, { clearAllCache, providerRegistry } = {}) {
    this.synthesisService = synthesisService;
    this.queryService = queryService;
    this._clearAllCache = clearAllCache || null;
    this._providerRegistry = providerRegistry || null;
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

      const canonicalServiceKey = result.serviceKey
        || (result.provider && result.serviceType ? `${result.provider}_${result.serviceType}` : null);

      const response = {
        success: true,
        data: result.toApiResponse(),
        service: canonicalServiceKey || request.service,
        fromCache: result.fromCache || false,
        metadata: {
          provider: result.provider,
          serviceType: result.serviceType,
          serviceKey: canonicalServiceKey,
          requestedService: request.service,
          voiceCode: result.voiceCode || request.voiceCode || null,
          systemId: request.systemId || null,
          requestId: request.requestId
        },
        timestamp: result.timestamp
      };

      if (result.warnings && result.warnings.length > 0) {
        response.warnings = result.warnings;
      }

      if (result.voice && !response.metadata.systemId) {
        response.metadata.voice = result.voice;
      }

      res.json(response);

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
      const { service, texts, options = {} } = req.body || {};
      const stopOnError = options.stopOnError === true;

      this._validateBatchRequest(service, texts);

      const requests = texts.map(text =>
        SynthesisRequest.fromJSON({ text, service, options })
      );

      const { results, errors } = await this.synthesisService.batchSynthesize(
        requests,
        { stopOnError }
      );

      results.sort((a, b) => a.index - b.index);
      errors.sort((a, b) => a.index - b.index);

      const hasErrors = errors.length > 0;
      const statusCode = (stopOnError && hasErrors) ? 502 : 200;

      res.status(statusCode).json({
        success: !hasErrors,
        data: {
          results: results.map(r => ({
            index: r.index,
            text: requests[r.index].text,
            success: true,
            data: r.data.toApiResponse(),
            warnings: r.warnings || undefined
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
        const allVoices = await this.queryService.getAllVoices();
        return res.json({
          success: true,
          data: allVoices,
          totalServices: Object.keys(allVoices).length,
          timestamp: new Date().toISOString()
        });
      }

      let provider, serviceType, canonicalKey;

      if (this._providerRegistry) {
        canonicalKey = this._providerRegistry.resolveCanonicalKey(service);
        if (canonicalKey) {
          const desc = this._providerRegistry.get(canonicalKey);
          if (desc) {
            provider = desc.provider;
            serviceType = desc.serviceType;
          }
        }
      }

      if (!provider || !serviceType) {
        canonicalKey = null;
        const tempRequest = SynthesisRequest.fromJSON({ text: '', service });
        ({ provider, serviceType } = tempRequest.parseServiceIdentifier());
        if (provider && serviceType) canonicalKey = `${provider}_${serviceType}`;
      }

      if (!provider || !serviceType) {
        return res.status(400).json({
          success: false,
          code: 'UNKNOWN_SERVICE',
          message: `Could not resolve service: ${service}`,
          retryable: false,
          timestamp: new Date().toISOString()
        });
      }

      const voices = await this.queryService.getVoices(provider, serviceType);

      res.json({
        success: true,
        data: {
          provider,
          service: serviceType,
          canonicalKey: canonicalKey || `${provider}_${serviceType}`,
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
      const providersResult = this.queryService.getProviders();

      // Backward compatible: support both array and { success, data } structures.
      const providers = Array.isArray(providersResult)
        ? providersResult
        : (providersResult?.data || []);

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
      if (!this._clearAllCache) {
        return res.status(501).json({ success: false, message: 'Cache clearing not configured' });
      }
      const clearedCount = this._clearAllCache();

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

  /**
   * 获取单个音色详情
   * GET /api/tts/voices/:id
   */
  async getVoiceById(req, res) {
    try {
      const { id } = req.params;
      const voice = this.queryService.getVoice(id);

      if (!voice) {
        return res.status(404).json({
          success: false,
          error: `Voice not found: ${id}`
        });
      }

      res.json({
        success: true,
        data: voice,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * 获取音色详情
   * GET /api/tts/voices/:id/detail
   */
  async getVoiceDetail(req, res) {
    try {
      const { id } = req.params;
      const detail = this.queryService.getVoiceDetail(id);

      if (!detail) {
        return res.status(404).json({
          success: false,
          error: `Voice detail not found: ${id}`
        });
      }

      res.json({
        success: true,
        data: detail,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * 获取服务能力
   * GET /api/tts/capabilities/:service
   */
  async getCapabilities(req, res) {
    try {
      const { service } = req.params;
      const result = this.queryService.getCapabilities(service, req.query);

      const statusCode = result.success ? 200 : 404;
      res.status(statusCode).json(result);

    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * 获取筛选选项
   * GET /api/tts/filters
   */
  async getFilterOptions(req, res) {
    try {
      const result = this.queryService.getFilterOptions();
      this._applyStaticCache(res, result, 1800);
      if (this._checkNotModified(req, res)) return;
      res.json(result);

    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * 获取前端展示目录
   * GET /api/tts/catalog
   */
  async getFrontendCatalog(req, res) {
    try {
      const result = this.queryService.getFrontendCatalog();
      this._applyStaticCache(res, result, 3600);
      if (this._checkNotModified(req, res)) return;
      res.json(result);

    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * 获取前端展示音色数据
   * GET /api/tts/frontend
   */
  async getFrontendVoices(req, res) {
    try {
      const result = this.queryService.getFrontendVoices();
      this._applyStaticCache(res, result, 3600);
      if (this._checkNotModified(req, res)) return;
      res.json(result);

    } catch (error) {
      this._handleError(error, res);
    }
  }

  /**
   * 获取前端启动包
   * GET /api/tts/bootstrap
   */
  async getFrontendBootstrap(req, res) {
    try {
      const result = this.queryService.getFrontendBootstrap();
      this._applyStaticCache(res, result, 1800);
      if (this._checkNotModified(req, res)) return;
      res.json(result);

    } catch (error) {
      this._handleError(error, res);
    }
  }

  // ==================== 私有方法 ====================

  _applyStaticCache(res, data, maxAgeSeconds = 3600) {
    const etag = require('crypto')
      .createHash('md5')
      .update(JSON.stringify(data))
      .digest('hex');
    res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`);
    res.setHeader('ETag', `"${etag}"`);
  }

  _checkNotModified(req, res) {
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && res.get('ETag') && ifNoneMatch === res.get('ETag')) {
      res.removeHeader('Content-Type');
      return res.status(304).end();
    }
    return false;
  }

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
    return HTTP_STATUS_MAP[error.code] || 500;
  }

  _buildErrorResponse(error) {
    const code = error.code || TtsErrorCodes.INTERNAL_ERROR;
    const retryable = RETRYABLE_MAP[code] === true;

    const isProviderError = code === TtsErrorCodes.PROVIDER_UNAUTHORIZED
      || code === TtsErrorCodes.PROVIDER_UNAVAILABLE
      || code === TtsErrorCodes.PROVIDER_RATE_LIMITED;

    let safeMessage = error.message;
    if (isProviderError) {
      console.error('[TtsHttpAdapter] Provider error (sanitized):', error.message);
      switch (code) {
        case TtsErrorCodes.PROVIDER_UNAUTHORIZED:
          safeMessage = 'Service provider authentication failed';
          break;
        case TtsErrorCodes.PROVIDER_UNAVAILABLE:
          safeMessage = 'Service provider temporary error';
          break;
        case TtsErrorCodes.PROVIDER_RATE_LIMITED:
          safeMessage = 'Service provider rate limit exceeded';
          break;
        default:
          safeMessage = 'Service provider error';
      }
    }

    const response = {
      success: false,
      code,
      message: safeMessage,
      retryable,
      timestamp: new Date().toISOString()
    };
    if (!isProviderError && error.errors) response.errors = error.errors;
    if (error.retryAfter) response.retryAfter = error.retryAfter;
    if (error.limit) response.limit = error.limit;
    if (error.serverDigest) response.serverDigest = error.serverDigest;
    if (error.provider) response.provider = error.provider;
    return response;
  }
}

module.exports = TtsHttpAdapter;
