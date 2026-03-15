/**
 * CredentialHealthTracker - 凭证健康追踪器
 *
 * 管理账号的健康状态，实现熔断器逻辑
 */

/**
 * 健康状态枚举
 */
const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  CIRCUIT_OPEN: 'circuit_open'
};

/**
 * 默认熔断器配置
 */
const DEFAULT_CIRCUIT_BREAKER = {
  enabled: true,
  failureThreshold: 5,      // 连续失败次数阈值
  resetTimeout: 60000,      // 熔断恢复时间 (ms)
  halfOpenMaxCalls: 1       // 半开状态最大调用次数
};

class CredentialHealthTracker {
  /**
   * @param {Object} config - 熔断器配置
   */
  constructor(config = {}) {
    this.config = {
      ...DEFAULT_CIRCUIT_BREAKER,
      ...config
    };

    // 账号健康状态存储
    // Map<accountKey, HealthState>
    this.healthStates = new Map();
  }

  /**
   * 生成账号键
   * @param {string} providerKey
   * @param {string} accountId
   * @returns {string}
   */
  _getKey(providerKey, accountId) {
    return `${providerKey}:${accountId}`;
  }

  /**
   * 获取或创建健康状态
   * @param {string} providerKey
   * @param {string} accountId
   * @returns {Object}
   */
  getOrCreate(providerKey, accountId) {
    const key = this._getKey(providerKey, accountId);

    if (!this.healthStates.has(key)) {
      this.healthStates.set(key, this._createInitialState());
    }

    return this.healthStates.get(key);
  }

  /**
   * 创建初始健康状态
   * @returns {Object}
   */
  _createInitialState() {
    return {
      status: HealthStatus.HEALTHY,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      circuitOpenAt: null,
      halfOpenCalls: 0
    };
  }

  /**
   * 报告成功
   * @param {string} providerKey
   * @param {string} accountId
   * @param {string} serviceKey
   */
  reportSuccess(providerKey, accountId, serviceKey) {
    const state = this.getOrCreate(providerKey, accountId);

    state.consecutiveFailures = 0;
    state.consecutiveSuccesses++;
    state.totalSuccesses++;
    state.lastSuccessAt = new Date().toISOString();

    // 如果是熔断或半开状态，重置为健康
    if (state.status === HealthStatus.CIRCUIT_OPEN ||
        state.status === HealthStatus.UNHEALTHY) {
      state.status = HealthStatus.HEALTHY;
      state.circuitOpenAt = null;
      state.halfOpenCalls = 0;
    } else if (state.status === HealthStatus.DEGRADED && state.consecutiveSuccesses >= 3) {
      // 降级状态下连续成功 3 次，恢复健康
      state.status = HealthStatus.HEALTHY;
    }
  }

  /**
   * 报告失败
   * @param {string} providerKey
   * @param {string} accountId
   * @param {string} serviceKey
   * @param {Error} error
   */
  reportFailure(providerKey, accountId, serviceKey, error) {
    const state = this.getOrCreate(providerKey, accountId);

    state.consecutiveSuccesses = 0;
    state.consecutiveFailures++;
    state.totalFailures++;
    state.lastFailureAt = new Date().toISOString();
    state.lastError = error?.message || 'Unknown error';

    // 检查是否需要熔断
    if (this.config.enabled &&
        state.consecutiveFailures >= this.config.failureThreshold) {
      this._openCircuit(state);
    } else if (state.consecutiveFailures >= 2) {
      // 连续失败 2 次进入降级状态
      state.status = HealthStatus.DEGRADED;
    }
  }

  /**
   * 打开熔断器
   * @param {Object} state
   */
  _openCircuit(state) {
    state.status = HealthStatus.CIRCUIT_OPEN;
    state.circuitOpenAt = Date.now();
    state.halfOpenCalls = 0;
  }

  /**
   * 检查账号是否可用
   * @param {string} providerKey
   * @param {string} accountId
   * @returns {boolean}
   */
  isAvailable(providerKey, accountId) {
    if (!this.config.enabled) {
      return true;
    }

    const state = this.getOrCreate(providerKey, accountId);

    // 健康或降级状态可用
    if (state.status === HealthStatus.HEALTHY ||
        state.status === HealthStatus.DEGRADED) {
      return true;
    }

    // 熔断状态检查是否可以尝试恢复
    if (state.status === HealthStatus.CIRCUIT_OPEN) {
      const elapsed = Date.now() - state.circuitOpenAt;

      if (elapsed >= this.config.resetTimeout) {
        // 进入半开状态
        state.status = HealthStatus.UNHEALTHY;
        state.halfOpenCalls = 0;
        return true;
      }

      return false;
    }

    // UNHEALTHY 状态 (半开)，允许有限调用
    if (state.status === HealthStatus.UNHEALTHY) {
      return state.halfOpenCalls < this.config.halfOpenMaxCalls;
    }

    return false;
  }

  /**
   * 记录半开状态调用
   * @param {string} providerKey
   * @param {string} accountId
   */
  recordHalfOpenCall(providerKey, accountId) {
    const state = this.getOrCreate(providerKey, accountId);
    state.halfOpenCalls++;
  }

  /**
   * 获取健康状态摘要
   * @param {string} providerKey
   * @param {string} accountId
   * @returns {Object}
   */
  getStatus(providerKey, accountId) {
    const state = this.getOrCreate(providerKey, accountId);

    return {
      status: state.status,
      consecutiveFailures: state.consecutiveFailures,
      consecutiveSuccesses: state.consecutiveSuccesses,
      totalSuccesses: state.totalSuccesses,
      totalFailures: state.totalFailures,
      successRate: this._calculateSuccessRate(state),
      lastSuccessAt: state.lastSuccessAt,
      lastFailureAt: state.lastFailureAt,
      circuitOpenAt: state.circuitOpenAt,
      lastError: state.lastError
    };
  }

  /**
   * 计算成功率
   * @param {Object} state
   * @returns {number}
   */
  _calculateSuccessRate(state) {
    const total = state.totalSuccesses + state.totalFailures;
    if (total === 0) return 1;
    return state.totalSuccesses / total;
  }

  /**
   * 重置账号健康状态
   * @param {string} providerKey
   * @param {string} accountId
   */
  reset(providerKey, accountId) {
    const key = this._getKey(providerKey, accountId);
    this.healthStates.set(key, this._createInitialState());
  }

  /**
   * 重置所有健康状态
   */
  resetAll() {
    this.healthStates.clear();
  }

  /**
   * 获取所有账号的健康状态
   * @returns {Array<Object>}
   */
  getAllStatuses() {
    const result = [];

    for (const [key, state] of this.healthStates) {
      const [providerKey, accountId] = key.split(':');
      result.push({
        providerKey,
        accountId,
        ...this.getStatus(providerKey, accountId)
      });
    }

    return result;
  }
}

module.exports = {
  CredentialHealthTracker,
  HealthStatus
};