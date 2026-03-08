const { ttsFactory } = require('./TtsFactory');
const TtsException = require('./TtsException');

/**
 * TTS服务管理器
 * 提供更高级的服务管理功能，包括负载均衡、熔断器、监控等
 */
class TtsServiceManager {
  constructor() {
    this.factory = ttsFactory;
    this.serviceStats = new Map();
    this.circuitBreakers = new Map();
    this.rateLimiters = new Map();
    this.initializeMetrics();
  }

  /**
   * 初始化监控指标
   */
  initializeMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalSynthesisTime: 0,
      serviceCalls: new Map(),
      errors: new Map()
    };
  }

  /**
   * 智能TTS合成 - 带有负载均衡和熔断保护
   * @param {string} provider - 服务提供商
   * @param {string} serviceType - 服务类型
   * @param {string} text - 要转换的文本
   * @param {Object} options - 转换选项
   * @returns {Promise<Object>} 转换结果
   */
  async synthesize(provider, serviceType, text, options = {}) {
    const startTime = Date.now();
    const serviceKey = serviceType ? `${provider}_${serviceType}` : provider;

    try {
      this.metrics.totalRequests++;

      // 简化日志：只在开发环境记录
      if (process.env.NODE_ENV === 'development') {
        console.log(`[${Date.now()}] TTS: ${serviceKey}`);
      }

      // 检查熔断器状态
      if (this.isCircuitOpen(serviceKey)) {
        throw TtsException.ServiceUnavailable(`Service ${serviceKey} is currently unavailable (circuit breaker open)`);
      }

      // 检查速率限制
      if (this.isRateLimited(serviceKey)) {
        throw TtsException.RateLimited(`Rate limit exceeded for service ${serviceKey}`);
      }

      // 获取服务实例
      const ttsService = await this.factory.createService(provider, serviceType);

      // 执行合成
      const result = await ttsService.synthesize(text, options);

      // 记录成功指标
      const synthesisTime = Date.now() - startTime;
      this.recordSuccess(serviceKey, synthesisTime);

      // 简化成功日志：只在开发环境记录
      if (process.env.NODE_ENV === 'development') {
        console.log(`[${Date.now()}] TTS成功: ${serviceKey} (${synthesisTime}ms)`);
      }

      return result;

    } catch (error) {
      // 记录失败指标
      this.recordFailure(serviceKey, error);

      console.error(`❌ TTS合成失败: ${serviceKey} - ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取音色列表
   * @param {string} provider - 服务提供商
   * @param {string} serviceType - 服务类型
   * @returns {Promise<Array>} 音色列表
   */
  async getVoices(provider, serviceType) {
    try {
      const ttsService = await this.factory.createService(provider, serviceType);
      const voices = await ttsService.getAvailableVoices();

      return voices;
    } catch (error) {
      console.error(`获取音色列表失败 ${provider}_${serviceType}:`, error.message);
      throw TtsException.ServiceUnavailable(`Failed to get voices for ${provider}_${serviceType}`, { error: error.message });
    }
  }

  /**
   * 获取所有服务的音色列表
   * @returns {Promise<Object>} 所有服务的音色列表
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
          console.warn(`获取音色失败 ${provider.provider}_${serviceType}:`, error.message);
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
      } else {
        console.error('Provider voice fetch failed:', result.reason);
      }
    });

    return allVoices;
  }

  /**
   * 记录成功指标
   * @param {string} serviceKey - 服务标识
   * @param {number} duration - 耗时
   */
  recordSuccess(serviceKey, duration) {
    this.metrics.successfulRequests++;
    this.metrics.totalSynthesisTime += duration;

    if (!this.metrics.serviceCalls.has(serviceKey)) {
      this.metrics.serviceCalls.set(serviceKey, { calls: 0, totalTime: 0, errors: 0 });
    }

    const stats = this.metrics.serviceCalls.get(serviceKey);
    stats.calls++;
    stats.totalTime += duration;

    // 重置熔断器
    this.resetCircuitBreaker(serviceKey);
  }

  /**
   * 记录失败指标
   * @param {string} serviceKey - 服务标识
   * @param {Error} error - 错误对象
   */
  recordFailure(serviceKey, error) {
    this.metrics.failedRequests++;

    if (!this.metrics.serviceCalls.has(serviceKey)) {
      this.metrics.serviceCalls.set(serviceKey, { calls: 0, totalTime: 0, errors: 0 });
    }

    const stats = this.metrics.serviceCalls.get(serviceKey);
    stats.errors++;

    // 记录错误类型
    const errorType = error.constructor.name;
    if (!this.metrics.errors.has(errorType)) {
      this.metrics.errors.set(errorType, 0);
    }
    this.metrics.errors.set(errorType, this.metrics.errors.get(errorType) + 1);

    // 触发熔断器检查
    this.checkCircuitBreaker(serviceKey);
  }

  /**
   * 检查熔断器状态
   * @param {string} serviceKey - 服务标识
   */
  checkCircuitBreaker(serviceKey) {
    const stats = this.metrics.serviceCalls.get(serviceKey);
    if (!stats) return;

    const errorRate = stats.errors / stats.calls;
    const minCalls = 10; // 最少调用次数

    if (stats.calls >= minCalls && errorRate > 0.5) { // 50%错误率触发熔断
      this.openCircuit(serviceKey);
    }
  }

  /**
   * 打开熔断器
   * @param {string} serviceKey - 服务标识
   */
  openCircuit(serviceKey) {
    this.circuitBreakers.set(serviceKey, {
      state: 'open',
      openedAt: Date.now(),
      retryAfter: 60000 // 1分钟后重试
    });

    console.log(`🔴 熔断器打开: ${serviceKey}`);
  }

  /**
   * 重置熔断器
   * @param {string} serviceKey - 服务标识
   */
  resetCircuitBreaker(serviceKey) {
    this.circuitBreakers.delete(serviceKey);
  }

  /**
   * 检查熔断器是否打开
   * @param {string} serviceKey - 服务标识
   * @returns {boolean} 是否打开
   */
  isCircuitOpen(serviceKey) {
    const breaker = this.circuitBreakers.get(serviceKey);
    if (!breaker) return false;

    // 检查是否可以重试
    if (Date.now() - breaker.openedAt > breaker.retryAfter) {
      this.resetCircuitBreaker(serviceKey);
      return false;
    }

    return true;
  }

  /**
   * 检查速率限制
   * @param {string} serviceKey - 服务标识
   * @returns {boolean} 是否被限制
   */
  isRateLimited(serviceKey) {
    const now = Date.now();
    const window = 60000; // 1分钟窗口
    const limit = 100; // 每分钟最多100次请求

    if (!this.rateLimiters.has(serviceKey)) {
      this.rateLimiters.set(serviceKey, []);
    }

    const requests = this.rateLimiters.get(serviceKey);

    // 清理过期请求
    while (requests.length > 0 && requests[0] < now - window) {
      requests.shift();
    }

    // 检查是否超过限制
    if (requests.length >= limit) {
      return true;
    }

    // 记录当前请求
    requests.push(now);
    return false;
  }

  /**
   * 获取服务统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const now = new Date().toISOString();
    const successRate = this.metrics.totalRequests > 0
      ? (this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2)
      : 0;

    const avgSynthesisTime = this.metrics.successfulRequests > 0
      ? Math.round(this.metrics.totalSynthesisTime / this.metrics.successfulRequests)
      : 0;

    return {
      overview: {
        totalRequests: this.metrics.totalRequests,
        successfulRequests: this.metrics.successfulRequests,
        failedRequests: this.metrics.failedRequests,
        successRate: `${successRate}%`,
        averageSynthesisTime: `${avgSynthesisTime}ms`,
        timestamp: now
      },
      services: Array.from(this.metrics.serviceCalls.entries()).map(([service, stats]) => ({
        service,
        calls: stats.calls,
        errors: stats.errors,
        errorRate: stats.calls > 0 ? `${(stats.errors / stats.calls * 100).toFixed(2)}%` : '0%',
        averageTime: stats.calls > 0 ? `${Math.round(stats.totalTime / stats.calls)}ms` : '0ms'
      })),
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([service, breaker]) => ({
        service,
        state: breaker.state,
        openedAt: new Date(breaker.openedAt).toISOString(),
        retryAfter: `${breaker.retryAfter / 1000}s`
      })),
      errors: Array.from(this.metrics.errors.entries()).map(([type, count]) => ({
        type,
        count
      })),
      factory: this.factory.getStats()
    };
  }

  /**
   * 清理统计数据
   */
  clearStats() {
    this.initializeMetrics();
    this.serviceStats.clear();
    this.circuitBreakers.clear();
    this.rateLimiters.clear();
    console.log('📊 TTS服务统计已重置');
  }
}

// 导出单例实例
const ttsServiceManager = new TtsServiceManager();

module.exports = {
  TtsServiceManager,
  ttsServiceManager
};