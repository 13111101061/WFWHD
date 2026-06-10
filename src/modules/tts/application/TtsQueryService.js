/**
 * TtsQueryService - TTS查询服务
 *
 * 核心职责：
 * - 音色查询（列表/详情/筛选）
 * - 提供商查询
 * - 服务能力查询
 * - 前端展示数据组装（catalog / bootstrap / frontend）
 *
 * 展示 DTO 统一由 VoiceCatalog.toDisplayDto() / toDetailDto() 生成
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
   * @param {Object} [options.providerRegistry] - ProviderRegistry 实例（用于构建动态路由信息）
   */
  constructor({ ttsProvider, providerManagementService, capabilityResolver, voiceCatalog, voiceCatalogQuery, voiceRegistry, providerRegistry } = {}) {
    this.ttsProvider = ttsProvider;
    this.providerManagementService = providerManagementService;
    this.capabilityResolver = capabilityResolver;
    this.voiceCatalog = voiceCatalog;
    this._voiceCatalogQuery = voiceCatalogQuery;
    this._voiceRegistry = voiceRegistry;
    this._providerRegistry = providerRegistry || null;
  }

  // ==================== 音色查询 ====================

  /**
   * 查询音色列表（带筛选）
   */
  queryVoices(filters = {}) {
    const { includeCounts = true, category } = filters;

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
  getCapabilities(serviceKey, query = {}) {
    const canonicalKey = this._resolveCanonicalKey(serviceKey);
    if (!canonicalKey) {
      return { success: false, error: `Service not found: ${serviceKey}` };
    }

    const resolver = this._ensureCapabilityResolver();
    const context = resolver.resolve({
      serviceKey: canonicalKey,
      modelKey: query.model || null,
      mode: query.mode || null,
      inputFormat: query.inputFormat || null,
      voiceCode: query.voiceCode || null
    });
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
        serviceType: this._getServiceType(canonicalKey),
        capabilityDigest: context.contextualDigest || compiled.capabilityDigest,
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
        defaultVoiceId: context.defaultVoiceId,

        // 能力模式（为未来 streaming/async 预留结构）
        executionModes: context.executionModes,
        inputFormats: context.inputFormats,
        outputFormats: context.outputFormats,

        // 调用契约（前端自动生成调用所需信息）
        requestContract: this._buildRequestContract(canonicalKey, compiled)
      },
      timestamp: new Date().toISOString()
    };
  }

  _getServiceType(serviceKey) {
    if (this._providerRegistry) {
      const desc = this._providerRegistry.get(serviceKey);
      if (desc) return desc.serviceType;
    }
    // fallback
    const parts = serviceKey.split('_');
    return parts.slice(1).join('_');
  }

  _buildRequestContract(serviceKey, compiled) {
    const basePath = '/api/tts';
    let pk, suffix;

    if (this._providerRegistry) {
      const rd = this._providerRegistry.getRouteDescriptor(serviceKey);
      if (rd) {
        return {
          endpoint: `POST ${basePath}/synthesize`,
          quickEndpoint: `${rd.primary.method} ${rd.primary.path}`,
          method: 'POST',
          contentType: 'application/json',
          bodyShape: {
            text: 'string',
            service: serviceKey,
            voiceCode: 'string?',
            systemId: 'string?',
            capabilityDigest: 'string?',
            options: 'object'
          },
          requiredIdentity: ['voiceCode', 'systemId', 'voice'],
          recommendedIdentity: 'voiceCode',
          capabilityDigestField: 'capabilityDigest',
          apiStructure: compiled.apiStructure || 'flat'
        };
      }
    }

    // fallback
    const parts = serviceKey.split('_');
    pk = parts[0];
    suffix = parts.slice(1).join('_');

    return {
      endpoint: `POST ${basePath}/synthesize`,
      quickEndpoint: `POST ${basePath}/${pk}/${suffix}`,
      method: 'POST',
      contentType: 'application/json',
      bodyShape: {
        text: 'string',
        service: serviceKey,
        voiceCode: 'string?',
        systemId: 'string?',
        capabilityDigest: 'string?',
        options: 'object'
      },
      requiredIdentity: ['voiceCode', 'systemId', 'voice'],
      recommendedIdentity: 'voiceCode',
      capabilityDigestField: 'capabilityDigest',
      apiStructure: compiled.apiStructure || 'flat'
    };
  }

  /**
   * 将 CompiledCapability schema 序列化为前端友好的结构
   * 去掉不可序列化的函数字段（mapper, validator, sortIndex）
   */
  _serializeSchema(schema) {
    const stripKeys = new Set(['mapper', 'validator', 'sortIndex']);
    const result = {};
    for (const [key, field] of Object.entries(schema)) {
      const cleaned = {};
      for (const [k, v] of Object.entries(field)) {
        if (!stripKeys.has(k)) cleaned[k] = v;
      }
      if (field.nestedFields && Array.isArray(field.nestedFields)) {
        cleaned.nestedFields = field.nestedFields.map(nf => {
          const ncleaned = {};
          for (const [nk, nv] of Object.entries(nf)) {
            if (!stripKeys.has(nk)) ncleaned[nk] = nv;
          }
          return ncleaned;
        });
      }
      result[key] = cleaned;
    }
    return result;
  }

  _resolveCanonicalKey(serviceKey) {
    const pms = this._ensureProviderManagementService();
    return pms.resolveCanonicalKey(serviceKey) || serviceKey;
  }

  // ==================== 紧凑转换（面向前端表单） ====================

  /**
   * 将 CompiledCapability 转换为前端表单渲染所需的最小数据集
   * 只保留 supported 字段（排除 voice/text），剥离内部细节
   */
  _toCompactCapability(compiled) {
    const schema = compiled.getSchema();
    const fieldIndex = compiled.getFieldIndex();
    const lockedParams = compiled.getLockedParams();
    const uiGroups = compiled.getUiGroups();
    const defaults = compiled.getDefaults();

    // 仅保留 supported 且非 voice/text 的字段
    const SKIP_KEYS = new Set(['voice', 'text']);
    const parameters = {};

    for (const [key, field] of Object.entries(schema)) {
      if (field.status !== 'supported') continue;
      if (SKIP_KEYS.has(key)) continue;

      const compact = {
        type: field.type,
        default: field.defaultValue,
        label: field.displayName,
      };
      if (field.description) compact.description = field.description;
      if (field.range) compact.range = field.range;
      if (field.values) compact.values = field.values;
      if (field.ui && Object.keys(field.ui).length > 0) compact.ui = field.ui;

      // 处理嵌套字段（如 samplingParams）
      if (field.nestedFields && Array.isArray(field.nestedFields)) {
        compact.type = 'object';
        compact.nestedFields = field.nestedFields
          .filter(nf => nf.status === 'supported')
          .map(nf => {
            const nCompact = {
              key: nf.key,
              type: nf.type,
              default: nf.defaultValue,
              label: nf.displayName,
            };
            if (nf.description) nCompact.description = nf.description;
            if (nf.range) nCompact.range = nf.range;
            if (nf.values) nCompact.values = nf.values;
            if (nf.ui && Object.keys(nf.ui).length > 0) nCompact.ui = nf.ui;
            return nCompact;
          });
      }

      parameters[key] = compact;
    }

    // 构建 locked 对象（含值和原因）
    const locked = {};
    for (const [key, info] of Object.entries(lockedParams)) {
      locked[key] = {
        value: info.value,
        valueSource: info.valueSource || null,
        reason: info.reason || null
      };
    }

    // 过滤 UI 分组：只保留含 supported 字段的分组
    const supportedSet = new Set(Object.keys(parameters));
    const groups = uiGroups
      .map(g => ({
        key: g.key,
        displayName: g.displayName,
        order: g.order,
        collapsed: g.collapsed || false,
        fields: (g.fields || []).filter(f => supportedSet.has(f))
      }))
      .filter(g => g.fields.length > 0);

    return {
      parameters,
      locked,
      unsupported: fieldIndex.unsupported || [],
      groups,
      capabilityDigest: compiled.capabilityDigest
    };
  }

  /**
   * 从 toDisplayDto 输出中提取统一的紧凑音色 DTO
   * 所有新端点使用此方法，保证字段一致
   */
  _toCompactVoiceDto(displayDto) {
    return {
      id: displayDto.id,
      voiceCode: displayDto.voiceCode,
      displayName: displayDto.displayName,
      gender: displayDto.gender,
      languages: displayDto.languages,
      categories: displayDto.categories,
      tags: displayDto.tags,
      previewUrl: displayDto.previewUrl
    };
  }

  /**
   * 构建前端可直接使用的调用模板（预填默认值）
   */
  _toCompactRequestTemplate(serviceKey, compiled) {
    const basePath = '/api/tts';
    let quickEndpoint = `POST ${basePath}/synthesize`;

    if (this._providerRegistry) {
      const rd = this._providerRegistry.getRouteDescriptor(serviceKey);
      if (rd) {
        quickEndpoint = `${rd.primary.method} ${rd.primary.path}`;
      }
    } else {
      const parts = serviceKey.split('_');
      quickEndpoint = `POST ${basePath}/${parts[0]}/${parts.slice(1).join('_')}`;
    }

    // 预填 options：仅 supported 字段的默认值
    const defaults = compiled.getDefaults();
    const supportedFields = new Set(compiled.getSupportedFields());
    const SKIP_KEYS = new Set(['voice', 'text']);
    const options = {};
    for (const [key, value] of Object.entries(defaults)) {
      if (SKIP_KEYS.has(key)) continue;
      if (!supportedFields.has(key)) continue;
      options[key] = value;
    }

    return {
      endpoint: `POST ${basePath}/synthesize`,
      quickEndpoint,
      body: {
        text: '...(输入文本)',
        service: serviceKey,
        voiceCode: '(选择音色)',
        capabilityDigest: compiled.capabilityDigest,
        options
      }
    };
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

    // providers: 使用干净的 provider 数组（从 ProviderManagementService，但不嵌套包装）
    const allInfo = this._ensureProviderManagementService().getAllServiceInfo();
    const providerList = allInfo
      .filter(info => info.availability.adapterRegistered)
      .map(info => ({
        key: info.key,
        provider: info.provider,
        service: info.service,
        serviceType: this._getServiceType(info.key),
        displayName: info.displayName,
        description: info.description,
        configured: info.availability.credentialsConfigured,
        available: info.availability.available,
        status: info.status,
        capabilities: info.capabilities,
        aliases: info.aliases
      }));

    const voices = items;

    return {
      success: true,
      data: {
        schemaVersion: 'frontend-catalog.v2',
        generatedAt: new Date().toISOString(),
        voices,
        filters,
        counts,
        index,
        providers: providerList
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
      categories: item.categories,
      tags: item.tags,
      tagCategories: item.tagCategories,
      description: item.description,
      previewUrl: item.previewUrl
    }));

    // 构建筛选元数据
    const genders = new Set();
    const languages = new Set();
    const categories = new Set();
    const tags = new Set();

    voices.forEach(v => {
      if (v.gender) genders.add(v.gender);
      v.languages.forEach(lang => languages.add(lang));
      if (Array.isArray(v.categories)) v.categories.forEach(cat => categories.add(cat));
      v.tags.forEach(tag => tags.add(tag));
    });

    return {
      success: true,
      data: {
        voices,
        filters: {
          genders: Array.from(genders).sort(),
          languages: Array.from(languages).sort(),
          categories: Array.from(categories).sort(),
          tags: Array.from(tags).sort()
        },
        total: voices.length
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 前端启动包 — 单次请求获取完整前端初始数据
   *
   * 包含：
   * - endpoints: 合成/批量/快捷路由等信息
   * - services: 每个 serviceKey 的 descriptor + capabilityDigest + capabilitySummary + formSchemaUrl
   * - voices: 精简音色列表 + filters
   * - 不包含：完整 capability schema（前端通过 formSchemaUrl 按需拉取，避免响应过大）
   *
   * 前端可以基于此一次拉取后：
   * - 渲染服务商选择器
   * - 渲染音色选择器
   * - 渲染参数表单（按需拉取 capability schema）
   * - 生成调用 endpoint
   * - 校验 schema 版本
   */
  getFrontendBootstrap() {
    const pms = this._ensureProviderManagementService();
    const resolver = this._ensureCapabilityResolver();
    const pr = this._providerRegistry;

    // 1. 端点信息
    const basePath = '/api/tts';
    const endpoints = {
      synthesize: `POST ${basePath}/synthesize`,
      batch: `POST ${basePath}/batch`,
      catalog: `GET ${basePath}/catalog`,
      bootstrap: `GET ${basePath}/bootstrap`
    };

    // 2. 服务信息（含 capabilityDigest + 动态路由）
    const allInfo = pms.getAllServiceInfo();
    const services = [];
    const vc = this._ensureVoiceCatalogQuery();
    const reg = this._voiceRegistry;

    for (const info of allInfo) {
      let digest = null;
      let capabilitySummary = null;
      let defaultVoiceId = null;
      let capabilityCompiled = false;

      try {
        const ctx = resolver.resolve(info.key);
        if (ctx?.compiled) {
          digest = ctx.contextualDigest || ctx.compiled.capabilityDigest;
          capabilitySummary = ctx.compiled.getCapabilities();
          capabilityCompiled = true;
        }
        defaultVoiceId = ctx?.defaultVoiceId || null;
      } catch (e) { /* skip */ }

      const desc = pr ? pr.get(info.key) : null;
      const serviceType = desc?.serviceType || info.key.split('_').slice(1).join('_');
      const voiceCount = reg ? reg.getByProviderAndService(info.provider, serviceType).length : 0;

      const serviceEntry = {
        serviceKey: info.key,
        providerKey: info.provider,
        serviceType,
        displayName: info.displayName,
        description: info.description,
        aliases: info.aliases || [],
        status: info.status,
        configured: info.availability.credentialsConfigured,
        available: info.availability.available,
        protocol: (info.capabilities && info.capabilities.protocol) || 'http',
        supportsStreaming: (info.capabilities && info.capabilities.streaming) || false,
        supportsAsync: (info.capabilities && info.capabilities.async) || false,
        defaultVoiceId,
        capabilityDigest: digest,
        capabilitySummary,
        formSchemaUrl: `${basePath}/capabilities/${info.key}`,
        // 能力模式（为 streaming/async 预留）
        executionModes: ctx?.executionModes || null,
        inputFormats: ctx?.inputFormats || null,
        outputFormats: ctx?.outputFormats || null,
        // 接入状态分解（新增 provider 调试用）
        onboarding: {
          manifestLoaded: true,
          adapterRegistered: !!info.availability.adapterRegistered,
          credentialsConfigured: !!info.availability.credentialsConfigured,
          voicesAvailable: voiceCount > 0,
          capabilityCompiled,
          defaultVoiceReady: !!(defaultVoiceId && reg && reg.get(defaultVoiceId)),
          voiceCount
        }
      };

      // 动态快捷路由（从统一的 route descriptor）
      if (pr) {
        const rd = pr.getRouteDescriptor(info.key);
        if (rd) {
          serviceEntry.routes = {
            primary: `${rd.primary.method} ${rd.primary.path}`,
            aliases: rd.aliases.map(a => `${a.method} ${a.path}`)
          };
        }
      }

      services.push(serviceEntry);
    }

    // 3. 音色数据
    const items = this._filterVisibleVoices(this._ensureVoiceCatalogQuery().query({}));
    const filters = this._buildFiltersMeta(items);

    const voices = items.map(item => ({
      id: item.id,
      voiceCode: item.voiceCode,
      provider: item.provider,
      service: item.service,
      displayName: item.displayName,
      gender: item.gender,
      languages: item.languages,
      categories: item.categories,
      tags: item.tags,
      tagCategories: item.tagCategories,
      description: item.description,
      previewUrl: item.previewUrl
    }));

    return {
      success: true,
      data: {
        schemaVersion: 'tts-frontend.v1',
        generatedAt: new Date().toISOString(),
        endpoints,
        services,
        voices,
        filters,
        totalVoices: voices.length
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

  // ==================== 表单一体化端点 ====================

  /**
   * 获取单个服务的合成表单数据（前端一体化接口）
   * 一次请求返回：服务商信息 + 紧凑能力 + 可用音色 + 调用模板
   *
   * @param {string} serviceKey - 服务标识（支持别名）
   * @param {Object} [query] - 查询参数 { model, mode, includeVoices }
   */
  getServiceForm(serviceKey, query = {}) {
    const canonicalKey = this._resolveCanonicalKey(serviceKey);
    const pms = this._ensureProviderManagementService();
    const allInfo = pms.getAllServiceInfo();
    const info = allInfo.find(i => i.key === canonicalKey);

    if (!info) {
      return { success: false, error: `Service not found: ${serviceKey}` };
    }

    // 服务商信息
    const desc = this._providerRegistry ? this._providerRegistry.get(canonicalKey) : null;
    const serviceType = desc?.serviceType || canonicalKey.split('_').slice(1).join('_');

    let routes = null;
    if (this._providerRegistry) {
      const rd = this._providerRegistry.getRouteDescriptor(canonicalKey);
      if (rd) {
        routes = {
          primary: `${rd.primary.method} ${rd.primary.path}`,
          aliases: rd.aliases.map(a => `${a.method} ${a.path}`)
        };
      }
    }

    const service = {
      serviceKey: canonicalKey,
      providerKey: info.provider,
      serviceType,
      displayName: info.displayName,
      description: info.description,
      status: info.status,
      configured: info.availability.credentialsConfigured,
      available: info.availability.available,
      defaultVoiceId: null,
      routes
    };

    // 能力
    const resolver = this._ensureCapabilityResolver();
    let capability = null;
    let requestTemplate = null;

    try {
      const ctx = resolver.resolve({
        serviceKey: canonicalKey,
        modelKey: query.model || null,
        mode: query.mode || null
      });

      if (ctx?.compiled) {
        capability = this._toCompactCapability(ctx.compiled);
        requestTemplate = this._toCompactRequestTemplate(canonicalKey, ctx.compiled);
        service.defaultVoiceId = ctx.defaultVoiceId || null;
      }
    } catch (e) {
      return { success: false, error: `No capability compiled for: ${canonicalKey}` };
    }

    // 音色
    let voices = null;
    let voiceCount = 0;
    const includeVoices = query.includeVoices !== 'false' && query.includeVoices !== false;

    if (includeVoices) {
      const reg = this._ensureVoiceRegistry();
      const displayVoices = reg.getByProviderAndService(info.provider, serviceType);
      voices = displayVoices
        .map(v => this._toCompactVoiceDto(v))
        .filter(Boolean);
      voiceCount = voices.length;
    }

    return {
      success: true,
      data: {
        schemaVersion: 'service-form.v1',
        generatedAt: new Date().toISOString(),
        service,
        capability,
        voices,
        voiceCount,
        requestTemplate
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取所有服务的紧凑能力摘要
   * 每个服务包含：compact capability + voiceCount + formUrl
   */
  getAllServicesFormSummary() {
    const pms = this._ensureProviderManagementService();
    const resolver = this._ensureCapabilityResolver();
    const reg = this._voiceRegistry;
    const allInfo = pms.getAllServiceInfo();

    const services = {};
    const basePath = '/api/tts';

    for (const info of allInfo) {
      if (!info.availability.adapterRegistered) continue;

      const desc = this._providerRegistry ? this._providerRegistry.get(info.key) : null;
      const serviceType = desc?.serviceType || info.key.split('_').slice(1).join('_');
      const voiceCount = reg ? reg.getByProviderAndService(info.provider, serviceType).length : 0;

      let capability = null;
      let defaultVoiceId = null;

      try {
        const ctx = resolver.resolve(info.key);
        if (ctx?.compiled) {
          capability = this._toCompactCapability(ctx.compiled);
        }
        defaultVoiceId = ctx?.defaultVoiceId || null;
      } catch (e) { /* skip */ }

      services[info.key] = {
        displayName: info.displayName,
        description: info.description,
        status: info.status,
        configured: info.availability.credentialsConfigured,
        available: info.availability.available,
        defaultVoiceId,
        capability,
        voiceCount,
        formUrl: `${basePath}/services/${info.key}/form`
      };
    }

    return {
      success: true,
      data: {
        schemaVersion: 'form-summary.v1',
        generatedAt: new Date().toISOString(),
        services
      },
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
    const categories = new Set();
    const tagCategories = {};

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

      if (Array.isArray(item.categories)) {
        item.categories.forEach(cat => categories.add(cat));
      }

      if (item.tagCategories && typeof item.tagCategories === 'object') {
        for (const [cat, catTags] of Object.entries(item.tagCategories)) {
          if (!tagCategories[cat]) tagCategories[cat] = new Set();
          if (Array.isArray(catTags)) catTags.forEach(t => tagCategories[cat].add(t));
        }
      }
    });

    const sortedTagCategories = {};
    for (const [cat, tset] of Object.entries(tagCategories)) {
      sortedTagCategories[cat] = Array.from(tset).sort();
    }

    return {
      providers: Array.from(providers).sort(),
      services: Array.from(services).sort(),
      genders: Array.from(genders).sort(),
      languages: Array.from(languages).sort(),
      tags: Array.from(tags).sort(),
      categories: Array.from(categories).sort(),
      tagCategories: sortedTagCategories
    };
  }

  _buildCounts(items) {
    const counts = {
      total: items.length,
      byProvider: {},
      byService: {},
      byGender: {},
      byCategory: {}
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

      if (Array.isArray(item.categories)) {
        item.categories.forEach(cat => {
          counts.byCategory[cat] = (counts.byCategory[cat] || 0) + 1;
        });
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
      byTag: {},
      byCategory: {},
      byGlobalCategory: {}
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

      if (item.tagCategories && typeof item.tagCategories === 'object') {
        for (const [cat, catTags] of Object.entries(item.tagCategories)) {
          if (!index.byCategory[cat]) index.byCategory[cat] = {};
          if (Array.isArray(catTags)) {
            catTags.forEach(t => {
              if (!index.byCategory[cat][t]) index.byCategory[cat][t] = [];
              index.byCategory[cat][t].push(item.id);
            });
          }
        }
      }

      if (Array.isArray(item.categories)) {
        item.categories.forEach(cat => {
          if (!index.byGlobalCategory[cat]) index.byGlobalCategory[cat] = [];
          index.byGlobalCategory[cat].push(item.id);
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
