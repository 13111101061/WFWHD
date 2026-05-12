/**
 * TtsQueryService - TTS查询服务
 *
 * 核心职责：
 * - 音色查询（列表/详情/筛选）
 * - 提供商查询
 * - 服务能力查询
 * - 前端展示数据组装
 *
 * 展示 DTO 统一由 this._ensureVoiceCatalogQuery().toDisplayDto() / toDetailDto() 生成
 * 本服务只做组装和过滤，不再手写字段映射
 */

const { ProviderCatalog } = require('../catalog/ProviderCatalog');
const { toDisplayDto } = require('../catalog/VoiceCatalog');

class TtsQueryService {
  /**
   * 依赖注入
   * @param {Object} options
   * @param {Object} [options.ttsProvider] - TTS Provider 适配器
   * @param {Object} [options.providerManagementService] - 服务商管理服务（统一服务商信息入口）
   * @param {Object} [options.capabilityResolver] - 能力解析器（统一能力规则源）
   * @param {Object} [options.voiceCatalog] - 音色目录适配器（可选，用于上报分组逻辑）
   * @param {Object} [options.voiceRegistry] - VoiceRegistry 实例（备用）
   */
  constructor({ ttsProvider, providerManagementService, capabilityResolver, voiceCatalog, voiceCatalogQuery, voiceRegistry } = {}) {
    this.ttsProvider = ttsProvider;
    this.providerManagementService = providerManagementService;
    this.capabilityResolver = capabilityResolver;
    this.voiceCatalog = voiceCatalog;
    this._voiceCatalogQuery = voiceCatalogQuery;
    this._voiceRegistry = voiceRegistry;
  }

  // ==================== 音色查询 ====================

  /**
   * 查询音色列表（带筛选）
   */
  queryVoices(filters = {}) {
    const { includeCounts = true } = filters;

    const vc = this._ensureVoiceCatalogQuery();
    const items = vc.query(filters);
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
    const vc = this._ensureVoiceCatalogQuery();
    const voice = vc.getDisplay(voiceId);
    if (!voice) return null;

    return this._isProviderVisible(voice.provider) ? voice : null;
  }

  getVoiceDetail(voiceId) {
    const vc = this._ensureVoiceCatalogQuery();
    const detail = vc.getDetail(voiceId);
    if (!detail) return null;

    return this._isProviderVisible(detail.identity?.provider) ? detail : null;
  }

  async getVoices(provider, serviceType) {
    const vc = this._ensureVoiceCatalogQuery();
    if (provider && serviceType) {
      return vc.getByProviderAndService(provider, serviceType);
    }
    if (provider) {
      return vc.getByProvider(provider);
    }
    return vc.getAllDisplay();
  }

  /**
   * 获取音色详情
   */
  getVoiceDetail(voiceId) {
    const detail = this._ensureVoiceCatalogQuery().getDetail(voiceId);
    if (!detail) return null;

    return this._isProviderVisible(detail.identity?.provider) ? detail : null;
  }

  /**
   * 获取可用音色（按provider/service）
   */
  async getVoices(provider, serviceType) {
    if (provider && serviceType) {
      return this._ensureVoiceCatalogQuery().getByProviderAndService(provider, serviceType);
    }
    if (provider) {
      return this._ensureVoiceCatalogQuery().getByProvider(provider);
    }
    return this._ensureVoiceCatalogQuery().getAllDisplay();
  }

