/**
 * VoiceCatalog - 音色目录层
 *
 * 职责：
 * - 作为 VoiceRegistry 和 TtsQueryService 之间的稳定接口
 * - 将原始音色数据转换为稳定的目录对象（profile + runtime 分离）
 * - 提供目录查询的统一入口
 *
 * 设计原则：
 * - TtsQueryService 不直接访问 voiceRegistry 原始结构
 * - 所有音色数据通过此层转换为稳定的 catalog object
 * - profile/runtime 分层在此完成
 */

const { voiceRegistry } = require('../core/VoiceRegistry');
const { ProviderCatalog } = require('./ProviderCatalog');

/**
 * 将原始音色转换为目录对象（profile/runtime 分离）
 * @param {Object} rawVoice - Registry 中的原始音色
 * @returns {Object} 目录对象
 */
function toCatalogVoice(rawVoice) {
  if (!rawVoice) return null;

  // Profile 层：展示信息（稳定，面向用户）
  const profile = {
    id: rawVoice.id,
    provider: rawVoice.provider,
    service: rawVoice.service,
    displayName: rawVoice.displayName || rawVoice.name,
    name: rawVoice.name,
    sourceId: rawVoice.sourceId,
    gender: rawVoice.gender,
    languages: rawVoice.languages || ['zh-CN'],
    description: rawVoice.description,
    tags: rawVoice.tags || [],
    category: rawVoice.category,
    preview: rawVoice.preview,
    status: rawVoice.status || 'active'
  };

  // Runtime 层：运行时配置（执行时使用）
  // 优先使用 runtime 字段，兼容 ttsConfig
  const runtime = {
    voice: rawVoice.runtime?.voice ||
           rawVoice.ttsConfig?.voiceId ||
           rawVoice.ttsConfig?.voiceName ||
           rawVoice.sourceId,
    model: rawVoice.runtime?.model || rawVoice.ttsConfig?.model,
    sampleRate: rawVoice.runtime?.sampleRate || rawVoice.ttsConfig?.sampleRate,
    cluster: rawVoice.runtime?.cluster || rawVoice.ttsConfig?.cluster,
    voiceType: rawVoice.runtime?.voiceType || rawVoice.ttsConfig?.voiceType
  };

  return {
    profile,
    runtime,
    // 原始字段保留（仅供兼容，不推荐直接使用）
    _raw: {
      ttsConfig: rawVoice.ttsConfig,
      metadata: rawVoice.metadata
    }
  };
}

/**
 * 将目录对象转换为展示用 DTO（隐藏 runtime 详情）
 * @param {Object} catalogVoice - 目录对象
 * @returns {Object} 展示用 DTO
 */
function toDisplayDto(catalogVoice) {
  if (!catalogVoice) return null;

  const { profile } = catalogVoice;
  return {
    id: profile.id,
    provider: profile.provider,
    service: profile.service,
    displayName: profile.displayName,
    name: profile.name,
    gender: profile.gender,
    languages: profile.languages,
    description: profile.description,
    tags: profile.tags,
    preview: profile.preview,
    status: profile.status
  };
}

/**
 * 将目录对象转换为详情 DTO（包含 profile/runtime 分层）
 * @param {Object} catalogVoice - 目录对象
 * @returns {Object} 详情 DTO
 */
function toDetailDto(catalogVoice) {
  if (!catalogVoice) return null;

  const { profile, runtime, _raw } = catalogVoice;

  return {
    profile,
    runtime,
    metadata: _raw?.metadata || {},
    createdAt: _raw?.metadata?.registeredAt || null,
    updatedAt: _raw?.metadata?.updatedAt || null
  };
}

