/**
 * ProviderDescriptorRegistry - 服务商描述注册表
 *
 * 职责：
 * - 管理 provider/service 静态描述信息
 * - 维护 canonical key 与 alias 映射
 * - 对查询展示层提供稳定目录信息
 *
 * 设计原则：
 * - 只管理静态描述信息，不涉及运行时状态
 * - 不涉及 adapter 实例管理
 * - 不涉及凭证状态
 *
 * [重构] 数据来源统一：
 * - 从 adapters/providers/index.js 读取注册信息
 * - 不再重复定义 descriptors
 */

// Provider 信息（服务商级别的元数据，与具体服务无关）
const providers = {
  aliyun: {
    key: 'aliyun',
    displayName: '阿里云',
    description: '阿里云智能语音服务',
    status: 'stable',
    protocolTypes: ['http'],
    credentialMode: 'apiKey'
  },
  tencent: {
    key: 'tencent',
    displayName: '腾讯云',
    description: '腾讯云语音合成服务',
    status: 'stable',
    protocolTypes: ['http'],
    credentialMode: 'secretKey'
  },
  volcengine: {
    key: 'volcengine',
    displayName: '火山引擎',
    description: '火山引擎语音合成服务',
    status: 'stable',
    protocolTypes: ['http'],
    credentialMode: 'accessKey'
  },
  minimax: {
    key: 'minimax',
    displayName: 'MiniMax',
    description: 'MiniMax AI 语音服务',
    status: 'beta',
    protocolTypes: ['http'],
    credentialMode: 'apiKey'
  },
  moss: {
    key: 'moss',
    displayName: 'MOSS',
    description: 'MOSS 语音合成服务',
    status: 'beta',
    protocolTypes: ['http'],
    credentialMode: 'apiKey'
  }
};

// 延迟加载，避免循环依赖
let _adaptersModule = null;
let _aliasToCanonicalMap = null;
let _canonicalToAliasesMap = null;

function getAdaptersModule() {
  if (!_adaptersModule) {
    _adaptersModule = require('../adapters/providers');
  }
  return _adaptersModule;
}

function _ensureMapsInitialized() {
  if (_aliasToCanonicalMap) return;

  const adapters = getAdaptersModule();
  const adapterMap = adapters.adapters || {};

  _aliasToCanonicalMap = new Map();
  _canonicalToAliasesMap = new Map();

  Object.keys(adapterMap).forEach(canonicalKey => {
    // canonical key 映射到自身
    _aliasToCanonicalMap.set(canonicalKey, canonicalKey);

    // 记录每个 canonical key 的别名列表
    const aliases = adapterMap[canonicalKey].aliases || [];
    _canonicalToAliasesMap.set(canonicalKey, aliases);

    // 注册所有别名
    aliases.forEach(alias => {
      _aliasToCanonicalMap.set(alias, canonicalKey);
    });
  });
}

const ProviderDescriptorRegistry = {
  /**
   * 获取服务描述
   * @param {string} key - canonical key 或 alias
   * @returns {Object|null}
   */
  get(key) {
    _ensureMapsInitialized();
    const canonicalKey = _aliasToCanonicalMap.get(key);
    if (!canonicalKey) return null;

    const adapters = getAdaptersModule();
    return adapters.getDescriptor(canonicalKey);
  },

  /**
   * 解析为 canonical key
   * @param {string} key - 任意有效的 key 或 alias
   * @returns {string|null}
   */
  resolveCanonicalKey(key) {
    _ensureMapsInitialized();
    return _aliasToCanonicalMap.get(key) || null;
  },

  /**
   * 检查 key 是否有效
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    _ensureMapsInitialized();
    return _aliasToCanonicalMap.has(key);
  },

  /**
   * 获取所有服务描述列表
   * @returns {Object[]}
   */
  getAll() {
    const adapters = getAdaptersModule();
    return adapters.getAllDescriptors();
  },

  /**
   * 获取所有 canonical keys
   * @returns {string[]}
   */
  getAllCanonicalKeys() {
    const adapters = getAdaptersModule();
    return adapters.getCanonicalKeys();
  },

  /**
   * 获取服务的别名列表
   * @param {string} canonicalKey
   * @returns {string[]}
   */
  getAliases(canonicalKey) {
    _ensureMapsInitialized();
    return _canonicalToAliasesMap.get(canonicalKey) || [];
  },

  /**
   * 按 provider 分组获取服务
   * @returns {Object}
   */
  getByProvider() {
    const adapters = getAdaptersModule();
    const descriptors = adapters.getAllDescriptors();
    const result = {};

    descriptors.forEach(descriptor => {
      const { provider } = descriptor;
      if (!result[provider]) {
        result[provider] = [];
      }
      result[provider].push(descriptor);
    });

    return result;
  },

  // ==================== Provider 层操作 ====================

  /**
   * 获取 Provider 信息
   * @param {string} providerKey
   * @returns {Object|null}
   */
  getProvider(providerKey) {
    return providers[providerKey] || null;
  },

  /**
   * 获取所有 Provider 列表
   * @returns {Object[]}
   */
  getAllProviders() {
    return Object.values(providers);
  },

  /**
   * 获取 Provider 下的所有服务
   * @param {string} providerKey
   * @returns {Object[]}
   */
  getServicesByProvider(providerKey) {
    const adapters = getAdaptersModule();
    const descriptors = adapters.getAllDescriptors();
    return descriptors.filter(d => d.provider === providerKey);
  },

  // ==================== 状态统计 ====================

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const adapters = getAdaptersModule();
    const descriptors = adapters.getAllDescriptors();

    const stats = {
      totalServices: descriptors.length,
      totalProviders: Object.keys(providers).length,
      byStatus: {},
      byProvider: {},
      byProtocol: {}
    };

    descriptors.forEach(descriptor => {
      // 按状态统计
      const status = descriptor.status || 'unknown';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

      // 按 provider 统计
      const { provider } = descriptor;
      stats.byProvider[provider] = (stats.byProvider[provider] || 0) + 1;

      // 按协议统计
      const protocol = descriptor.protocol || 'unknown';
      stats.byProtocol[protocol] = (stats.byProtocol[protocol] || 0) + 1;
    });

    return stats;
  }
};

module.exports = {
  ProviderDescriptorRegistry,
  providers
};
