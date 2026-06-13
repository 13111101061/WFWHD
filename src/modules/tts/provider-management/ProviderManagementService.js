/**
 * ProviderManagementService - 服务商管理服务
 *
 * 薄层包装：委托 ProviderRegistry 做查询 + 运行时，叠加凭证检查。
 * 构造函数注入 ProviderRegistry + credentials。
 */

class ProviderManagementService {
  /**
   * @param {Object} deps
   * @param {Object} deps.providerRegistry - 已初始化的 ProviderRegistry
   * @param {Object} deps.credentials - credentials 模块
   */
  constructor({ providerRegistry, credentials }) {
    this._registry = providerRegistry;
    this._credentials = credentials;
  }

  // ==================== 代理查询 ====================

  resolveCanonicalKey(key) { return this._registry.resolveCanonicalKey(key); }
  isValidKey(key) { return this._registry.has(key); }
  getServiceDescriptor(key) { return this._registry.get(key); }
  getAllServices(options = {}) {
    const all = this._registry.getAll();
    if (options.enabledOnly) {
      return all.filter(d => d.status !== 'disabled');
    }
    if (options.provider) {
      return all.filter(d => d.provider === options.provider);
    }
    return all;
  }
  getServicesByProvider() { return this._registry.getByProvider(); }
  getProvider(key) { return this._registry.getProvider(key); }
  getAllProviders() { return this._registry.getAllProviders(); }
  getProviderServices(key) { return this._registry.getServicesByProvider(key); }
  getAdapter(key, config) { return this._registry.getOrCreateAdapter(key, config); }
  clearRuntimeCache(key) { this._registry.clearCachedAdapters(key); }

  // ==================== 凭证感知 ====================

  checkServiceAvailability(serviceKey) {
    const canonicalKey = this.resolveCanonicalKey(serviceKey);
    const result = { available: false, reason: 'unknown', details: {} };

    if (!canonicalKey) { result.reason = 'service_not_found'; return result; }

    const descriptor = this.getServiceDescriptor(canonicalKey);
    result.details.descriptor = descriptor;
    if (!descriptor) { result.reason = 'service_not_found'; return result; }
    if (descriptor.status === 'disabled') { result.reason = 'service_disabled'; return result; }

    if (!this._registry.hasAdapterClass(canonicalKey)) {
      result.reason = 'adapter_not_registered'; return result;
    }
    result.details.adapterRegistered = true;

    const credStatus = this._checkServiceCredentialStatus(descriptor.provider, descriptor.serviceType);
    result.details.credentials = credStatus;
    if (!credStatus.configured) { result.reason = 'credentials_not_configured'; return result; }

    result.available = true;
    result.reason = 'ok';
    return result;
  }

  /**
   * 检查 provider 对特定 serviceType 是否有可用凭证
   * 使用 credentials.isServiceAvailable 做 service 级粒度检查
   */
  _checkServiceCredentialStatus(providerKey, serviceType) {
    try {
      const configured = this._credentials.isServiceAvailable(providerKey, serviceType);
      return { configured, reason: configured ? 'ok' : 'not_configured' };
    } catch (e) {
      return { configured: false, reason: 'error', error: e.message };
    }
  }

  // ==================== 综合信息 ====================

  getServiceInfo(serviceKey) {
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
      aliases: this._registry.getAliases(canonicalKey)
    };
  }

  getAllServiceInfo(options = {}) {
    return this.getAllServices(options).map(s => this.getServiceInfo(s.key)).filter(Boolean);
  }

  // ==================== 统计 ====================

  getStats() {
    return {
      services: this._registry.getStats(),
      runtime: this._registry.getRuntimeStats(),
      timestamp: new Date().toISOString()
    };
  }

  isInitialized() { return this._registry.isInitialized(); }
}

module.exports = { ProviderManagementService };