/**
 * CredentialPool - 凭证池
 *
 * 管理单个 provider 的账号池
 * 整合健康追踪和选择策略
 */

const { CredentialHealthTracker, HealthStatus } = require('./CredentialHealthTracker');
const { CredentialSelector, SelectionStrategy } = require('./CredentialSelector');

class CredentialPool {
  /**
   * @param {Object} config - 池配置
   * @param {string} config.key - Provider 标识
   * @param {string} config.name - Provider 名称
   * @param {string} config.description - 描述
   * @param {string} config.selector - 选择策略
   * @param {Object} config.circuitBreaker - 熔断器配置
   * @param {string[]} config.requiredFields - 必填字段
   * @param {Array<Object>} config.accounts - 账号列表
   */
  constructor(config) {
    this.key = config.key;
    this.name = config.name;
    this.description = config.description;
    this.requiredFields = config.requiredFields || [];

    // 初始化健康追踪器
    this.healthTracker = new CredentialHealthTracker(config.circuitBreaker);

    // 初始化选择器
    this.selector = new CredentialSelector(config.selector || SelectionStrategy.PRIORITY);

    // 存储账号
    this.accounts = new Map();

    // 加载账号
    if (config.accounts && Array.isArray(config.accounts)) {
      for (const account of config.accounts) {
        this.addAccount(account);
      }
    }
  }

  /**
   * 添加账号
   * @param {Object} account
   */
  addAccount(account) {
    if (!account.id) {
      throw new Error('Account must have an id');
    }

    this.accounts.set(account.id, {
      id: account.id,
      name: account.name || account.id,
      credentials: account.credentials || {},
      services: account.services || [],
      priority: account.priority ?? 100,
      weight: account.weight ?? 1,
      enabled: account.enabled !== false,
      metadata: account.metadata || {}
    });
  }

  /**
   * 获取账号
   * @param {string} accountId
   * @returns {Object|null}
   */
  getAccount(accountId) {
    return this.accounts.get(accountId) || null;
  }

  /**
   * 获取所有账号
   * @returns {Array<Object>}
   */
  getAllAccounts() {
    return Array.from(this.accounts.values());
  }

  /**
   * 获取账号列表（带健康状态，不含凭证）
   * @returns {Array<Object>}
   */
  getAccountsWithHealth() {
    return this.getAllAccounts().map(account => this._sanitizeAccount(account));
  }

