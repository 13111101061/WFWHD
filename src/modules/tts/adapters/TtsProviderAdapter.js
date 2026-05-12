/**
 * TtsProviderAdapter - TTS提供者适配器
 *
 * 实现 TtsProviderPort 接口。
 * 所有依赖由构造函数注入，不再需要 setter 或自动初始化。
 */

const TtsProviderPort = require('../ports/TtsProviderPort');
const { voiceRegistry } = require('../core/VoiceRegistry');

class TtsProviderAdapter extends TtsProviderPort {
  /**
   * @param {Object} deps
   * @param {Object} deps.providerManagementService - 已初始化的 ProviderManagementService
   */
  constructor({ providerManagementService }) {
    super();
    this._pms = providerManagementService;
    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) return;
    await voiceRegistry.initialize();
    this._initialized = true;
  }

  isInitialized() {
    return this._initialized;
  }

  // ==================== 合成 ====================

  async synthesize(provider, serviceType, text, options) {
    const key = serviceType ? `${provider}_${serviceType}` : provider;
    const adapter = this._getAdapter(key);

    const result = await adapter.synthesizeAndSave(text, options);

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
      voiceStats: voiceRegistry.getStats()
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