  /**
   * 获取所有可用音色（按服务分组）
   * 优先委托 VoiceCatalogAdapter，回退到直接查询（向后兼容）
   */
  async getAllVoices() {
    if (this.voiceCatalog) {
      return this.voiceCatalog.getAllGroupedByService();
    }

    const reg = this._ensureVoiceRegistry();
    const stats = reg.getStats();
    const result = {};

    for (const [provider] of Object.entries(stats.providers)) {
      const voices = reg.getByProvider(provider);

      const services = {};
      for (const voice of voices) {
        const service = voice.identity?.service || voice.service || 'default';
        const key = `${provider}_${service}`;

        if (!services[key]) {
          services[key] = { provider, service, voices: [] };
        }
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
   * 返回 CompiledCapability 的完整信息，前端可据此渲染参数表单：
   * - schema: 每个字段的完整定义（status/type/default/range/values/ui/nestedFields/mapping）
   * - defaults: 合并后的默认值（含嵌套）
   * - lockedParams: 锁定参数及其值来源
   * - uiSchema: 分组/排序/折叠等 UI 元数据
   * - fieldIndex: supported/unsupported/locked 分类索引
   * - metadata: 服务商元信息
   */
  getCapabilities(serviceKey) {
    const canonicalKey = this._resolveCanonicalKey(serviceKey);
    if (!canonicalKey) {
      return { success: false, error: `Service not found: ${serviceKey}` };
    }

    const resolver = this._ensureCapabilityResolver();
    const context = resolver.resolve(canonicalKey);
    const compiled = context.compiled;

    if (!compiled) {
      return { success: false, error: `No compiled capability for: ${canonicalKey}` };
    }

    const schema = compiled.getSchema();
    const defaults = compiled.getDefaults();
    const lockedParams = compiled.getLockedParams();
    const uiSchema = compiled.getUiSchema();
    const fieldIndex = compiled.getFieldIndex();

    return {
      success: true,
      data: {
        serviceKey: canonicalKey,
        providerKey: compiled.providerKey,
        apiStructure: compiled.apiStructure,

        // 完整字段 Schema（前端渲染表单的主数据源）
        schema: this._serializeSchema(schema),

        // 合并后的默认值
        defaults,

        // 锁定参数及值来源
        lockedParams,

        // UI Schema（分组/排序/折叠）
        uiSchema,

        // 字段分类索引
        fieldIndex,

        // 元信息
        defaultVoiceId: context.defaultVoiceId
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 将 CompiledCapability schema 序列化为前端友好的结构
   * 去掉 mapper 函数（不可序列化），保留所有渲染所需信息
   */
  _serializeSchema(schema) {
    const result = {};
    for (const [key, field] of Object.entries(schema)) {
      const { mapper, ...rest } = field;
      // 序列化嵌套字段
      if (rest.nestedFields && Array.isArray(rest.nestedFields)) {
        result[key] = {
          ...rest,
          nestedFields: rest.nestedFields.map(nf => {
            const { mapper: nm, ...nrest } = nf;
            return nrest;
          })
        };
      } else {
        result[key] = rest;
      }
    }
    return result;
  }

  _resolveCanonicalKey(serviceKey) {
    const pms = this._ensureProviderManagementService();
    return pms.resolveCanonicalKey(serviceKey) || serviceKey;
  }

  // ==================== 前端展示 ====================

  /**
   * 获取前端展示目录
   * 使用统一的 VoiceListItemDTO
   */
  getFrontendCatalog() {
    const items = this._filterVisibleVoices(this._ensureVoiceCatalogQuery().query({}));
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
    const items = this._filterVisibleVoices(this._ensureVoiceCatalogQuery().query({}));

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
    const items = this._filterVisibleVoices(this._ensureVoiceCatalogQuery().query({}));
    const filters = this._buildFiltersMeta(items);

    return {
      success: true,
      data: filters,
      timestamp: new Date().toISOString()
    };
  }

  // ==================== 辅助方法 ====================

  _isProviderVisible(provider) {
    return this._ensureVoiceRegistry().isProviderEnabled(provider);
  }

  _hasVisibleVoicesFor(provider, service) {
    if (!this._isProviderVisible(provider)) return false;
    return this._ensureVoiceRegistry().getByProviderAndService(provider, service).length > 0;
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

  _ensureVoiceCatalogQuery() {
    if (!this._voiceCatalogQuery) {
      throw new Error(
        'VoiceCatalog not injected into TtsQueryService. ' +
        'Ensure ServiceContainer.initialize() is called before using voice query methods.'
      );
    }
    return this._voiceCatalogQuery;
  }

  _ensureVoiceRegistry() {
    if (!this._voiceRegistry) {
      throw new Error(
        'VoiceRegistry not injected into TtsQueryService. ' +
        'Ensure ServiceContainer.initialize() is called.'
      );
    }
    return this._voiceRegistry;
  }
}

module.exports = TtsQueryService;