  /**
   * 获取账号公开信息（不含凭证）
   * @param {string} accountId
   * @returns {Object|null}
   */
  getAccountPublic(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) return null;
    return this._sanitizeAccount(account);
  }

  /**
   * 脱敏账号信息（移除凭证）
   * @param {Object} account
   * @returns {Object}
   */
  _sanitizeAccount(account) {
    const { credentials, ...publicInfo } = account;

    // 标记凭证是否已配置（不暴露实际值）
    const hasCredentials = credentials && Object.keys(credentials).length > 0;
    const credentialStatus = {};
    if (credentials) {
      for (const key of Object.keys(credentials)) {
        const value = credentials[key];
        credentialStatus[key] = {
          configured: !!(value && value.length > 0),
          // 仅显示前4位和后4位
          preview: value && value.length > 12
            ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
            : (value ? '****' : null)
        };
      }
    }

    return {
      ...publicInfo,
      health: this.healthTracker.getStatus(this.key, account.id),
      credentialStatus,
      hasCredentials
    };
  }

  /**
   * 启用账号
   * @param {string} accountId
   */
  enableAccount(accountId) {
    const account = this.accounts.get(accountId);
    if (account) {
      account.enabled = true;
    }
  }

  /**
   * 禁用账号
   * @param {string} accountId
   */
  disableAccount(accountId) {
    const account = this.accounts.get(accountId);
    if (account) {
      account.enabled = false;
    }
  }

  /**
   * 选择凭证
   * @param {string} serviceKey - 服务标识
   * @param {Object} context - 选择上下文
   * @returns {Object|null} - { credentials, accountId, account }
   */
  selectCredentials(serviceKey = null, context = {}) {
    const allAccounts = this.getAllAccounts();

    const selected = this.selector.select(allAccounts, {
      providerKey: this.key,
      serviceKey,
      isAvailable: (account) => this.healthTracker.isAvailable(this.key, account.id)
    });

    if (!selected) {
      return null;
    }

    // 记录半开状态调用
    const health = this.healthTracker.getOrCreate(this.key, selected.id);
    if (health.status === HealthStatus.UNHEALTHY) {
      this.healthTracker.recordHalfOpenCall(this.key, selected.id);
    }

    return {
      credentials: { ...selected.credentials },
      accountId: selected.id,
      account: {
        id: selected.id,
        name: selected.name,
        priority: selected.priority,
        weight: selected.weight,
        health: this.healthTracker.getStatus(this.key, selected.id)
      }
    };
  }

  /**
   * 报告成功
   * @param {string} accountId
   * @param {string} serviceKey
   */
  reportSuccess(accountId, serviceKey) {
    this.healthTracker.reportSuccess(this.key, accountId, serviceKey);
  }

  /**
   * 报告失败
   * @param {string} accountId
   * @param {string} serviceKey
   * @param {Error} error
   */
  reportFailure(accountId, serviceKey, error) {
    this.healthTracker.reportFailure(this.key, accountId, serviceKey, error);
  }

  /**
   * 检查账号是否可用
   * @param {string} accountId
   * @returns {boolean}
   */
  isAccountAvailable(accountId) {
    const account = this.accounts.get(accountId);
    if (!account || !account.enabled) {
      return false;
    }

    return this.healthTracker.isAvailable(this.key, accountId);
  }

  /**
   * 重置账号熔断状态
   * @param {string} accountId
   */
  resetCircuit(accountId) {
    this.healthTracker.reset(this.key, accountId);
  }

  /**
   * 获取健康状态
   * @returns {Object}
   */
  getHealthStatus() {
    const accounts = this.getAccountsWithHealth();

    // 计算整体状态
    let overallStatus = HealthStatus.HEALTHY;
    let healthyCount = 0;
    let degradedCount = 0;
    let unhealthyCount = 0;

    for (const account of accounts) {
      const status = account.health.status;

      if (status === HealthStatus.HEALTHY) healthyCount++;
      else if (status === HealthStatus.DEGRADED) {
        degradedCount++;
        if (overallStatus === HealthStatus.HEALTHY) {
          overallStatus = HealthStatus.DEGRADED;
        }
      }
      else {
        unhealthyCount++;
        overallStatus = HealthStatus.UNHEALTHY;
      }
    }

    return {
      provider: this.key,
      name: this.name,
      overallStatus,
      totalAccounts: accounts.length,
      healthyCount,
      degradedCount,
      unhealthyCount,
      accounts: accounts.map(a => ({
        id: a.id,
        name: a.name,
        enabled: a.enabled,
        status: a.health.status,
        consecutiveFailures: a.health.consecutiveFailures,
        lastSuccessAt: a.health.lastSuccessAt,
        lastFailureAt: a.health.lastFailureAt
      }))
    };
  }

  /**
   * 验证账号凭证
   * @param {Object} credentials
   * @returns {{ valid: boolean, missing: string[] }}
   */
  validateCredentials(credentials) {
    const missing = this.requiredFields.filter(field => {
      const value = credentials[field];
      return !value || value === '';
    });

    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * 获取第一个有效凭证（向后兼容）
   * @returns {Object|null}
   */
  getFirstValidCredentials() {
    for (const account of this.accounts.values()) {
      if (!account.enabled) continue;

      const validation = this.validateCredentials(account.credentials);
      if (validation.valid) {
        return account.credentials;
      }
    }

    return null;
  }

  /**
   * 获取池状态摘要
   * @returns {Object}
   */
  getSummary() {
    const accounts = this.getAllAccounts();

    return {
      key: this.key,
      name: this.name,
      description: this.description,
      accountCount: accounts.length,
      enabledCount: accounts.filter(a => a.enabled).length,
      selector: this.selector.strategy,
      circuitBreakerEnabled: this.healthTracker.config.enabled
    };
  }
}

module.exports = {
  CredentialPool,
  HealthStatus,
  SelectionStrategy
};