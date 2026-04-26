/**
 * ProviderDescriptorRegistry - 服务商描述注册表
 *
 * 从 ProviderManifest 统一加载配置（替代散落在多个文件中的定义）
 *
 * 职责：
 * - 管理 provider/service 静态描述信息
 * - 维护 canonical key 与 alias 映射
 * - 对查询展示层提供稳定目录信息
 */

const { ProviderManifest } = require('../providers/manifests/ProviderManifest');

let _aliasToCanonicalMap = null;
let _canonicalToAliasesMap = null;
let _initialized = false;

function _ensureMapsInitialized() {
  if (_initialized) return;

  ProviderManifest._ensureLoaded();
  _aliasToCanonicalMap = ProviderManifest.buildAliasMap();

  // Build canonical -> aliases reverse mapping
  _canonicalToAliasesMap = new Map();
  const serviceKeys = ProviderManifest.getAllServiceKeys();
  for (const key of serviceKeys) {
    const cfg = ProviderManifest.getServiceConfig(key);
    if (cfg?.aliases) {
      _canonicalToAliasesMap.set(key, cfg.aliases);
    }
  }

  _initialized = true;
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

    const cfg = ProviderManifest.getServiceConfig(canonicalKey);
    if (!cfg) return null;

    return {
      key: canonicalKey,
      provider: cfg.providerKey,
      service: cfg._canonicalKey,
      displayName: cfg.displayName || canonicalKey,
      description: cfg.description || '',
      status: cfg.status || 'stable',
      aliases: cfg.aliases || [],
      protocol: cfg.protocol || 'http',
      category: 'tts',
      supportsStreaming: cfg.supportsStreaming || false,
      supportsAsync: cfg.supportsAsync || false
    };
  },

  /**
   * 解析为 canonical key
   */
  resolveCanonicalKey(key) {
    _ensureMapsInitialized();
    return _aliasToCanonicalMap.get(key) || null;
  },

  /**
   * 检查 key 是否有效
   */
  has(key) {
    _ensureMapsInitialized();
    return _aliasToCanonicalMap.has(key);
  },

  /**
   * 获取所有服务描述列表
   */
  getAll() {
    _ensureMapsInitialized();
    return ProviderManifest.getAllServiceDescriptors().map(cfg => ({
      key: cfg._canonicalKey,
      provider: cfg.providerKey,
      service: cfg._canonicalKey,
      displayName: cfg.displayName || cfg.key,
      description: cfg.description || '',
      status: cfg.status || 'stable',
      aliases: cfg.aliases || [],
      protocol: cfg.protocol || 'http',
      category: 'tts',
      supportsStreaming: cfg.supportsStreaming || false,
      supportsAsync: cfg.supportsAsync || false
    }));
  },

  /**
   * 获取所有 canonical keys
   */
  getAllCanonicalKeys() {
    _ensureMapsInitialized();
    return ProviderManifest.getAllServiceKeys();
  },

  /**
   * 获取服务的别名列表
   */
  getAliases(canonicalKey) {
    _ensureMapsInitialized();
    return _canonicalToAliasesMap.get(canonicalKey) || [];
  },

  /**
   * 按 provider 分组获取服务
   */
  getByProvider() {
    _ensureMapsInitialized();
    const result = {};
    const serviceKeys = ProviderManifest.getAllServiceKeys();
    for (const key of serviceKeys) {
      const descriptor = this.get(key);
      if (!descriptor) continue;
      const { provider } = descriptor;
      if (!result[provider]) result[provider] = [];
      result[provider].push(descriptor);
    }
    return result;
  },

  // ==================== Provider 层操作 ====================

  getProvider(providerKey) {
    return ProviderManifest.getProviderMeta(providerKey);
  },

  getAllProviders() {
    return ProviderManifest.getAllProviders();
  },

  getServicesByProvider(providerKey) {
    _ensureMapsInitialized();
    const services = ProviderManifest.getProviderServices(providerKey);
    return services.map(cfg => ({
      key: cfg.key,
      provider: cfg.providerKey || providerKey,
      service: cfg.key,   // getProviderServices 返回的 entries 中 key 就是 serviceKey
      displayName: cfg.displayName || cfg.key,
      description: cfg.description || '',
      status: cfg.status || 'stable',
      aliases: cfg.aliases || [],
      protocol: cfg.protocol || 'http',
      category: 'tts',
      supportsStreaming: cfg.supportsStreaming || false,
      supportsAsync: cfg.supportsAsync || false
    }));
  },

  // ==================== 状态统计 ====================

  getStats() {
    _ensureMapsInitialized();
    return ProviderManifest.getStats();
  }
};

module.exports = {
  ProviderDescriptorRegistry
};
