/**
 * TtsServiceManager v2.0 - 重构版
 * 职责单一：服务协调，基础设施关注点委托给专用组件
 *
 * 架构变更：
 * - 熔断器 -> CircuitBreaker 类
 * - 限流器 -> RateLimiter 类
 * - 指标收集 -> MetricsCollector 类
 * - 重试逻辑 -> RetryExecutor 类
 */

const { ttsFactory } = require('./TtsFactory');
const TtsException = require('./TtsException');
const { CircuitBreaker, RetryExecutor, RateLimiter } = require('../../infrastructure/resilience');
const MetricsCollector = require('../../infrastructure/MetricsCollector');

class TtsServiceManager {
  constructor() {
    this.factory = ttsFactory;

    // 组件化基础设施
    this.circuitBreakers = new Map();
    this.rateLimiters = new Map();
    this.retryExecutor = new RetryExecutor({
      maxRetries: 3,
      baseDelay: 1000,
      backoffFactor: 2
    });
    this.metrics = new MetricsCollector();

    // 全局配置
    this.config = {
      rateLimit: {
        maxRequests: 100,
        windowMs: 60000
      },
      circuitBreaker: {
        failureThreshold: 5,
        timeout: 60000
      }
    };
  }

  /**
   * 执行TTS合成
   */
  async synthesize(provider, serviceType, text, options = {}) {
    const serviceKey = serviceType ? `${provider}_${serviceType}` : provider;
    const stopTimer = this.metrics.startTimer('synthesis_duration', { service: serviceKey });

    try {
      this.metrics.increment('total_requests', 1, { service: serviceKey });

      // 1. 检查限流
      this._checkRateLimit(serviceKey);

      // 2. 检查熔断器
      const breaker = this._getCircuitBreaker(serviceKey);
      if (breaker.isOpen()) {
        throw TtsException.ServiceUnavailable(
          `Service ${serviceKey} is currently unavailable (circuit breaker open)`
        );
      }

      // 3. 获取服务实例
      const ttsService = await this.factory.createService(provider, serviceType);

      // 4. 执行合成（带熔断保护和重试）
      const result = await breaker.execute(async () => {
        return this.retryExecutor.execute(
          () => ttsService.synthesize(text, options),
          `TTS synthesis ${serviceKey}`
        );
      });

      // 5. 记录成功
      const duration = stopTimer();
      this._recordSuccess(serviceKey, duration);

      return result;

    } catch (error) {
      stopTimer();
      this._recordFailure(serviceKey, error);
      throw error;
    }
  }

  /**
   * 获取音色列表
   */
  async getVoices(provider, serviceType) {
    try {
      const ttsService = await this.factory.createService(provider, serviceType);
      const voices = await ttsService.getAvailableVoices();
      return voices;
    } catch (error) {
      throw TtsException.ServiceUnavailable(
        `Failed to get voices for ${provider}_${serviceType}`,
        { error: error.message }
      );
    }
  }

