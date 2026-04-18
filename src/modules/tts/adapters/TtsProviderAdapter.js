/**
 * TtsProviderAdapter - TTS提供者适配器
 *
 * 实现 TtsProviderPort 接口
 * 使用新的 providers 注册中心
 */

const TtsProviderPort = require('../ports/TtsProviderPort');
const providers = require('./providers');
const { voiceRegistry } = require('../core/VoiceRegistry');

class TtsProviderAdapter extends TtsProviderPort {
  constructor() {
    super();
    this.instances = new Map(); // 缓存适配器实例
  }

  /**
   * 初始化
   */
  async initialize() {
    await voiceRegistry.initialize();
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
   * 获取适配器实例（带缓存）
   */
  _getAdapter(key) {
    if (!this.instances.has(key)) {
      this.instances.set(key, providers.createProvider(key));
    }
    return this.instances.get(key);
  }

  /**
   * 获取可用服务提供商列表
   * 返回结构统一：{ key, provider, service, displayName, description, configured }
   */
  getAvailableProviders() {
    const { ProviderCatalog } = require('../catalog/ProviderCatalog');
    const credentials = require('../../../credentials');

    return ProviderCatalog.getAll()
      .filter(p => providers.hasProvider(p.key))
      .map(p => ({
        key: p.key,
        provider: p.provider,
        service: p.service,
        displayName: p.displayName,
        description: p.description,
        configured: credentials.isConfigured(p.provider),
        status: p.status || 'stable'
      }));
  }

  /**
   * 获取健康状态
   */
  async getHealthStatus() {
    const registered = providers.getRegisteredProviders();
    const health = {
      overall: 'healthy',
      services: {},
      timestamp: new Date().toISOString()
    };

    for (const key of registered) {
      try {
        const adapter = this._getAdapter(key);
        const status = adapter.getStatus ? adapter.getStatus() : { status: 'active' };
        health.services[key] = { status: 'healthy', ...status };
      } catch (error) {
        health.services[key] = { status: 'unhealthy', error: error.message };
        health.overall = 'degraded';
      }
    }

    return health;
  }

  /**
   * 检查服务是否可用
   */
  async isAvailable(provider, serviceType) {
    const key = serviceType ? `${provider}_${serviceType}` : provider;
    return providers.hasProvider(key);
  }

  /**
   * 获取服务统计
   */
  getStats() {
    return {
      cachedInstances: this.instances.size,
      registeredProviders: providers.getRegisteredProviders().length,
      voiceStats: voiceRegistry.getStats()
    };
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.instances.clear();
  }
}

// 导出单例
const ttsProviderAdapter = new TtsProviderAdapter();

module.exports = {
  TtsProviderAdapter,
  ttsProviderAdapter
};