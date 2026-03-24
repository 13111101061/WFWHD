const { VoiceCatalog } = require('../catalog/VoiceCatalog');
const { ProviderCatalog } = require('../catalog/ProviderCatalog');
const { voiceRegistry } = require('../core/VoiceRegistry');

const TtsQueryService = {
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
  },

  _isProviderVisible(provider) {
    return voiceRegistry.isProviderEnabled(provider);
  },

  _hasVisibleVoicesFor(provider, service) {
    if (!this._isProviderVisible(provider)) return false;
    return voiceRegistry.getByProviderAndService(provider, service).length > 0;
  },

  _filterVisibleVoices(items = []) {
    return items.filter(item => this._isProviderVisible(item.provider));
  },

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
  },

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
  },

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
  },

  getFrontendCatalog() {
    const items = this._filterVisibleVoices(VoiceCatalog.query({}));
    const filters = this._buildFiltersMeta(items);
    const counts = this._buildCounts(items);
    const index = this._buildIndex(items);
    const providers = this.getProviders().data || [];

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
  },

  getVoice(voiceId) {
    const voice = VoiceCatalog.getDisplay(voiceId);
    if (!voice) return null;

    return this._isProviderVisible(voice.provider) ? voice : null;
  },

  getVoiceDetail(voiceId) {
    const detail = VoiceCatalog.getDetail(voiceId);
    if (!detail) return null;

    return this._isProviderVisible(detail.profile?.provider) ? detail : null;
  },

  getProviders() {
    const providers = ProviderCatalog.getAll();
    const credentials = require('../../credentials');

    const providersWithStatus = providers
      .filter(p => this._hasVisibleVoicesFor(p.provider, p.service))
      .map(p => ({
        key: p.key,
        displayName: p.displayName,
        description: p.description,
        provider: p.provider,
        service: p.service,
        configured: credentials.isConfigured(p.provider),
        status: p.status
      }));

    return {
      success: true,
      data: providersWithStatus,
      timestamp: new Date().toISOString()
    };
  },

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
  },

  getStats() {
    const stats = VoiceCatalog.getStats();

    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    };
  },

  getFilterOptions() {
    const items = this._filterVisibleVoices(VoiceCatalog.query({}));
    const filters = this._buildFiltersMeta(items);

    return {
      success: true,
      data: filters,
      timestamp: new Date().toISOString()
    };
  },

  /**
   * 获取前端展示专用数据（精简版）
   * 只返回7个展示字段：id, displayName, gender, languages, tags, description, preview
   */
  getFrontendVoices() {
    const items = this._filterVisibleVoices(VoiceCatalog.query({}));

    // 只返回前端需要的7个展示字段
    const voices = items.map(item => ({
      id: item.id,
      displayName: item.displayName || item.name || item.id,
      gender: item.gender || 'unknown',
      languages: item.languages || [],
      tags: item.tags || [],
      description: item.description || '',
      preview: item.preview || ''
    }));

    // 构建筛选选项
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
};

module.exports = {
  TtsQueryService
};
