/**
 * TtsProviderAdapter - TTS提供者适配器
 * 实现 TtsProviderPort 接口
 * 封装现有的 TtsServiceManager，提供干净的接口
 */

const TtsProviderPort = require('../ports/TtsProviderPort');
const { ttsServiceManager } = require('../core/TtsServiceManager');
const { ttsFactory } = require('../core/TtsFactory');

class TtsProviderAdapter extends TtsProviderPort {
  constructor() {
    super();
    this.serviceManager = ttsServiceManager;
    this.factory = ttsFactory;
  }

  /**
   * 初始化
   */
  async initialize() {
    await this.factory.initialize();
  }

  /**
   * 执行TTS合成
   */
  async synthesize(provider, serviceType, text, options) {
    return this.serviceManager.synthesize(provider, serviceType, text, options);
  }

  /**
   * 获取可用服务提供商列表
   */
  getAvailableProviders() {
    return this.factory.getAvailableProviders();
  }

  /**
   * 获取健康状态
   */
  async getHealthStatus() {
    return this.factory.getHealthStatus();
  }

  /**
   * 检查服务是否可用
   */
  async isAvailable(provider, serviceType) {
    try {
      await this.factory.createService(provider, serviceType);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取服务统计
   */
  getStats() {
    return this.serviceManager.getStats();
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.factory.clearCache();
    this.serviceManager.clearStats();
  }
}

// 导出单例
const ttsProviderAdapter = new TtsProviderAdapter();

module.exports = {
  TtsProviderAdapter,
  ttsProviderAdapter
};