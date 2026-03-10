/**
 * RateLimiter - 速率限制器
 * 实现滑动窗口限流算法
 */

class RateLimiter {
  /**
   * @param {Object} options
   * @param {number} [options.maxRequests=100] - 最大请求数
   * @param {number} [options.windowMs=60000] - 时间窗口(ms)
   * @param {string} [options.name='default'] - 限流器名称
   */
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.maxRequests = options.maxRequests || 100;
    this.windowMs = options.windowMs || 60000;

    // 存储: key -> timestamps[]
    this.store = new Map();

    // 统计
    this.stats = {
      totalRequests: 0,
      allowedRequests: 0,
      rejectedRequests: 0
    };
  }

  /**
   * 检查并记录请求
   * @param {string} key - 限流键（如用户ID、API密钥等）
   * @returns {{ allowed: boolean, remaining: number, resetTime: number, retryAfter?: number }}
   */
  check(key) {
    this.stats.totalRequests++;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // 获取或创建请求记录
    let requests = this.store.get(key);
    if (!requests) {
      requests = [];
      this.store.set(key, requests);
    }

    // 清理过期请求
    while (requests.length > 0 && requests[0] < windowStart) {
      requests.shift();
    }

    // 检查是否超限
    if (requests.length >= this.maxRequests) {
      this.stats.rejectedRequests++;
      const oldestRequest = requests[0];
      const resetTime = oldestRequest + this.windowMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);

      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter,
        limit: this.maxRequests
      };
    }

    // 记录请求
    requests.push(now);
    this.stats.allowedRequests++;

    return {
      allowed: true,
      remaining: this.maxRequests - requests.length,
      resetTime: now + this.windowMs,
      limit: this.maxRequests
    };
  }

  /**
   * 异步检查（抛出异常版本）
   * @param {string} key
   * @throws {Error} 如果超限
   */
  checkAndThrow(key) {
    const result = this.check(key);
    if (!result.allowed) {
      const error = new Error('Rate limit exceeded');
      error.code = 'RATE_LIMIT_EXCEEDED';
      error.retryAfter = result.retryAfter;
      error.limit = result.limit;
      throw error;
    }
    return result;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      name: this.name,
      ...this.stats,
      activeKeys: this.store.size
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      allowedRequests: 0,
      rejectedRequests: 0
    };
  }

  /**
   * 清理过期数据
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, requests] of this.store.entries()) {
      // 清理过期请求
      while (requests.length > 0 && requests[0] < now - this.windowMs) {
        requests.shift();
      }

      // 如果没有请求记录，删除键
      if (requests.length === 0) {
        this.store.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * 启动定期清理
   * @param {number} [intervalMs=300000] - 清理间隔(ms)
   */
  startCleanup(intervalMs = 300000) {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, intervalMs);

    // 不阻止进程退出
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 停止清理
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

module.exports = RateLimiter;