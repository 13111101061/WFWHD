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
 * 支持 per-service 配置：从 manifest.json 的 executionPolicy 块读取
 * 每个服务商可独立配置 timeoutMs/retryTimes/rateLimit/circuitBreaker
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

    this.circuitBreakers = new Map();
    this.rateLimiters = new Map();

    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatency: 0,
      serviceStats: new Map(),
      timeoutCount: 0,
      rateLimitHits: 0
    };

    this.circuitBreakerConfig = config.circuitBreaker || {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000
    };

    this.rateLimiterConfig = config.rateLimiter || {
      maxRequests: 100,
      windowMs: 60000
    };

    this._serviceConfigs = new Map();
  }

  /**
   * 注册 per-service 配置
   * @param {string} serviceKey - 服务标识
   * @param {Object} config - { timeoutMs, retryTimes, rateLimit, circuitBreaker }
   */
  registerServiceConfig(serviceKey, config = {}) {
    this._serviceConfigs.set(serviceKey, config);
  }

  /**
   * 获取 per-service 超时
   */
  _getTimeoutMs(serviceKey) {
    const svc = this._serviceConfigs.get(serviceKey);
    return svc?.timeoutMs || this.timeoutMs;
  }

  /**
   * 获取 per-service 重试次数
   */
  _getRetryTimes(serviceKey) {
    const svc = this._serviceConfigs.get(serviceKey);
    return svc?.retryTimes != null ? svc.retryTimes : this.retryTimes;
  }

  /**
   * 受保护的执行：限流 → 熔断 → 重试 → 超时
   */
  async execute(serviceKey, task) {
    const startTime = Date.now();

    this._checkRateLimit(serviceKey);

    const breaker = this._getCircuitBreaker(serviceKey);

    const result = await breaker.execute(async () => {
      return this._executeWithRetry(serviceKey, task, startTime);
    });

    const latency = Date.now() - startTime;
    this._recordSuccess(serviceKey, latency);

    return result;
  }

  /**
   * 重试 + 超时包装（per-service 配置）
   */
  async _executeWithRetry(serviceKey, task, startTime) {
    const retryTimes = this._getRetryTimes(serviceKey);
    const timeoutMs = this._getTimeoutMs(serviceKey);
    const attempts = Math.max(1, retryTimes + 1);
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await withTimeout(task(), timeoutMs);
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

  _getCircuitBreaker(serviceKey) {
    if (!this.circuitBreakers.has(serviceKey)) {
      const svc = this._serviceConfigs.get(serviceKey);
      const cbConfig = svc?.circuitBreaker || this.circuitBreakerConfig;
      this.circuitBreakers.set(serviceKey, new CircuitBreaker({
        name: `tts-${serviceKey}`,
        ...cbConfig
      }));
    }
    return this.circuitBreakers.get(serviceKey);
  }

  _getRateLimiter(serviceKey) {
    if (!this.rateLimiters.has(serviceKey)) {
      const svc = this._serviceConfigs.get(serviceKey);
      const rlConfig = svc?.rateLimit || this.rateLimiterConfig;
      this.rateLimiters.set(serviceKey, new RateLimiter({
        name: `tts-${serviceKey}`,
        ...rlConfig
      }));
    }
    return this.rateLimiters.get(serviceKey);
  }

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

  resetStats() {
    this.metrics = {
      totalRequests: 0, successfulRequests: 0, failedRequests: 0,
      totalLatency: 0, serviceStats: new Map(),
      timeoutCount: 0, rateLimitHits: 0
    };
    this.circuitBreakers.forEach(b => b.reset());
  }

  _getCircuitBreakerStatus() {
    return Array.from(this.circuitBreakers.entries()).map(([key, breaker]) => ({
      service: key,
      state: breaker.getState(),
      ...breaker.getStats()
    }));
  }

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
