/**
 * ProviderManagementService - 服务商管理服务
 *
 * 职责：
 * - 统一服务商 canonical key 解析
 * - 统一 adapter 注册与实例管理
 * - 汇总 provider 元信息 / 凭证状态 / 健康状态
 *
 * 设计原则：
 * - 作为服务商管理的唯一门面
 * - 启动时强制 init → 运行时只做断言，不自动修复
 */

const { ProviderDescriptorRegistry } = require('./ProviderDescriptorRegistry');
const { ProviderRuntimeRegistry } = require('./ProviderRuntimeRegistry');
const credentialsModule = require('../../credentials');

let _initialized = false;

function _assertInitialized() {
  if (!_initialized) {
    throw new Error(
      '[ProviderManagementService] Not initialized. Call ProviderManagementService.initialize() at startup.'
    );
  }
}

const ProviderManagementService = {

  // ==================== Key 解析 ====================

  resolveCanonicalKey(key) {
    _assertInitialized();
    return ProviderDescriptorRegistry.resolveCanonicalKey(key);
  },

  isValidKey(key) {
    _assertInitialized();
    return ProviderDescriptorRegistry.has(key);
  },

  // ==================== 服务信息查询 ====================

  getServiceDescriptor(serviceKey) {
    _assertInitialized();
    return ProviderDescriptorRegistry.get(serviceKey);
  },

  getAllServices(options = {}) {
    _assertInitialized();
    let services = ProviderDescriptorRegistry.getAll();
    if (options.status) services = services.filter(s => s.status === options.status);
    if (options.provider) services = services.filter(s => s.provider === options.provider);
    if (options.protocol) services = services.filter(s => s.protocol === options.protocol);
    return services;
  },

  getServicesByProvider() {
    _assertInitialized();
    return ProviderDescriptorRegistry.getByProvider();
  },

  // ==================== Provider 信息查询 ====================

  getProvider(providerKey) {
    _assertInitialized();
    return ProviderDescriptorRegistry.getProvider(providerKey);
  },

  getAllProviders() {
    _assertInitialized();
    return ProviderDescriptorRegistry.getAllProviders();
  },

  getProviderServices(providerKey) {
    _assertInitialized();
    return ProviderDescriptorRegistry.getServicesByProvider(providerKey);
  },

  // ==================== 运行时管理 ====================

  checkServiceAvailability(serviceKey) {
    _assertInitialized();
    const canonicalKey = this.resolveCanonicalKey(serviceKey);
    const result = { available: false, reason: 'unknown', details: {} };

    if (!canonicalKey) { result.reason = 'service_not_found'; return result; }

    const descriptor = this.getServiceDescriptor(canonicalKey);
    result.details.descriptor = descriptor;

    if (descriptor.status === 'disabled') { result.reason = 'service_disabled'; return result; }

    const adapterAvailable = ProviderRuntimeRegistry.hasAdapterClass(canonicalKey);
    result.details.adapterRegistered = adapterAvailable;
    if (!adapterAvailable) { result.reason = 'adapter_not_registered'; return result; }

    const credentialStatus = this._checkCredentialStatus(descriptor.provider);
    result.details.credentials = credentialStatus;
    if (!credentialStatus.configured) { result.reason = 'credentials_not_configured'; return result; }

    result.available = true;
    result.reason = 'ok';
    return result;
  },

  _checkCredentialStatus(providerKey) {
    try {
      const configured = credentialsModule.isConfigured(providerKey);
      return { configured, reason: configured ? 'ok' : 'not_configured' };
    } catch (e) {
      return { configured: false, reason: 'error', error: e.message };
    }
  },

  getAdapter(serviceKey, config = {}) {
    _assertInitialized();
    return ProviderRuntimeRegistry.getOrCreateAdapter(serviceKey, config);
  },

  clearRuntimeCache(serviceKey) {
    _assertInitialized();
    ProviderRuntimeRegistry.clearCachedAdapters(serviceKey);
  },

  // ==================== 综合信息查询 ====================

  getServiceInfo(serviceKey) {
    _assertInitialized();
    const canonicalKey = this.resolveCanonicalKey(serviceKey);
    if (!canonicalKey) return null;

    const descriptor = this.getServiceDescriptor(canonicalKey);
    const availability = this.checkServiceAvailability(canonicalKey);

    return {
      key: canonicalKey,
      provider: descriptor.provider,
      service: descriptor.service,
      displayName: descriptor.displayName,
      description: descriptor.description,
      status: descriptor.status,
      capabilities: {
        streaming: descriptor.supportsStreaming,
        async: descriptor.supportsAsync,
        protocol: descriptor.protocol
      },
      availability: {
        available: availability.available,
        reason: availability.reason,
        adapterRegistered: availability.details.adapterRegistered,
        credentialsConfigured: availability.details.credentials?.configured || false
      },
      aliases: ProviderDescriptorRegistry.getAliases(canonicalKey)
    };
  },

  getAllServiceInfo(options = {}) {
    _assertInitialized();
    return this.getAllServices(options).map(s => this.getServiceInfo(s.key)).filter(Boolean);
  },

  // ==================== 统计 ====================

  getStats() {
    _assertInitialized();
    return {
      services: ProviderDescriptorRegistry.getStats(),
      runtime: ProviderRuntimeRegistry.getRuntimeStats(),
      timestamp: new Date().toISOString()
    };
  },

  // ==================== 初始化 ====================

  initialize() {
    if (_initialized) return;
    ProviderRuntimeRegistry.initialize();
    _initialized = true;
    console.log('[ProviderManagementService] Initialized');
  },

  isInitialized() { return _initialized; }
};

module.exports = {
  ProviderManagementService,
  ProviderDescriptorRegistry,
  ProviderRuntimeRegistry
};