/**
 * TtsQueryService - TTS查询服务
 *
 * 核心职责：
 * - 音色查询（列表/详情/筛选）
 * - 提供商查询
 * - 服务能力查询
 * - 前端展示数据查询
 */

const { VoiceCatalog } = require('../catalog/VoiceCatalog');
const { ProviderCatalog } = require('../catalog/ProviderCatalog');
const { voiceRegistry } = require('../core/VoiceRegistry');

class TtsQueryService {
  /**
   * 依赖注入
   */
  constructor({ ttsProvider } = {}) {
    this.ttsProvider = ttsProvider;
  }

  // ==================== 音色查询 ====================

  /**
   * 查询音色列表（带筛选）
   */
  queryVoices(filters = {}) {
    const { includeCounts = true } = filters;

    const items = VoiceCatalog.query(filters);
    const visibleItems = this._filterVisibleVoices(items);
    const filtersMeta = this._buildFiltersMeta(visibleItems);

    const response = {
      success: true,
      data: {
        items: visibleItems,
        filters: filtersMeta
      },
      timestamp: new Date().toISOString()
    };

    if (includeCounts) {
      response.data.counts = this._buildCounts(visibleItems);
    }

    return response;
  }

  /**
   * 获取单个音色
   */
  getVoice(voiceId) {
    const voice = VoiceCatalog.getDisplay(voiceId);
    if (!voice) return null;

    return this._isProviderVisible(voice.provider) ? voice : null;
  }

  /**
   * 获取音色详情
   */
  getVoiceDetail(voiceId) {
    const detail = VoiceCatalog.getDetail(voiceId);
    if (!detail) return null;

    return this._isProviderVisible(detail.profile?.provider) ? detail : null;
  }

  /**
   * 获取可用音色（按provider/service）
   */
  async getVoices(provider, serviceType) {
    if (provider && serviceType) {
      return voiceRegistry.getByProviderAndService(provider, serviceType);
    }
    if (provider) {
      return voiceRegistry.getByProvider(provider);
    }
    return voiceRegistry.getAll();
  }

  /**
   * 获取所有可用音色（按服务分组）
   */
  async getAllVoices() {
    const stats = voiceRegistry.getStats();
    const result = {};

    for (const [provider] of Object.entries(stats.providers)) {
      const voices = voiceRegistry.getByProvider(provider);

      const services = {};
      for (const voice of voices) {
        const service = voice.service || 'default';
        const key = `${provider}_${service}`;

        if (!services[key]) {
          services[key] = { provider, service, voices: [] };
        }
        services[key].voices.push(this._mapVoice(voice));
      }

      Object.assign(result, services);
    }

    return result;
  }

  // ==================== 提供商查询 ====================