  /**
   * 获取所有服务的音色列表
   */
  async getAllVoices() {
    const providers = this.factory.getAvailableProviders();
    const allVoices = {};

    const promises = providers.map(async (provider) => {
      const providerVoices = {};

      for (const serviceType of provider.services) {
        try {
          const serviceKey = `${provider.provider}_${serviceType}`;
          const voices = await this.getVoices(provider.provider, serviceType);

          providerVoices[serviceKey] = {
            provider: provider.provider,
            service: serviceType,
            description: provider.description,
            voices: voices
          };
        } catch (error) {
          providerVoices[`${provider.provider}_${serviceType}_error`] = {
            provider: provider.provider,
            service: serviceType,
            error: error.message,
            status: 'unavailable'
          };
        }
      }

      return { provider: provider.provider, voices: providerVoices };
    });

    const results = await Promise.allSettled(promises);

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        Object.assign(allVoices, result.value.voices);
      }
    });

    return allVoices;
  }

  // ==================== 统计与监控 ====================

  /**
   * 获取统计信息
   */
  getStats() {
    const synthesisStats = this.metrics.getHistogram('synthesis_duration') || {};
    const totalRequests = this.metrics.getCounter('total_requests');
    const successfulRequests = this.metrics.getCounter('successful_requests');
    const failedRequests = this.metrics.getCounter('failed_requests');

    const successRate = totalRequests > 0
      ? ((successfulRequests / totalRequests) * 100).toFixed(2)
      : 0;

    return {
      overview: {
        totalRequests,
        successfulRequests,
        failedRequests,
        successRate: `${successRate}%`,
        averageSynthesisTime: synthesisStats.avg ? `${Math.round(synthesisStats.avg)}ms` : '0ms',
        p95SynthesisTime: synthesisStats.p95 ? `${Math.round(synthesisStats.p95)}ms` : '0ms',
        timestamp: new Date().toISOString()
      },
      services: this._getServiceStats(),
      circuitBreakers: this._getCircuitBreakerStats(),
      rateLimiters: this._getRateLimiterStats(),
      factory: this.factory.getStats()
    };
  }

  /**
   * 清理统计数据
   */
  clearStats() {
    this.metrics.reset();
    this.circuitBreakers.forEach(b => b.reset());
    console.log('TTS service stats cleared');
  }

  // ==================== 私有方法 ====================

  _getCircuitBreaker(serviceKey) {
    if (!this.circuitBreakers.has(serviceKey)) {
      this.circuitBreakers.set(serviceKey, new CircuitBreaker({
        name: serviceKey,
        ...this.config.circuitBreaker
      }));
    }
    return this.circuitBreakers.get(serviceKey);
  }

  _getRateLimiter(serviceKey) {
    if (!this.rateLimiters.has(serviceKey)) {
      const limiter = new RateLimiter({
        name: serviceKey,
        maxRequests: this.config.rateLimit.maxRequests,
        windowMs: this.config.rateLimit.windowMs
      });
      limiter.startCleanup();
      this.rateLimiters.set(serviceKey, limiter);
    }
    return this.rateLimiters.get(serviceKey);
  }

  _checkRateLimit(serviceKey) {
    const limiter = this._getRateLimiter(serviceKey);
    const result = limiter.check(serviceKey);
    if (!result.allowed) {
      throw TtsException.RateLimited(
        `Rate limit exceeded for service ${serviceKey}`,
        { retryAfter: result.retryAfter }
      );
    }
  }

  _recordSuccess(serviceKey, duration) {
    this.metrics.increment('successful_requests', 1, { service: serviceKey });
    this.metrics.observe('synthesis_duration', duration, { service: serviceKey });
    this.metrics.recordEvent('synthesis_success', { service: serviceKey, duration });
  }

  _recordFailure(serviceKey, error) {
    this.metrics.increment('failed_requests', 1, { service: serviceKey });
    this.metrics.increment(`errors_${error.code || 'unknown'}`, 1, { service: serviceKey });
    this.metrics.recordEvent('synthesis_failure', {
      service: serviceKey,
      error: error.message,
      code: error.code
    });
  }

  _getServiceStats() {
    const stats = [];
    const services = new Set([
      ...this.circuitBreakers.keys(),
      ...this.rateLimiters.keys()
    ]);

    for (const serviceKey of services) {
      const counter = this.metrics.getCounter('total_requests', { service: serviceKey });
      const histogram = this.metrics.getHistogram('synthesis_duration', { service: serviceKey });

      stats.push({
        service: serviceKey,
        requests: counter,
        avgTime: histogram?.avg ? Math.round(histogram.avg) : 0,
        p95Time: histogram?.p95 ? Math.round(histogram.p95) : 0
      });
    }

    return stats;
  }

  _getCircuitBreakerStats() {
    return Array.from(this.circuitBreakers.entries()).map(([service, breaker]) => breaker.getStats());
  }

  _getRateLimiterStats() {
    return Array.from(this.rateLimiters.entries()).map(([service, limiter]) => limiter.getStats());
  }
}

// 导出单例
const ttsServiceManager = new TtsServiceManager();

module.exports = {
  TtsServiceManager,
  ttsServiceManager
};