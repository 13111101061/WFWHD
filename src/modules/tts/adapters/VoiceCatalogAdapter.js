/**
 * VoiceCatalogAdapter - 音色目录适配器
 * 实现 VoiceCatalogPort 接口
 * 封装 VoiceRegistry，提供干净的接口
 *
 * 展示 DTO 统一使用 VoiceCatalog.toDisplayDto()
 */

const VoiceCatalogPort = require('../ports/VoiceCatalogPort');


class VoiceCatalogAdapter extends VoiceCatalogPort {
  /**
   * @param {Object} options
   * @param {Object} options.voiceRegistry - VoiceRegistry 实例
   */
  constructor({ voiceRegistry }) {
    super();
    this.registry = voiceRegistry;
  }

  /**
   * 初始化
   */
  async initialize() {
    if (!this.registry.isReady) {
      throw new Error('[VoiceCatalogAdapter] VoiceRegistry 未初始化，请检查 ServiceContainer 初始化顺序');
    }
  }

  /**
   * 根据ID获取音色
   */
  async getById(id) {
    return this.registry.get(id);
  }

  /**
   * 根据提供商获取音色列表
   */
  async getByProvider(provider) {
    return this.registry.getByProvider(provider);
  }

  /**
   * 根据提供商和服务类型获取音色列表
   */
  async getByProviderAndService(provider, service) {
    return this.registry.getByProviderAndService(provider, service);
  }

  /**
   * 获取所有音色
   */
  async getAll() {
    return this.registry.getAll();
  }

  /**
   * 按服务分组获取所有音色
   */
  async getAllGroupedByService() {
    const stats = this.registry.getStats();
    const result = {};

    for (const [provider] of Object.entries(stats.providers)) {
      const voices = this.registry.getByProvider(provider);

      // 按服务分组
      for (const voice of voices) {
        const service = voice.service || voice.identity?.service || 'default';
        const key = `${provider}_${service}`;

        if (!result[key]) {
          result[key] = {
            provider,
            service,
            voices: []
          };
        }
        // getByProvider 已返回 DisplayDto，直接推入
        result[key].voices.push(voice);
      }
    }

    return result;
  }

  /**
   * 等待目录就绪（兼容接口）
   */
  async waitForReady(timeout = 10000) {
    return this.registry.isReady;
  }

  /**
   * 获取健康状态
   */
  getHealth() {
    const stats = this.registry.getStats();
    return {
      status: stats.isReady ? 'healthy' : 'unhealthy',
      voices: stats.total,
      providers: Object.keys(stats.providers),
      lastUpdated: stats.lastUpdated
    };
  }
}

module.exports = { VoiceCatalogAdapter };