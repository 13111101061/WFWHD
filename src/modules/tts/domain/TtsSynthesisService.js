/**
 * TtsSynthesisService - TTS合成领域服务
 *
 * 核心职责：
 * - 编排TTS合成流程
 * - 熔断器保护（防止级联故障）
 * - 限流保护（防止过载）
 * - 请求验证与解析
 *
 * 依赖注入：
 * - ttsProvider: TTS提供者端口
 * - voiceCatalog: 音色目录端口
 * - validator: 验证服务
 * - circuitBreaker: 熔断器（可选，有默认实现）
 * - rateLimiter: 限流器（可选，有默认实现）
 */

const CircuitBreaker = require('../../../infrastructure/resilience/CircuitBreaker');
const RateLimiter = require('../../../infrastructure/resilience/RateLimiter');

class TtsSynthesisService {
  /**
   * @param {Object} deps - 依赖注入
   */
  constructor({
    ttsProvider,
    voiceCatalog,
    validator,
    circuitBreaker,
    rateLimiter
  }) {
    this.ttsProvider = ttsProvider;
    this.voiceCatalog = voiceCatalog;
    this.validator = validator;

    // 熔断器：按服务粒度管理
    this.circuitBreakers = new Map();
    this.defaultCircuitBreaker = circuitBreaker || null;

    // 限流器：按服务粒度管理
    this.rateLimiters = new Map();
    this.defaultRateLimiter = rateLimiter || null;

    // 统计指标
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatency: 0,
      serviceStats: new Map()
    };
  }

  /**
   * 执行TTS合成（核心方法）
   * @param {SynthesisRequest} request - 合成请求
   * @returns {Promise<AudioResult>} 合成结果
   */
  async synthesize(request) {
    const startTime = Date.now();
    const serviceKey = this._buildServiceKey(request);

    // 1. 验证请求
    this._validateRequest(request);

    // 2. 解析服务标识
    const resolvedRequest = await this._resolveServiceIdentifier(request);
    const resolvedServiceKey = this._buildServiceKey(resolvedRequest);

    // 3. 限流检查
    this._checkRateLimit(resolvedServiceKey);

    // 4. 熔断器保护执行
    const breaker = this._getCircuitBreaker(resolvedServiceKey);

    const result = await breaker.execute(async () => {
      // 5. 归一化选项
      const normalizedOptions = resolvedRequest.getNormalizedOptions();

      // 6. 调用TTS提供者
      return this.ttsProvider.synthesize(
        resolvedRequest.provider,
        resolvedRequest.serviceType,
        resolvedRequest.text,
        normalizedOptions
      );
    });

    // 7. 记录成功指标
    const latency = Date.now() - startTime;
    this._recordSuccess(resolvedServiceKey, latency);

    // 8. 构建结果
    const AudioResult = require('./AudioResult');
    return AudioResult.fromServiceResult(result, {
      provider: resolvedRequest.provider,
      serviceType: resolvedRequest.serviceType,
      text: resolvedRequest.text,
      latency
    });
  }

  /**
   * 批量合成
   * @param {SynthesisRequest[]} requests
   * @returns {Promise<{ results: Array, errors: Array }>}
   */
  async batchSynthesize(requests) {
    const results = [];
    const errors = [];

    for (let i = 0; i < requests.length; i++) {
      try {
        const result = await this.synthesize(requests[i]);
        results.push({
          index: i,
          success: true,
          data: result
        });
      } catch (error) {
        errors.push({
          index: i,
          success: false,
          error: error.message,
          code: error.code
        });
      }
    }

    return { results, errors };
  }

  /**
   * 获取可用音色
   */
  async getVoices(provider, serviceType) {
    if (provider && serviceType) {
      return this.voiceCatalog.getByProviderAndService(provider, serviceType);
    }
    if (provider) {
      return this.voiceCatalog.getByProvider(provider);
    }
    return this.voiceCatalog.getAll();
  }

  /**
   * 获取所有可用音色（按服务分组）
   */
  async getAllVoices() {
    return this.voiceCatalog.getAllGroupedByService();
  }

  /**
   * 获取可用服务提供商
   */
  getProviders() {
    return this.ttsProvider.getAvailableProviders();
  }

  /**
   * 获取服务健康状态
   */
  async getHealthStatus() {
    const providerHealth = await this.ttsProvider.getHealthStatus();
    const circuitBreakerStatus = this._getCircuitBreakerStatus();

    return {
      overall: this._determineOverallHealth(providerHealth, circuitBreakerStatus),
      provider: providerHealth,
      circuitBreakers: circuitBreakerStatus,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const successRate = this.metrics.totalRequests > 0
      ? (this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2)
      : 0;

    const avgLatency = this.metrics.successfulRequests > 0
      ? Math.round(this.metrics.totalLatency / this.metrics.successfulRequests)
      : 0;

    return {
      overview: {
        totalRequests: this.metrics.totalRequests,
        successfulRequests: this.metrics.successfulRequests,
        failedRequests: this.metrics.failedRequests,
        successRate: `${successRate}%`,
        averageLatency: `${avgLatency}ms`
      },
      services: Array.from(this.metrics.serviceStats.entries()).map(([key, stats]) => ({
        service: key,
        calls: stats.calls,
        errors: stats.errors,
        errorRate: stats.calls > 0 ? `${(stats.errors / stats.calls * 100).toFixed(2)}%` : '0%',
        avgLatency: stats.calls > 0 ? `${Math.round(stats.totalLatency / stats.calls)}ms` : '0ms'
      })),
      circuitBreakers: this._getCircuitBreakerStatus(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatency: 0,
      serviceStats: new Map()
    };

    // 重置所有熔断器
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }

    console.log('📊 TTS服务统计已重置');
  }

  // ==================== 私有方法 ====================

  /**
   * 验证请求
   */
  _validateRequest(request) {
    // 基础验证
    const baseValidation = request.validate();
    if (!baseValidation.valid) {
      const error = new Error(baseValidation.errors.join('; '));
      error.code = 'VALIDATION_ERROR';
      error.errors = baseValidation.errors;
      throw error;
    }

    // 文本内容验证
    if (request.text && this.validator) {
      const textValidation = this.validator.validateText(request.text);
      if (!textValidation.valid) {
        const error = new Error(textValidation.errors.join('; '));
        error.code = 'VALIDATION_ERROR';
        error.errors = textValidation.errors;
        throw error;
      }
    }
  }

  /**
   * 解析服务标识符
   */
  async _resolveServiceIdentifier(request) {
    if (request.systemId) {
      return this._resolveFromSystemId(request);
    }

    const { provider, serviceType } = request.parseServiceIdentifier();
    if (!provider) {
      const error = new Error('Invalid service identifier');
      error.code = 'INVALID_SERVICE';
      throw error;
    }

    const SynthesisRequest = require('./SynthesisRequest');
    return new SynthesisRequest({
      ...request.toJSON(),
      provider,
      serviceType
    });
  }

  /**
   * 从 systemId 解析服务信息
   */
  async _resolveFromSystemId(request) {
    const voice = await this.voiceCatalog.getById(request.systemId);

    if (!voice) {
      const error = new Error(`System ID not found: ${request.systemId}`);
      error.code = 'VOICE_NOT_FOUND';
      throw error;
    }

    return request.withResolvedProvider(voice);
  }

  /**
   * 构建服务键
   */
  _buildServiceKey(request) {
    if (request.provider && request.serviceType) {
      return `${request.provider}_${request.serviceType}`;
    }
    if (request.service) {
      return request.service;
    }
    return 'default';
  }

  /**
   * 获取或创建熔断器
   */
  _getCircuitBreaker(serviceKey) {
    if (!this.circuitBreakers.has(serviceKey)) {
      this.circuitBreakers.set(serviceKey, new CircuitBreaker({
        name: `tts-${serviceKey}`,
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000
      }));
    }
    return this.circuitBreakers.get(serviceKey);
  }

  /**
   * 限流检查
   */
  _checkRateLimit(serviceKey) {
    const limiter = this._getRateLimiter(serviceKey);
    const result = limiter.check(serviceKey);

    if (!result.allowed) {
      const error = new Error(`Rate limit exceeded for service ${serviceKey}`);
      error.code = 'RATE_LIMIT_EXCEEDED';
      error.retryAfter = result.retryAfter;
      error.limit = result.limit;
      throw error;
    }
  }

  /**
   * 获取或创建限流器
   */
  _getRateLimiter(serviceKey) {
    if (!this.rateLimiters.has(serviceKey)) {
      this.rateLimiters.set(serviceKey, new RateLimiter({
        name: `tts-${serviceKey}`,
        maxRequests: 100,
        windowMs: 60000
      }));
    }
    return this.rateLimiters.get(serviceKey);
  }

  /**
   * 记录成功
   */
  _recordSuccess(serviceKey, latency) {
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
    this.metrics.totalLatency += latency;

    if (!this.metrics.serviceStats.has(serviceKey)) {
      this.metrics.serviceStats.set(serviceKey, {
        calls: 0,
        errors: 0,
        totalLatency: 0
      });
    }

    const stats = this.metrics.serviceStats.get(serviceKey);
    stats.calls++;
    stats.totalLatency += latency;
  }

  /**
   * 记录失败（由熔断器回调）
   */
  _recordFailure(serviceKey) {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;

    if (!this.metrics.serviceStats.has(serviceKey)) {
      this.metrics.serviceStats.set(serviceKey, {
        calls: 0,
        errors: 0,
        totalLatency: 0
      });
    }

    const stats = this.metrics.serviceStats.get(serviceKey);
    stats.calls++;
    stats.errors++;
  }

  /**
   * 获取熔断器状态
   */
  _getCircuitBreakerStatus() {
    return Array.from(this.circuitBreakers.entries()).map(([key, breaker]) => ({
      service: key,
      state: breaker.getState(),
      ...breaker.getStats()
    }));
  }

  /**
   * 确定整体健康状态
   */
  _determineOverallHealth(providerHealth, circuitBreakerStatus) {
    // 如果有任何熔断器打开，状态为 degraded
    const openBreakers = circuitBreakerStatus.filter(cb => cb.state === 'OPEN');
    if (openBreakers.length > 0) {
      return 'degraded';
    }

    // 如果提供者健康，返回 healthy
    if (providerHealth && providerHealth.overall === 'healthy') {
      return 'healthy';
    }

    return 'degraded';
  }
}

module.exports = TtsSynthesisService;