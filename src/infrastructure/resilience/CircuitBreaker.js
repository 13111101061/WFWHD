/**
 * CircuitBreaker - 熔断器
 * 实现熔断器模式，防止级联故障
 *
 * 状态机：CLOSED -> OPEN -> HALF_OPEN -> CLOSED
 */

class CircuitBreaker {
  /**
   * @param {Object} options
   * @param {number} [options.failureThreshold=5] - 触发熔断的失败次数
   * @param {number} [options.successThreshold=2] - 半开状态下恢复的成功次数
   * @param {number} [options.timeout=60000] - 熔断超时时间(ms)
   * @param {string} [options.name='default'] - 熔断器名称
   */
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000;

    // 状态
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.openedAt = null;

    // 统计
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      stateChanges: 0
    };
  }

  /**
   * 执行函数（带熔断保护）
   * @param {Function} fn - 要执行的异步函数
   * @returns {Promise<any>}
   */
  async execute(fn) {
    this.stats.totalCalls++;

    // 检查熔断状态
    if (this.state === 'OPEN') {
      if (this._shouldAttemptReset()) {
        this._transitionTo('HALF_OPEN');
      } else {
        this.stats.rejectedCalls++;
        throw this._createError('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  /**
   * 检查熔断器是否打开
   */
  isOpen() {
    if (this.state === 'OPEN') {
      return !this._shouldAttemptReset();
    }
    return false;
  }

  /**
   * 获取当前状态
   */
  getState() {
    return this.state;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      name: this.name,
      state: this.state,
      ...this.stats,
      failureRate: this.stats.totalCalls > 0
        ? (this.stats.failedCalls / this.stats.totalCalls * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * 强制打开熔断器
   */
  trip() {
    this._transitionTo('OPEN');
  }

  /**
   * 重置熔断器
   */
  reset() {
    this._transitionTo('CLOSED');
    this.failureCount = 0;
    this.successCount = 0;
  }

  // ==================== 私有方法 ====================

  _onSuccess() {
    this.stats.successfulCalls++;
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this._transitionTo('CLOSED');
      }
    }
  }

  _onFailure() {
    this.stats.failedCalls++;
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.state === 'HALF_OPEN') {
      this._transitionTo('OPEN');
    } else if (this.failureCount >= this.failureThreshold) {
      this._transitionTo('OPEN');
    }
  }

  _shouldAttemptReset() {
    if (!this.openedAt) return false;
    return Date.now() - this.openedAt >= this.timeout;
  }

  _transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.stats.stateChanges++;

    if (newState === 'OPEN') {
      this.openedAt = Date.now();
    } else if (newState === 'CLOSED') {
      this.openedAt = null;
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === 'HALF_OPEN') {
      this.successCount = 0;
    }

    console.log(`[${this.name}] Circuit breaker: ${oldState} -> ${newState}`);
  }

  _createError(message) {
    const error = new Error(message);
    error.code = 'CIRCUIT_BREAKER_OPEN';
    error.circuitBreaker = this.name;
    error.state = this.state;
    error.retryAfter = this.openedAt
      ? Math.ceil((this.timeout - (Date.now() - this.openedAt)) / 1000)
      : Math.ceil(this.timeout / 1000);
    return error;
  }
}

module.exports = CircuitBreaker;