const VoiceCatalog = {
  /**
   * 获取单个音色的目录对象
   * @param {string} voiceId - 音色 ID
   * @returns {Object|null} 目录对象
   */
  get(voiceId) {
    const raw = voiceRegistry.get(voiceId);
    return toCatalogVoice(raw);
  },

  /**
   * 获取单个音色的运行时配置
   * @param {string} voiceId - 音色 ID
   * @returns {Object|null} 运行时配置
   */
  getRuntime(voiceId) {
    const catalog = this.get(voiceId);
    return catalog?.runtime || null;
  },

  /**
   * 获取单个音色的展示信息
   * @param {string} voiceId - 音色 ID
   * @returns {Object|null} 展示 DTO
   */
  getDisplay(voiceId) {
    const catalog = this.get(voiceId);
    return toDisplayDto(catalog);
  },

  /**
   * 获取单个音色的详情信息（包含 profile/runtime 分层）
   * @param {string} voiceId - 音色 ID
   * @returns {Object|null} 详情 DTO
   */
  getDetail(voiceId) {
    const catalog = this.get(voiceId);
    return toDetailDto(catalog);
  },

  /**
   * 获取所有音色的展示列表
   * @returns {Object[]} 展示 DTO 数组
   */
  getAllDisplay() {
    const rawVoices = voiceRegistry.getAll();
    return rawVoices
      .map(v => toCatalogVoice(v))
      .filter(Boolean)
      .map(toDisplayDto);
  },

  /**
   * 按服务商获取音色展示列表
   * @param {string} provider - 服务商标识
   * @returns {Object[]} 展示 DTO 数组
   */
  getByProvider(provider) {
    const rawVoices = voiceRegistry.getByProvider(provider);
    return rawVoices
      .map(v => toCatalogVoice(v))
      .filter(Boolean)
      .map(toDisplayDto);
  },

  /**
   * 按服务商和服务获取音色展示列表
   * @param {string} provider - 服务商标识
   * @param {string} service - 服务标识
   * @returns {Object[]} 展示 DTO 数组
   */
  getByProviderAndService(provider, service) {
    const rawVoices = voiceRegistry.getByProviderAndService(provider, service);
    return rawVoices
      .map(v => toCatalogVoice(v))
      .filter(Boolean)
      .map(toDisplayDto);
  },

  /**
   * 查询音色列表（支持过滤）
   * @param {Object} filters - 过滤条件
   * @param {string} [filters.provider] - 服务商
   * @param {string} [filters.service] - 服务
   * @param {string} [filters.gender] - 性别
   * @param {string} [filters.tags] - 标签（逗号分隔）
   * @param {string} [filters.language] - 语言
   * @returns {Object[]} 展示 DTO 数组
   */
  query(filters = {}) {
    const { provider, service, gender, tags, language } = filters;

    // 先按 provider/service 过滤
    let rawVoices;
    if (provider && service) {
      rawVoices = voiceRegistry.getByProviderAndService(provider, service);
    } else if (provider) {
      rawVoices = voiceRegistry.getByProvider(provider);
    } else {
      rawVoices = voiceRegistry.getAll();
    }

    // 转换为目录对象
    let catalogVoices = rawVoices
      .map(v => toCatalogVoice(v))
      .filter(Boolean);

    // 应用其他过滤
    if (gender) {
      catalogVoices = catalogVoices.filter(v =>
        v.profile.gender === gender
      );
    }

    if (tags) {
      const tagList = tags.split(',').map(t => t.trim());
      catalogVoices = catalogVoices.filter(v =>
        v.profile.tags && tagList.some(t => v.profile.tags.includes(t))
      );
    }

    if (language) {
      catalogVoices = catalogVoices.filter(v =>
        v.profile.languages && v.profile.languages.includes(language)
      );
    }

    return catalogVoices.map(toDisplayDto);
  },

  /**
   * 获取筛选元数据
   * @returns {Object} 筛选器元数据
   */
  getFiltersMeta() {
    const rawVoices = voiceRegistry.getAll();
    const catalogVoices = rawVoices.map(v => toCatalogVoice(v)).filter(Boolean);

    const providers = new Set();
    const services = new Set();
    const genders = new Set();
    const languages = new Set();
    const allTags = new Set();

    catalogVoices.forEach(v => {
      const { profile } = v;
      if (profile.provider) providers.add(profile.provider);
      if (profile.service) services.add(profile.service);
      if (profile.gender) genders.add(profile.gender);
      if (profile.languages) {
        profile.languages.forEach(l => languages.add(l));
      }
      if (profile.tags) {
        profile.tags.forEach(t => allTags.add(t));
      }
    });

    return {
      providers: Array.from(providers).sort(),
      services: Array.from(services).sort(),
      genders: Array.from(genders).sort(),
      languages: Array.from(languages).sort(),
      tags: Array.from(allTags).sort()
    };
  },

  /**
   * 获取统计信息
   * @returns {Object} 统计数据
   */
  getStats() {
    const registryStats = voiceRegistry.getStats();

    return {
      total: registryStats.total,
      providers: registryStats.providers,
      services: registryStats.services,
      storage: registryStats.storage
    };
  }
};

module.exports = {
  VoiceCatalog,
  toCatalogVoice,
  toDisplayDto,
  toDetailDto
};