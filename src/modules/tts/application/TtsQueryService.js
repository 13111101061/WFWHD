/**
 * TtsQueryService - TTS查询服务
 *
 * 核心职责：
 * - 音色查询（列表/详情/筛选）
 * - 提供商查询
 * - 服务能力查询
 * - 前端展示数据组装
 *
 * 展示 DTO 统一由 VoiceCatalog.toDisplayDto() / toDetailDto() 生成
 * 本服务只做组装和过滤，不再手写字段映射
 */

const { VoiceCatalog, toDisplayDto } = require('../catalog/VoiceCatalog');
const { ProviderCatalog } = require('../catalog/ProviderCatalog');
const { voiceRegistry } = require('../core/VoiceRegistry');

class TtsQueryService {
  /**
   * 依赖注入
   * @param {Object} options
   * @param {Object} [options.ttsProvider] - TTS Provider 适配器
   * @param {Object} [options.providerManagementService] - 服务商管理服务（统一服务商信息入口）
   * @param {Object} [options.capabilityResolver] - 能力解析器（统一能力规则源）
   */
  constructor({ ttsProvider, providerManagementService, capabilityResolver } = {}) {
    this.ttsProvider = ttsProvider;
    this.providerManagementService = providerManagementService;
    this.capabilityResolver = capabilityResolver;
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

    return this._isProviderVisible(detail.identity?.provider) ? detail : null;
  }

  /**
   * 获取可用音色（按provider/service）
   */
  async getVoices(provider, serviceType) {
    if (provider && serviceType) {
      return VoiceCatalog.getByProviderAndService(provider, serviceType);
    }
    if (provider) {
      return VoiceCatalog.getByProvider(provider);
    }
    return VoiceCatalog.getAllDisplay();
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
        const service = voice.identity?.service || voice.service || 'default';
        const key = `${provider}_${service}`;

        if (!services[key]) {
          services[key] = { provider, service, voices: [] };
        }
        // 使用统一的展示 DTO
        services[key].voices.push(toDisplayDto(voice));
      }

      Object.assign(result, services);
    }

    return result;
  }

  // ==================== 提供商查询 ====================

  /**
   * 获取服务提供商列表
   * [重构] 使用 ProviderManagementService 作为统一入口
   */
  getProviders() {
    return this._getProvidersFromService(this._ensureProviderManagementService());
  }

  /**
   * 从 ProviderManagementService 获取提供商列表
   * @private
   */
  _getProvidersFromService(pms) {
    const allInfo = pms.getAllServiceInfo();

    const providerList = allInfo
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

    return {
      success: true,
      data: providerList,
      total: providerList.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取服务能力
   *
   * [改造] 通过 CapabilityResolver 获取能力数据
   * 确保前端能力查询与后端执行使用相同的规则源
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

    return this._getCapabilitiesFromResolver(this._ensureCapabilityResolver(), serviceKey);
  }

  /**
   * 从 CapabilityResolver 获取能力数据
   * @private
   */
  _getCapabilitiesFromResolver(resolver, serviceKey) {
    const context = resolver.resolve(serviceKey);

    return {
      success: true,
      data: {
        // 前端展示用
        displayName: context.metadata?.displayName,
        defaultVoiceId: context.metadata?.defaultVoiceId,
        status: context.metadata?.status,

        // 参数能力（前端判断哪些参数可用）
        parameters: context.parameterSupport,

        // 可执行默认值（前端默认填充）
        defaults: context.resolvedDefaults,

        // 锁定参数（前端禁止修改）
        lockedParams: context.lockedParams
      },
      timestamp: new Date().toISOString()
    };
  }

  // ==================== 前端展示 ====================

  /**
   * 获取前端展示目录
   * 使用统一的 VoiceListItemDTO
   */
  getFrontendCatalog() {
    const items = this._filterVisibleVoices(VoiceCatalog.query({}));
    const filters = this._buildFiltersMeta(items);
    const counts = this._buildCounts(items);
    const index = this._buildIndex(items);
    const providers = this.getProviders();

    // 直接使用 VoiceCatalog 的展示 DTO，不再手写字段
    const voices = items;

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
   * 用于移动端或简单选择场景
   *
   * 注意：此方法只能从标准展示 DTO (toDisplayDto) 裁剪字段，
   * 不能独立定义另一套字段语义
   */
  getFrontendVoices() {
    const items = this._filterVisibleVoices(VoiceCatalog.query({}));

    // 从标准展示 DTO 裁剪字段（不独立定义字段语义）
    const voices = items.map(item => ({
      id: item.id,
      voiceCode: item.voiceCode,
      displayName: item.displayName,
      gender: item.gender,
      languages: item.languages,
      tags: item.tags,
      description: item.description,
      previewUrl: item.previewUrl
    }));

    // 构建筛选元数据
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

  _ensureProviderManagementService() {
    if (!this.providerManagementService) {
      throw new Error(
        'ProviderManagementService not injected into TtsQueryService. ' +
        'Ensure ServiceContainer.initialize() is called before using provider query methods.'
      );
    }

    return this.providerManagementService;
  }

  _ensureCapabilityResolver() {
    if (!this.capabilityResolver) {
      throw new Error(
        'CapabilityResolver not injected into TtsQueryService. ' +
        'Ensure ServiceContainer.initialize() is called before using capability query methods.'
      );
    }

    return this.capabilityResolver;
  }
}

module.exports = TtsQueryService;
