/**
 * TtsProviderAdapter - TTS提供者适配器
 *
 * 实现 TtsProviderPort 接口。
 * 所有依赖由构造函数注入，不再需要 setter 或自动初始化。
 */

const TtsProviderPort = require('../ports/TtsProviderPort');

class TtsProviderAdapter extends TtsProviderPort {
  /**
   * @param {Object} deps
   * @param {Object} deps.providerManagementService - 已初始化的 ProviderManagementService
   * @param {Object} [deps.voiceRegistry] - VoiceRegistry 实例
   */
  constructor({ providerManagementService, voiceRegistry }) {
    super();
    this._pms = providerManagementService;
    this._voiceRegistry = voiceRegistry || null;
    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) return;
    if (this._voiceRegistry && !this._voiceRegistry.isReady) {
      throw new Error('[TtsProviderAdapter] VoiceRegistry 未初始化，请检查 ServiceContainer 初始化顺序');
    }
    this._initialized = true;
  }

  isInitialized() {
    return this._initialized;
  }

  // ==================== 合成 ====================

  async synthesize(provider, serviceType, text, options, providerInput = null) {
    const key = serviceType ? `${provider}_${serviceType}` : provider;
    const adapter = this._getAdapter(key);

    const result = await adapter.synthesizeAndSave(text, options, providerInput);

    return {
      success: true,
      url: result.url,
      format: result.format,
      size: result.size,
      provider: result.provider || provider,
      serviceType: result.serviceType || serviceType
    };
  }

  // ==================== Provider 查询 ====================

  getAvailableProviders() {
    const allInfo = this._pms.getAllServiceInfo();

    return allInfo
      .filter(info => info.availability.adapterRegistered)
      .map(info => ({
        key: info.key,
        provider: info.provider,
        service: info.service,
        displayName: info.displayName,
        description: info.description,
        configured: info.availability.credentialsConfigured,
        status: info.status
      }));
  }

  async getHealthStatus() {
    const allInfo = this._pms.getAllServiceInfo();
    const health = { overall: 'healthy', services: {}, timestamp: new Date().toISOString() };

    for (const info of allInfo) {
      if (!info.availability.adapterRegistered) continue;
      try {
        const adapter = this._getAdapter(info.key);
        const status = adapter.getStatus ? adapter.getStatus() : { status: 'active' };
        health.services[info.key] = { status: 'healthy', ...status };
      } catch (error) {
        health.services[info.key] = { status: 'unhealthy', error: error.message };
        health.overall = 'degraded';
      }
    }

    return health;
  }

  async isAvailable(provider, serviceType) {
    const key = serviceType ? `${provider}_${serviceType}` : provider;
    return this._pms.checkServiceAvailability(key).available;
  }

  getStats() {
    const stats = this._pms.getStats();
    return {
      cachedInstances: stats.runtime.cachedInstances,
      registeredProviders: stats.runtime.registeredClasses,
      voiceStats: this._voiceRegistry ? this._voiceRegistry.getStats() : { total: 0 }
    };
  }

  clearCache() {
    this._pms.clearRuntimeCache();
    this._initialized = false;
  }

  // ==================== 内部 ====================

  _getAdapter(key) {
    return this._pms.getAdapter(key);
  }
}

module.exports = {
  TtsProviderAdapter
};