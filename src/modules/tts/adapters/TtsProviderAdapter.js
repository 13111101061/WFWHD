/**
 * TtsProviderAdapter - TTS提供者适配器
 *
 * 实现 TtsProviderPort 接口
 * [重构] 使用 ProviderManagementService 作为统一服务商管理入口
 */

const TtsProviderPort = require('../ports/TtsProviderPort');
const { voiceRegistry } = require('../core/VoiceRegistry');

class TtsProviderAdapter extends TtsProviderPort {
  /**
   * @param {Object} [opts]
   * @param {Object} [opts.providerManagementService] - 服务商管理服务（构造函数注入）
   */
  constructor(opts = {}) {
    super();
    this._pms = opts.providerManagementService || null;
    this._initialized = false;
  }

  _ensurePms() {
    if (!this._pms) {
      const { ProviderManagementService } = require('../provider-management');
      this._pms = ProviderManagementService;
    }
    return this._pms;
  }

  /**
   * 由 ServiceContainer 在 PMS 初始化后注入（消除内部延迟加载）
   * @param {Object} pms - 已初始化的 ProviderManagementService
   */
  setProviderManagementService(pms) {
    this._pms = pms;
  }

  /**
   * 初始化
   * [修复] 同时初始化 ProviderManagementService，确保独立调用时也能正常工作
   */
  async initialize() {
    if (this._initialized) return;
    await voiceRegistry.initialize();
    this._ensurePms().initialize();
    this._initialized = true;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized() {
    return this._initialized;
  }

  /**
   * 执行TTS合成
   */
  async synthesize(provider, serviceType, text, options) {
    const key = serviceType ? `${provider}_${serviceType}` : provider;
    const adapter = this._getAdapter(key);

    // 调用合成并保存，返回URL
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

  /**
   * 确保已初始化
   * @private
   */
  _ensureInitialized() {
    if (!this._initialized) {
      console.warn('[TtsProviderAdapter] Warning: initialize() not called. Auto-initializing...');
      this._ensurePms().initialize();
      this._initialized = true;
    }
  }

  /**
   * 获取适配器实例（带缓存）
   * [重构] 使用 ProviderManagementService
   */
  _getAdapter(key) {
    this._ensureInitialized();
    return this._ensurePms().getAdapter(key);
  }

  /**
   * 获取可用服务提供商列表
   * [重构] 使用 ProviderManagementService
   */
getAvailableProviders() {
    this._ensureInitialized();
    const pms = this._ensurePms();
    const allInfo = pms.getAllServiceInfo();

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

  /**
   * 获取健康状态
   */
  async getHealthStatus() {
    this._ensureInitialized();
    const pms = this._ensurePms();
    const allInfo = pms.getAllServiceInfo();

    const health = {
      overall: 'healthy',
      services: {},
      timestamp: new Date().toISOString()
    };

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

  /**
   * 检查服务是否可用
   * [重构] 使用 ProviderManagementService
   */
async isAvailable(provider, serviceType) {
    this._ensureInitialized();
    const key = serviceType ? `${provider}_${serviceType}` : provider;
    return this._ensurePms().checkServiceAvailability(key).available;
  }

  getStats() {
    this._ensureInitialized();
    const stats = this._ensurePms().getStats();

    return {
      cachedInstances: stats.runtime.cachedInstances,
      registeredProviders: stats.runtime.registeredClasses,
      voiceStats: voiceRegistry.getStats()
    };
  }

  /**
   * 清理缓存
   */
  clearCache() {
    const pms = this._ensurePms();
    pms.clearRuntimeCache?.();
    this._initialized = false;
  }
}

// 导出单例
const ttsProviderAdapter = new TtsProviderAdapter();

module.exports = {
  TtsProviderAdapter,
  ttsProviderAdapter
};
