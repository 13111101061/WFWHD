/**
 * CredentialSelector - 凭证选择策略
 *
 * 实现多种选择策略: priority, round_robin, weighted
 */

/**
 * 选择策略枚举
 */
const SelectionStrategy = {
  PRIORITY: 'priority',
  ROUND_ROBIN: 'round_robin',
  WEIGHTED: 'weighted'
};

class CredentialSelector {
  /**
   * @param {string} strategy - 选择策略
   */
  constructor(strategy = SelectionStrategy.PRIORITY) {
    this.strategy = strategy;
    this.roundRobinIndex = new Map(); // provider -> index
  }

  /**
   * 选择一个账号
   * @param {Array<Object>} accounts - 可用账号列表
   * @param {Object} options - 选择选项
   * @param {Function} options.isAvailable - 检查账号是否可用的函数
   * @param {string} options.serviceKey - 服务标识（用于过滤）
   * @returns {Object|null} - 选中的账号
   */
  select(accounts, options = {}) {
    const { isAvailable = () => true, serviceKey = null } = options;

    // 过滤可用账号
    let candidates = accounts.filter(account => {
      // 检查是否启用
      if (!account.enabled) return false;

      // 检查健康状态
      if (!isAvailable(account)) return false;

      // 检查服务绑定
      if (serviceKey && account.services?.length > 0) {
        if (!account.services.includes(serviceKey)) return false;
      }

      return true;
    });

    if (candidates.length === 0) {
      return null;
    }

    // 根据策略选择
    switch (this.strategy) {
      case SelectionStrategy.ROUND_ROBIN:
        return this._selectRoundRobin(candidates, options.providerKey);

      case SelectionStrategy.WEIGHTED:
        return this._selectWeighted(candidates);

      case SelectionStrategy.PRIORITY:
      default:
        return this._selectPriority(candidates);
    }
  }

  /**
   * 按优先级选择
   * 选择 priority 最小（优先级最高）的账号
   * @param {Array<Object>} accounts
   * @returns {Object}
   */
  _selectPriority(accounts) {
    // 按 priority 升序排序
    const sorted = [...accounts].sort((a, b) => {
      const pa = a.priority ?? 100;
      const pb = b.priority ?? 100;
      return pa - pb;
    });

    return sorted[0];
  }

  /**
   * 轮询选择
   * 按顺序循环选择账号
   * @param {Array<Object>} accounts
   * @param {string} providerKey - 用于维护轮询索引
   * @returns {Object}
   */
  _selectRoundRobin(accounts, providerKey) {
    // 按 priority 排序以保持稳定顺序
    const sorted = [...accounts].sort((a, b) => {
      const pa = a.priority ?? 100;
      const pb = b.priority ?? 100;
      return pa - pb;
    });

    const key = providerKey || 'default';
    const index = this.roundRobinIndex.get(key) || 0;
    const selectedIndex = index % sorted.length;

    // 更新索引
    this.roundRobinIndex.set(key, selectedIndex + 1);

    return sorted[selectedIndex];
  }

  /**
   * 加权随机选择
   * 根据 weight 属性进行加权随机
   * @param {Array<Object>} accounts
   * @returns {Object}
   */
  _selectWeighted(accounts) {
    // 计算总权重
    const totalWeight = accounts.reduce((sum, a) => sum + (a.weight ?? 1), 0);

    if (totalWeight <= 0) {
      // 所有权重为 0，回退到第一个
      return accounts[0];
    }

    // 生成随机数
    let random = Math.random() * totalWeight;

    // 选择账号
    for (const account of accounts) {
      const weight = account.weight ?? 1;
      random -= weight;

      if (random <= 0) {
        return account;
      }
    }

    // 回退到最后一个
    return accounts[accounts.length - 1];
  }

  /**
   * 重置轮询索引
   * @param {string} providerKey
   */
  resetRoundRobin(providerKey) {
    const key = providerKey || 'default';
    this.roundRobinIndex.delete(key);
  }

  /**
   * 重置所有轮询索引
   */
  resetAllRoundRobin() {
    this.roundRobinIndex.clear();
  }

  /**
   * 设置策略
   * @param {string} strategy
   */
  setStrategy(strategy) {
    if (Object.values(SelectionStrategy).includes(strategy)) {
      this.strategy = strategy;
    } else {
      throw new Error(`Unknown strategy: ${strategy}`);
    }
  }
}

module.exports = {
  CredentialSelector,
  SelectionStrategy
};