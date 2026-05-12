/**
 * ProviderRegistry - 统一服务商注册表
 *
 * 合并了 ProviderDescriptorRegistry（静态描述）和 ProviderRuntimeRegistry（运行时实例）。
 * 单一入口：从 manifest.json 加载一切，包括 adapter class。
 *
 * 职责：
 * - 从 manifest.json 加载服务商描述 + 参数定义
 * - 自动加载 adapter class（从 manifest 的 adapter 字段）
 * - 管理 adapter 实例缓存
 * - 提供查询接口
 */

const fs = require('fs');
const path = require('path');
const { ProviderManifest } = require('../providers/manifests/ProviderManifest');

class ProviderRegistry {
  /**
   * @param {Object} options
   * @param {Object} options.voiceRegistry - VoiceRegistry 实例（用于 adapter 查询音色）
   */
  constructor({ voiceRegistry } = {}) {
    /** @type {Map<string, Object>} alias → canonical key */
    this._aliasToCanonical = null;

    /** @type {Map<string, Array>} canonical key → aliases */
    this._canonicalToAliases = null;

    /** @type {Map<string, { AdapterClass, provider, service }>} adapter class 注册 */
    this._adapterClasses = new Map();

    /** @type {Map<string, Object>} adapter 实例缓存 */
    this._adapterInstances = new Map();

    this._voiceRegistry = voiceRegistry || null;

    this._initialized = false;
  }

  // ==================== 初始化 ====================

  initialize() {
    if (this._initialized) return;

    ProviderManifest._ensureLoaded();

    // 构建 alias/canonical 映射
    this._aliasToCanonical = ProviderManifest.buildAliasMap();
    this._canonicalToAliases = new Map();
    const serviceKeys = ProviderManifest.getAllServiceKeys();
    for (const key of serviceKeys) {
      const cfg = ProviderManifest.getServiceConfig(key);
      if (cfg?.aliases) this._canonicalToAliases.set(key, cfg.aliases);
    }

    // 从 manifest 自动加载 adapter class
    let fromManifest = 0;
    let fromGeneric = 0;

    for (const key of serviceKeys) {
      const cfg = ProviderManifest.getServiceConfig(key);
      if (!cfg) continue;

      const registration = {
        provider: cfg.providerKey,
        service: cfg._canonicalKey
      };

      if (cfg.adapter) {
        // 自定义 Adapter（如 WebSocket/复杂协议）
        const adapterPath = path.join(
          __dirname, '..', 'providers', cfg.providerKey, cfg.adapter
        );
        try {
          registration.AdapterClass = require(adapterPath);
          this._adapterClasses.set(key, registration);
          fromManifest++;
        } catch (e) {
          console.warn(`[ProviderRegistry] Failed to load adapter for ${key}: ${e.message}`);
        }
      } else if (cfg.api) {
        // 声明式 HTTP 服务商 → 使用 GenericHttpAdapter
        try {
          const GenericHttpAdapter = require('../providers/GenericHttpAdapter');
          registration.AdapterClass = GenericHttpAdapter;
          registration.apiConfig = cfg.api;
          this._adapterClasses.set(key, registration);
          fromGeneric++;
        } catch (e) {
          console.warn(`[ProviderRegistry] Generic adapter load failed for ${key}: ${e.message}`);
        }
      }
    }

    this._initialized = true;
    console.log(`[ProviderRegistry] Initialized ${fromManifest} custom + ${fromGeneric} generic = ${this._adapterClasses.size} adapters from manifests`);
  }

  isInitialized() { return this._initialized; }

  _assertInit() {
    if (!this._initialized) throw new Error('[ProviderRegistry] Not initialized');
  }

  // ==================== 描述查询 ====================

  get(key) {
    this._assertInit();
    const canonicalKey = this._aliasToCanonical.get(key);
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
  }

  resolveCanonicalKey(key) {
    this._assertInit();
    return this._aliasToCanonical.get(key) || null;
  }

  has(key) {
    this._assertInit();
    return this._aliasToCanonical.has(key);
  }

  getAll() {
    this._assertInit();
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
  }

  getAllCanonicalKeys() {
    this._assertInit();
    return ProviderManifest.getAllServiceKeys();
  }

  getAliases(canonicalKey) {
    this._assertInit();
    return this._canonicalToAliases.get(canonicalKey) || [];
  }

  getByProvider() {
    this._assertInit();
    const result = {};
    const serviceKeys = ProviderManifest.getAllServiceKeys();
    for (const key of serviceKeys) {
      const descriptor = this.get(key);
      if (!descriptor) continue;
      if (!result[descriptor.provider]) result[descriptor.provider] = [];
      result[descriptor.provider].push(descriptor);
    }
    return result;
  }

  getProvider(providerKey) {
    return ProviderManifest.getProviderMeta(providerKey);
  }

  getAllProviders() {
    return ProviderManifest.getAllProviders();
  }

  getServicesByProvider(providerKey) {
    this._assertInit();
    return ProviderManifest.getProviderServices(providerKey).map(cfg => ({
      key: cfg.key,
      provider: cfg.providerKey || providerKey,
      service: cfg.key,
      displayName: cfg.displayName || cfg.key,
      description: cfg.description || '',
      status: cfg.status || 'stable',
      aliases: cfg.aliases || [],
      protocol: cfg.protocol || 'http',
      category: 'tts',
      supportsStreaming: cfg.supportsStreaming || false,
      supportsAsync: cfg.supportsAsync || false
    }));
  }

  // ==================== 运行时实例 ====================

  hasAdapterClass(serviceKey) {
    this._assertInit();
    const canonicalKey = this.resolveCanonicalKey(serviceKey);
    return canonicalKey ? this._adapterClasses.has(canonicalKey) : false;
  }

  getOrCreateAdapter(serviceKey, config = {}) {
    this._assertInit();
    const canonicalKey = this.resolveCanonicalKey(serviceKey);
    if (!canonicalKey) throw new Error(`Unknown service key: ${serviceKey}`);

    const registration = this._adapterClasses.get(canonicalKey);
    if (!registration) throw new Error(`Adapter not registered for: ${canonicalKey}`);

    if (this._adapterInstances.has(canonicalKey)) {
      return this._adapterInstances.get(canonicalKey);
    }

    const instance = new registration.AdapterClass({
      provider: registration.provider,
      serviceType: registration.service,
      api: registration.apiConfig,
      voiceRegistry: this._voiceRegistry,
      ...config
    });

    this._adapterInstances.set(canonicalKey, instance);
    return instance;
  }

  clearCachedAdapters(serviceKey) {
    if (serviceKey) {
      const canonicalKey = this.resolveCanonicalKey(serviceKey);
      if (canonicalKey) this._adapterInstances.delete(canonicalKey);
    } else {
      this._adapterInstances.clear();
    }
  }

  // ==================== 统计 ====================

  getStats() {
    return ProviderManifest.getStats();
  }

  getRuntimeStats() {
    return {
      registeredClasses: this._adapterClasses.size,
      cachedInstances: this._adapterInstances.size,
      serviceKeys: Array.from(this._adapterClasses.keys())
    };
  }
}

module.exports = { ProviderRegistry };