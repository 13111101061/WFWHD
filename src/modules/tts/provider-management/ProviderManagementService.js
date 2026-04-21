/**
 * ProviderManagementService - 服务商管理服务
 *
 * 职责：
 * - 统一服务商 canonical key 解析
 * - 统一 adapter 注册与实例管理
 * - 汇总 provider 元信息
 * - 汇总凭证状态/账号池状态/健康状态
 * - 提供查询侧和执行侧共用的 provider 信息入口
 *
 * 设计原则：
 * - 作为服务商管理的唯一门面
 * - 查询侧和执行侧都通过此服务获取信息
 * - 不处理具体合成请求，只提供管理功能
 */

const { ProviderDescriptorRegistry } = require('./ProviderDescriptorRegistry');
const { ProviderRuntimeRegistry } = require('./ProviderRuntimeRegistry');
let serviceInitialized = false;

// 凭证模块（延迟加载，避免循环依赖）
let credentialsModule = null;

function getCredentialsModule() {
  if (!credentialsModule) {
    try {
      credentialsModule = require('../../credentials');
    } catch (e) {
      credentialsModule = null;
    }
  }
  return credentialsModule;
}

/**
 * ProviderManagementService
 */
const ProviderManagementService = {
  /**
   * 确保已完成初始化
   * @private
   */
  _ensureInitialized() {
    if (!serviceInitialized) {
      this.initialize();
    }
  },

  // ==================== Key 解析 ====================

  /**
   * 解析为 canonical key
   * @param {string} key - 任意有效的 key 或 alias
   * @returns {string|null}
   */
  resolveCanonicalKey(key) {
    this._ensureInitialized();
    return ProviderDescriptorRegistry.resolveCanonicalKey(key);
  },

  /**
   * 检查 key 是否有效
   * @param {string} key
   * @returns {boolean}
   */
  isValidKey(key) {
    this._ensureInitialized();
    return ProviderDescriptorRegistry.has(key);
  },

  // ==================== 服务信息查询 ====================

  /**
   * 获取服务描述
   * @param {string} serviceKey - canonical key 或 alias
   * @returns {Object|null}
   */
  getServiceDescriptor(serviceKey) {
    this._ensureInitialized();
    return ProviderDescriptorRegistry.get(serviceKey);
  },

  /**
   * 获取所有服务列表
   * @param {Object} options - 过滤选项
   * @returns {Object[]}
   */
  getAllServices(options = {}) {
    this._ensureInitialized();
    let services = ProviderDescriptorRegistry.getAll();

    // 按状态过滤
    if (options.status) {
      services = services.filter(s => s.status === options.status);
    }

    // 按 provider 过滤
    if (options.provider) {
      services = services.filter(s => s.provider === options.provider);
    }

    // 按协议过滤
    if (options.protocol) {
      services = services.filter(s => s.protocol === options.protocol);
    }

    return services;
  },

  /**
   * 按 provider 分组获取服务
   * @returns {Object}
   */
  getServicesByProvider() {
    this._ensureInitialized();
    return ProviderDescriptorRegistry.getByProvider();
  },

  // ==================== Provider 信息查询 ====================

  /**
   * 获取 Provider 信息
   * @param {string} providerKey
   * @returns {Object|null}
   */
  getProvider(providerKey) {
    this._ensureInitialized();
    return ProviderDescriptorRegistry.getProvider(providerKey);
  },

  /**
   * 获取所有 Provider 列表
   * @returns {Object[]}
   */
  getAllProviders() {
    this._ensureInitialized();
    return ProviderDescriptorRegistry.getAllProviders();
  },

  /**
   * 获取 Provider 下的所有服务
   * @param {string} providerKey
   * @returns {Object[]}
   */
  getProviderServices(providerKey) {
    this._ensureInitialized();
    return ProviderDescriptorRegistry.getServicesByProvider(providerKey);
  },

  // ==================== 运行时管理 ====================

  /**
   * 检查服务是否可用
   * @param {string} serviceKey
   * @returns {Object} { available: boolean, reason: string, details: Object }
   */
  checkServiceAvailability(serviceKey) {
    this._ensureInitialized();
    const canonicalKey = this.resolveCanonicalKey(serviceKey);
    const result = {
      available: false,
      reason: 'unknown',
      details: {}
    };

    // 1. 检查服务是否存在
    if (!canonicalKey) {
      result.reason = 'service_not_found';
      return result;
    }

    const descriptor = this.getServiceDescriptor(canonicalKey);
    result.details.descriptor = descriptor;

    // 2. 检查服务状态
    if (descriptor.status === 'disabled') {
      result.reason = 'service_disabled';
      return result;
    }

    // 3. 检查 adapter 是否注册
    const adapterAvailable = ProviderRuntimeRegistry.hasAdapterClass(canonicalKey);
    result.details.adapterRegistered = adapterAvailable;

    if (!adapterAvailable) {
      result.reason = 'adapter_not_registered';
      return result;
    }

    // 4. 检查凭证配置
    const creds = getCredentialsModule();
    if (creds) {
      const credentialStatus = this._checkCredentialStatus(descriptor.provider);
      result.details.credentials = credentialStatus;

      if (!credentialStatus.configured) {
        result.reason = 'credentials_not_configured';
        return result;
      }
    }

    result.available = true;
    result.reason = 'ok';
    return result;
  },

  /**
   * 检查凭证状态
   * @private
   */
  _checkCredentialStatus(providerKey) {
    const creds = getCredentialsModule();
    if (!creds) {
      return { configured: false, reason: 'module_not_available' };
    }

    try {
      const isConfigured = creds.isConfigured(providerKey);
      return {
        configured: isConfigured,
        reason: isConfigured ? 'ok' : 'not_configured'
      };
    } catch (e) {
      return { configured: false, reason: 'error', error: e.message };
    }
  },

  /**
   * 获取或创建 Adapter 实例
   * @param {string} serviceKey
   * @param {Object} config
   * @returns {Object} Adapter 实例
   */
  getAdapter(serviceKey, config = {}) {
    this._ensureInitialized();
    return ProviderRuntimeRegistry.getOrCreateAdapter(serviceKey, config);
  },

  /**
   * 清理运行时 Adapter 缓存
   * @param {string} [serviceKey]
   */
  clearRuntimeCache(serviceKey) {
    this._ensureInitialized();
    ProviderRuntimeRegistry.clearCachedAdapters(serviceKey);
  },

  // ==================== 综合信息查询 ====================

  /**
   * 获取服务的完整信息（供前端展示和后端执行共用）
   * @param {string} serviceKey
   * @returns {Object}
   */
  getServiceInfo(serviceKey) {
    this._ensureInitialized();
    const canonicalKey = this.resolveCanonicalKey(serviceKey);

    if (!canonicalKey) {
      return null;
    }

    const descriptor = this.getServiceDescriptor(canonicalKey);
    const availability = this.checkServiceAvailability(canonicalKey);

    return {
      // 基本信息
      key: canonicalKey,
      provider: descriptor.provider,
      service: descriptor.service,
      displayName: descriptor.displayName,
      description: descriptor.description,
      status: descriptor.status,

      // 能力信息
      capabilities: {
        streaming: descriptor.supportsStreaming,
        async: descriptor.supportsAsync,
        protocol: descriptor.protocol
      },

      // 可用性信息
      availability: {
        available: availability.available,
        reason: availability.reason,
        adapterRegistered: availability.details.adapterRegistered,
        credentialsConfigured: availability.details.credentials?.configured || false
      },

      // 别名
      aliases: ProviderDescriptorRegistry.getAliases(canonicalKey)
    };
  },

  /**
   * 获取所有服务的完整信息列表
   * @param {Object} options - 过滤选项
   * @returns {Object[]}
   */
  getAllServiceInfo(options = {}) {
    this._ensureInitialized();
    const services = this.getAllServices(options);
    return services.map(s => this.getServiceInfo(s.key)).filter(Boolean);
  },

  // ==================== 统计信息 ====================

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    this._ensureInitialized();
    const descriptorStats = ProviderDescriptorRegistry.getStats();
    const runtimeStats = ProviderRuntimeRegistry.getRuntimeStats();

    return {
      services: descriptorStats,
      runtime: runtimeStats,
      timestamp: new Date().toISOString()
    };
  },

  // ==================== 初始化 ====================

  /**
   * 初始化服务
   */
  initialize() {
    if (serviceInitialized) {
      return;
    }

    // 从 legacy adapters 初始化运行时注册表
    ProviderRuntimeRegistry.initializeFromLegacy();
    serviceInitialized = true;
    console.log('[ProviderManagementService] Initialized');
  },

  /**
   * 是否已初始化
   * @returns {boolean}
   */
  isInitialized() {
    return serviceInitialized;
  }
};

module.exports = {
  ProviderManagementService,
  ProviderDescriptorRegistry,
  ProviderRuntimeRegistry
};
