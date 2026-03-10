/**
 * VoiceCatalogAdapter - 音色目录适配器
 * 实现 VoiceCatalogPort 接口
 * 封装 VoiceRegistry，提供干净的接口
 */

const VoiceCatalogPort = require('../ports/VoiceCatalogPort');
const { voiceRegistry } = require('../core/VoiceRegistry');

class VoiceCatalogAdapter extends VoiceCatalogPort {
  constructor() {
    super();
    this.registry = voiceRegistry;
  }

  /**
   * 初始化
   */
  async initialize() {
    await this.registry.initialize();
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

    for (const [provider, count] of Object.entries(stats.providers)) {
      const voices = this.registry.getByProvider(provider);

      // 按服务分组
      const services = {};
      for (const voice of voices) {
        const service = voice.service || 'default';
        const key = `${provider}_${service}`;

        if (!services[key]) {
          services[key] = {
            provider,
            service,
            voices: []
          };
        }
        services[key].voices.push(this._mapVoice(voice));
      }

      Object.assign(result, services);
    }

    return result;
  }

  /**
   * 等待目录就绪（兼容接口）
   */
  async waitForReady(timeout = 10000) {
    // 新架构无需等待，直接返回状态
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

  /**
   * 映射音色数据为统一格式
   */
  _mapVoice(voice) {
    return {
      id: voice.id,
      sourceId: voice.sourceId,
      provider: voice.provider,
      service: voice.service,
      displayName: voice.displayName,
      gender: voice.gender,
      languages: voice.languages || ['zh-CN'],
      tags: voice.tags || [],
      description: voice.description,
      ttsConfig: voice.ttsConfig
    };
  }
}

// 导出单例
const voiceCatalogAdapter = new VoiceCatalogAdapter();

module.exports = {
  VoiceCatalogAdapter,
  voiceCatalogAdapter
};