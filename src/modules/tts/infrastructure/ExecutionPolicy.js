/**
 * ExecutionPolicy - TTS 执行策略
 *
 * 统一管理:
 * - 限流 (per-service rate limiting)
 * - 熔断 (per-service circuit breaking)
 * - 超时控制
 * - 重试策略
 * - 指标收集
 *
 * 替代原本散落在 TtsSynthesisService 中的 _getCircuitBreaker/_getRateLimiter/
 * _checkRateLimit/sleep/isRetryableError/withTimeout 等逻辑
 */

const CircuitBreaker = require('../../../infrastructure/resilience/CircuitBreaker');
const RateLimiter = require('../../../infrastructure/resilience/RateLimiter');

const DEFAULT_TIMEOUT_MS = parseInt(process.env.TTS_SYNTH_TIMEOUT_MS || '60000', 10);
const DEFAULT_RETRY_TIMES = parseInt(process.env.TTS_SYNTH_RETRY_TIMES || '1', 10);

const RETRYABLE_CODES = new Set([
  'API_ERROR', 'PROVIDER_ERROR', 'TIMEOUT_ERROR',
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN'
]);

function isRetryable(error) {
  if (!error) return false;
  if (RETRYABLE_CODES.has(error.code)) return true;
  const msg = String(error.message || '').toLowerCase();
  return msg.includes('timeout') || msg.includes('timed out') || msg.includes('network');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`Execution timeout after ${timeoutMs}ms`);
      err.code = 'TIMEOUT_ERROR';
      reject(err);
    }, timeoutMs);
    promise
      .then(result => { clearTimeout(timer); resolve(result); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

class ExecutionPolicy {
  constructor(config = {}) {
    this.timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.retryTimes = config.retryTimes || DEFAULT_RETRY_TIMES;

    // per-service 熔断器
    this.circuitBreakers = new Map();
    // per-service 限流器
    this.rateLimiters = new Map();

    // 指标
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatency: 0,
      serviceStats: new Map(),
      timeoutCount: 0,
      rateLimitHits: 0
    };

    // 熔断器配置
    this.circuitBreakerConfig = config.circuitBreaker || {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000
    };

    // 限流器配置
    this.rateLimiterConfig = config.rateLimiter || {
      maxRequests: 100,
      windowMs: 60000
    };
  }

  /**
   * 受保护的执行：限流 → 熔断 → 重试 → 超时
   * 
   * @param {string} serviceKey - 服务标识
   * @param {Function} task - 异步任务函数
   * @returns {Promise<any>} 任务结果
   */
  async execute(serviceKey, task) {
    const startTime = Date.now();

    // 1. 限流检查
    this._checkRateLimit(serviceKey);

    // 2. 熔断器保护执行
    const breaker = this._getCircuitBreaker(serviceKey);

    const result = await breaker.execute(async () => {
      return this._executeWithRetry(task, startTime);
    });

    // 3. 记录成功
    const latency = Date.now() - startTime;
    this._recordSuccess(serviceKey, latency);

    return result;
  }

  /**
   * 重试 + 超时包装
   */
  async _executeWithRetry(task, startTime) {
    const attempts = Math.max(1, this.retryTimes + 1);
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await withTimeout(task(), this.timeoutMs);
      } catch (error) {
        lastError = error;
        if (error.code === 'TIMEOUT_ERROR') {
          this.metrics.timeoutCount++;
        }
        const shouldRetry = attempt < attempts && isRetryable(error);
        if (!shouldRetry) break;
        await sleep(120 * attempt);
      }
    }

    throw lastError;
  }

  /**
   * 限流检查
   */
  _checkRateLimit(serviceKey) {
    const limiter = this._getRateLimiter(serviceKey);
    const result = limiter.check(serviceKey);
    if (!result.allowed) {
      this.metrics.rateLimitHits++;
      const err = new Error(`Rate limit exceeded for ${serviceKey}`);
      err.code = 'RATE_LIMIT_EXCEEDED';
      err.retryAfter = result.retryAfter;
      err.limit = result.limit;
      throw err;
    }
  }

  /**
   * 获取或创建熔断器
   */
  _getCircuitBreaker(serviceKey) {
    if (!this.circuitBreakers.has(serviceKey)) {
      this.circuitBreakers.set(serviceKey, new CircuitBreaker({
        name: `tts-${serviceKey}`,
        ...this.circuitBreakerConfig
      }));
    }
    return this.circuitBreakers.get(serviceKey);
  }

  /**
   * 获取或创建限流器
   */
  _getRateLimiter(serviceKey) {
    if (!this.rateLimiters.has(serviceKey)) {
      this.rateLimiters.set(serviceKey, new RateLimiter({
        name: `tts-${serviceKey}`,
        ...this.rateLimiterConfig
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
      this.metrics.serviceStats.set(serviceKey, { calls: 0, errors: 0, totalLatency: 0 });
    }
    const stats = this.metrics.serviceStats.get(serviceKey);
    stats.calls++;
    stats.totalLatency += latency;
  }

  /**
   * 记录失败（由熔断器回调时使用）
   */
  recordFailure(serviceKey) {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;

    if (!this.metrics.serviceStats.has(serviceKey)) {
      this.metrics.serviceStats.set(serviceKey, { calls: 0, errors: 0, totalLatency: 0 });
    }
    const stats = this.metrics.serviceStats.get(serviceKey);
    stats.calls++;
    stats.errors++;
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
      errorBreakdown: {
        timeouts: this.metrics.timeoutCount,
        rateLimitHits: this.metrics.rateLimitHits
      }
    };
  }

  /**
   * 重置所有指标
   */
  resetStats() {
    this.metrics = {
      totalRequests: 0, successfulRequests: 0, failedRequests: 0,
      totalLatency: 0, serviceStats: new Map(),
      timeoutCount: 0, rateLimitHits: 0
    };
    this.circuitBreakers.forEach(b => b.reset());
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
   * 健康检查
   */
  getHealthStatus() {
    const breakerStatus = this._getCircuitBreakerStatus();
    const openBreakers = breakerStatus.filter(cb => cb.state === 'OPEN');
    return {
      overall: openBreakers.length > 0 ? 'degraded' : 'healthy',
      circuitBreakers: breakerStatus,
      rateLimitsSaturated: this.metrics.rateLimitHits > 0
    };
  }
}

module.exports = { ExecutionPolicy };
