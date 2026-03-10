/**
 * RetryExecutor - 重试执行器
 * 实现指数退避重试策略
 */

class RetryExecutor {
  /**
   * @param {Object} options
   * @param {number} [options.maxRetries=3] - 最大重试次数
   * @param {number} [options.baseDelay=1000] - 基础延迟(ms)
   * @param {number} [options.maxDelay=30000] - 最大延迟(ms)
   * @param {number} [options.backoffFactor=2] - 退避因子
   * @param {Function} [options.shouldRetry] - 判断是否重试的函数
   */
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.backoffFactor = options.backoffFactor || 2;

    // 默认重试条件：非4xx错误
    this.shouldRetry = options.shouldRetry || ((error) => {
      if (error.response?.status >= 400 && error.response?.status < 500) {
        return false; // 客户端错误不重试
      }
      return true;
    });

    // 统计
    this.stats = {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      retriedCalls: 0
    };
  }

  /**
   * 执行函数（带重试）
   * @param {Function} fn - 要执行的异步函数
   * @param {string} [operation='operation'] - 操作名称（用于日志）
   * @returns {Promise<any>}
   */
  async execute(fn, operation = 'operation') {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      this.stats.totalAttempts++;

      try {
        const result = await fn();
        this.stats.successfulAttempts++;
        return result;
      } catch (error) {
        lastError = error;
        this.stats.failedAttempts++;

        // 最后一次尝试不再重试
        if (attempt === this.maxRetries) {
          break;
        }

        // 检查是否应该重试
        if (!this.shouldRetry(error)) {
          throw error;
        }

        // 计算延迟并等待
        const delay = this._calculateDelay(attempt);
        this.stats.retriedCalls++;

        console.warn(
          `Retry attempt ${attempt + 1}/${this.maxRetries} for ${operation} ` +
          `after ${delay}ms: ${error.message}`
        );

        await this._delay(delay);
      }
    }

    throw lastError;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      retriedCalls: 0
    };
  }

  // ==================== 私有方法 ====================

  _calculateDelay(attempt) {
    const delay = this.baseDelay * Math.pow(this.backoffFactor, attempt);
    return Math.min(delay, this.maxDelay);
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = RetryExecutor;