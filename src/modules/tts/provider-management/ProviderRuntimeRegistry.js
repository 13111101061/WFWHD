/**
 * ProviderRuntimeRegistry - 服务商运行时注册表
 *
 * 职责：
 * - 管理 adapter class 注册
 * - 管理 adapter 实例缓存
 * - 管理服务运行时实例创建策略
 *
 * 设计原则：
 * - 只管理运行时实例，不涉及静态描述信息
 * - 实例缓存按 serviceKey 管理
 * - 支持延迟初始化和按需创建
 */

const { ProviderDescriptorRegistry } = require('./ProviderDescriptorRegistry');

// Adapter Class 注册表
const adapterClasses = new Map();

// Adapter 实例缓存
const adapterInstances = new Map();

// 服务创建策略配置
const creationStrategies = new Map();
let runtimeInitialized = false;

/**
 * ProviderRuntimeRegistry
 */
const ProviderRuntimeRegistry = {
  // ==================== Adapter Class 注册 ====================

  /**
   * 注册 Adapter Class
   * @param {string} serviceKey - 服务标识
   * @param {Function} AdapterClass - Adapter 类
   * @param {Object} options - 创建选项
   */
  registerAdapterClass(serviceKey, AdapterClass, options = {}) {
    if (!AdapterClass || typeof AdapterClass !== 'function') {
      throw new Error(`Invalid adapter class for ${serviceKey}`);
    }

    adapterClasses.set(serviceKey, {
      AdapterClass,
      provider: options.provider,
      service: options.service,
      singleton: options.singleton !== false // 默认单例
    });

    // 存储创建策略
    if (options.creationStrategy) {
      creationStrategies.set(serviceKey, options.creationStrategy);
    }
  },

  /**
   * 批量注册 Adapter Classes
   * @param {Object} registrations - { serviceKey: { Adapter, provider, service } }
   */
  registerAdapters(registrations) {
    Object.entries(registrations).forEach(([serviceKey, config]) => {
      this.registerAdapterClass(serviceKey, config.Adapter, {
        provider: config.provider,
        service: config.service
      });
    });
  },

  /**
   * 检查 Adapter Class 是否已注册
   * @param {string} serviceKey
   * @returns {boolean}
   */
  hasAdapterClass(serviceKey) {
    return adapterClasses.has(serviceKey);
  },

  /**
   * 获取 Adapter Class 信息
   * @param {string} serviceKey
   * @returns {Object|null}
   */
  getAdapterClassInfo(serviceKey) {
    return adapterClasses.get(serviceKey) || null;
  },

  /**
   * 获取所有已注册的 serviceKey
   * @returns {string[]}
   */
  getRegisteredServiceKeys() {
    return Array.from(adapterClasses.keys());
  },

  // ==================== Adapter 实例管理 ====================

  /**
   * 获取或创建 Adapter 实例
   * @param {string} serviceKey - 服务标识（可以是 canonical key 或 alias）
   * @param {Object} config - 创建配置
   * @returns {Object} Adapter 实例
   */
  getOrCreateAdapter(serviceKey, config = {}) {
    // 解析 canonical key
    const canonicalKey = ProviderDescriptorRegistry.resolveCanonicalKey(serviceKey);
    if (!canonicalKey) {
      throw new Error(`Unknown service key: ${serviceKey}`);
    }

    const registration = adapterClasses.get(canonicalKey);
    if (!registration) {
      throw new Error(`Adapter not registered for: ${canonicalKey}`);
    }

    // 单例模式：检查缓存
    if (registration.singleton && adapterInstances.has(canonicalKey)) {
      return adapterInstances.get(canonicalKey);
    }

    // 创建新实例
    const instance = new registration.AdapterClass({
      provider: registration.provider,
      serviceType: registration.service,
      ...config
    });

    // 单例模式：缓存实例
    if (registration.singleton) {
      adapterInstances.set(canonicalKey, instance);
    }

    return instance;
  },

  /**
   * 获取已缓存的 Adapter 实例
   * @param {string} serviceKey
   * @returns {Object|null}
   */
  getCachedAdapter(serviceKey) {
    const canonicalKey = ProviderDescriptorRegistry.resolveCanonicalKey(serviceKey);
    return canonicalKey ? adapterInstances.get(canonicalKey) : null;
  },

  /**
   * 检查是否有缓存的实例
   * @param {string} serviceKey
   * @returns {boolean}
   */
  hasCachedAdapter(serviceKey) {
    const canonicalKey = ProviderDescriptorRegistry.resolveCanonicalKey(serviceKey);
    return canonicalKey ? adapterInstances.has(canonicalKey) : false;
  },

  /**
   * 清除缓存的实例
   * @param {string} [serviceKey] - 不传则清除所有
   */
  clearCachedAdapters(serviceKey) {
    if (serviceKey) {
      const canonicalKey = ProviderDescriptorRegistry.resolveCanonicalKey(serviceKey);
      if (canonicalKey) {
        adapterInstances.delete(canonicalKey);
      }
    } else {
      adapterInstances.clear();
    }
  },

  // ==================== 运行时状态查询 ====================

  /**
   * 检查服务是否可用
   * @param {string} serviceKey
   * @returns {Object} { available: boolean, reason: string }
   */
  checkAvailability(serviceKey) {
    const canonicalKey = ProviderDescriptorRegistry.resolveCanonicalKey(serviceKey);

    if (!canonicalKey) {
      return { available: false, reason: 'service_not_found' };
    }

    if (!adapterClasses.has(canonicalKey)) {
      return { available: false, reason: 'adapter_not_registered' };
    }

    const descriptor = ProviderDescriptorRegistry.get(canonicalKey);
    if (descriptor && descriptor.status === 'disabled') {
      return { available: false, reason: 'service_disabled' };
    }

    return { available: true, reason: 'ok' };
  },

  /**
   * 获取运行时统计
   * @returns {Object}
   */
  getRuntimeStats() {
    return {
      registeredClasses: adapterClasses.size,
      cachedInstances: adapterInstances.size,
      creationStrategies: creationStrategies.size,
      serviceKeys: Array.from(adapterClasses.keys())
    };
  },

  // ==================== 初始化 ====================

  /**
   * 从现有 adapters/providers/index.js 初始化
   * 用于向后兼容
   */
  initializeFromLegacy() {
    if (runtimeInitialized) {
      return;
    }

    try {
      const legacyAdapters = require('../adapters/providers');

      // 遍历 legacy 注册表
      const adapterMap = legacyAdapters.adapters || {};
      Object.entries(adapterMap).forEach(([key, config]) => {
        if (config && config.Adapter) {
          this.registerAdapterClass(key, config.Adapter, {
            provider: config.provider,
            service: config.service
          });
        }
      });

      runtimeInitialized = true;
      console.log(`[ProviderRuntimeRegistry] Initialized with ${adapterClasses.size} adapters from legacy`);
    } catch (error) {
      console.warn('[ProviderRuntimeRegistry] Failed to initialize from legacy:', error.message);
    }
  },

  /**
   * 是否已完成运行时初始化
   * @returns {boolean}
   */
  isInitialized() {
    return runtimeInitialized;
  }
};

module.exports = {
  ProviderRuntimeRegistry
};