  /**
   * 获取服务提供商列表
   * 统一返回结构：{ key, provider, service, displayName, description, configured, status }
   */
  getProviders() {
    const credentials = require('../../credentials');
    const providers = require('../adapters/providers');
    const { ProviderCatalog } = require('../catalog/ProviderCatalog');

    const providerList = ProviderCatalog.getAll()
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

    return {
      success: true,
      data: providerList,
      total: providerList.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取服务能力
   */
  getCapabilities(serviceKey) {
    const config = ProviderCatalog.get(serviceKey);
    if (!config) {
      return {
        success: false,
        error: `Service not found: ${serviceKey}`
      };
    }

    if (!this._hasVisibleVoicesFor(config.provider, config.service)) {
      return {
        success: false,
        error: `Service disabled: ${serviceKey}`
      };
    }

    return {
      success: true,
      data: config.capabilities,
      timestamp: new Date().toISOString()
    };
  }

  // ==================== 前端展示 ====================

  /**
   * 获取前端展示目录
   */
  getFrontendCatalog() {
    const items = this._filterVisibleVoices(VoiceCatalog.query({}));
    const filters = this._buildFiltersMeta(items);
    const counts = this._buildCounts(items);
    const index = this._buildIndex(items);
    const providers = this.getProviders();

    const voices = items.map(item => ({
      id: item.id,
      name: item.displayName || item.name || item.id,
      displayName: item.displayName || item.name || item.id,
      provider: item.provider || '',
      service: item.service || '',
      gender: item.gender || 'unknown',
      languages: item.languages || [],
      tags: item.tags || [],
      description: item.description || '',
      previewUrl: item.preview || '',
      status: item.status || 'active'
    }));

    return {
      success: true,
      data: {
        schemaVersion: 'frontend-catalog.v1',
        generatedAt: new Date().toISOString(),
        voices,
        filters,
        counts,
        index,
        providers
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取前端展示专用数据（精简版）
   */
  getFrontendVoices() {
    const items = this._filterVisibleVoices(VoiceCatalog.query({}));

    const voices = items.map(item => ({
      id: item.id,
      displayName: item.displayName || item.name || item.id,
      gender: item.gender || 'unknown',
      languages: item.languages || [],
      tags: item.tags || [],
      description: item.description || '',
      preview: item.preview || ''
    }));

    const genders = new Set();
    const languages = new Set();
    const tags = new Set();

    voices.forEach(v => {
      if (v.gender) genders.add(v.gender);
      v.languages.forEach(lang => languages.add(lang));
      v.tags.forEach(tag => tags.add(tag));
    });

    return {
      success: true,
      data: {
        voices,
        filters: {
          genders: Array.from(genders).sort(),
          languages: Array.from(languages).sort(),
          tags: Array.from(tags).sort()
        },
        total: voices.length
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取筛选选项
   */
  getFilterOptions() {
    const items = this._filterVisibleVoices(VoiceCatalog.query({}));
    const filters = this._buildFiltersMeta(items);

    return {
      success: true,
      data: filters,
      timestamp: new Date().toISOString()
    };
  }

  // ==================== 辅助方法 ====================

  _isProviderVisible(provider) {
    return voiceRegistry.isProviderEnabled(provider);
  }

  _hasVisibleVoicesFor(provider, service) {
    if (!this._isProviderVisible(provider)) return false;
    return voiceRegistry.getByProviderAndService(provider, service).length > 0;
  }

  _filterVisibleVoices(items = []) {
    return items.filter(item => this._isProviderVisible(item.provider));
  }

  _buildFiltersMeta(items = []) {
    const providers = new Set();
    const services = new Set();
    const genders = new Set();
    const languages = new Set();
    const tags = new Set();

    items.forEach(item => {
      if (item.provider) providers.add(item.provider);
      if (item.service) services.add(item.service);
      if (item.gender) genders.add(item.gender);

      if (Array.isArray(item.languages)) {
        item.languages.forEach(lang => languages.add(lang));
      }

      if (Array.isArray(item.tags)) {
        item.tags.forEach(tag => tags.add(tag));
      }
    });

    return {
      providers: Array.from(providers).sort(),
      services: Array.from(services).sort(),
      genders: Array.from(genders).sort(),
      languages: Array.from(languages).sort(),
      tags: Array.from(tags).sort()
    };
  }

  _buildCounts(items) {
    const counts = {
      total: items.length,
      byProvider: {},
      byService: {},
      byGender: {}
    };

    items.forEach(item => {
      if (item.provider) {
        counts.byProvider[item.provider] = (counts.byProvider[item.provider] || 0) + 1;
      }

      if (item.service) {
        counts.byService[item.service] = (counts.byService[item.service] || 0) + 1;
      }

      if (item.gender) {
        counts.byGender[item.gender] = (counts.byGender[item.gender] || 0) + 1;
      }
    });

    return counts;
  }

  _buildIndex(items) {
    const index = {
      byProvider: {},
      byService: {},
      byGender: {},
      byLanguage: {},
      byTag: {}
    };

    items.forEach(item => {
      if (item.provider) {
        if (!index.byProvider[item.provider]) index.byProvider[item.provider] = [];
        index.byProvider[item.provider].push(item.id);
      }

      if (item.service) {
        if (!index.byService[item.service]) index.byService[item.service] = [];
        index.byService[item.service].push(item.id);
      }

      if (item.gender) {
        if (!index.byGender[item.gender]) index.byGender[item.gender] = [];
        index.byGender[item.gender].push(item.id);
      }

      if (Array.isArray(item.languages)) {
        item.languages.forEach(lang => {
          if (!index.byLanguage[lang]) index.byLanguage[lang] = [];
          index.byLanguage[lang].push(item.id);
        });
      }

      if (Array.isArray(item.tags)) {
        item.tags.forEach(tag => {
          if (!index.byTag[tag]) index.byTag[tag] = [];
          index.byTag[tag].push(item.id);
        });
      }
    });

    return index;
  }

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

module.exports = TtsQueryService;
