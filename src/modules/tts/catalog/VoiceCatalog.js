/**
 * VoiceCatalog
 *
 * Responsibilities:
 * - Convert raw voice records from VoiceRegistry into stable catalog objects
 * - Separate profile (display) and runtime (execution) concerns
 * - Provide a single query facade for voice metadata
 *
 * v3.0 更新：
 * - 适配 StoredVoice 格式（identity/profile/runtime/meta）
 * - VoiceNormalizer 自动转换旧格式
 * - 只从 profile 读取展示信息，不暴露 runtime.voiceId
 * - 展示字段标准化：preview → previewUrl
 */

const { voiceRegistry } = require('../core/VoiceRegistry');
const VoiceNormalizer = require('../application/VoiceNormalizer');

/**
 * 从 StoredVoice 构建展示 DTO（列表标准出口）
 * 只包含前端展示所需字段，不暴露运行时敏感信息
 *
 * 标准字段（11个核心展示字段）：
 * - id: 内部音色ID
 * - voiceCode: 编码ID
 * - provider: 服务商
 * - service: 服务类型
 * - displayName: 展示名称
 * - gender: 性别
 * - languages: 语言
 * - tags: 风格标签
 * - description: 简介
 * - status: 状态
 * - previewUrl: 试听地址
 */
function toDisplayDto(storedVoice) {
  if (!storedVoice) return null;

  const identity = storedVoice.identity || {};
  const profile = storedVoice.profile || {};
  const runtime = storedVoice.runtime || {};

  return {
    // 核心展示字段
    id: identity.id,
    voiceCode: identity.voiceCode,
    provider: identity.provider,
    service: identity.service,
    displayName: profile.displayName,
    gender: profile.gender,
    languages: profile.languages || ['zh-CN'],
    tags: profile.tags || [],
    description: profile.description || '',
    status: profile.status || 'active',
    previewUrl: profile.preview || null,

    // 扩展展示信息
    alias: profile.alias,

    // 运行时预览（不暴露 voiceId）
    runtimePreview: {
      model: runtime.model,
      hasProviderOptions: !!(runtime.providerOptions && Object.keys(runtime.providerOptions).length > 0)
    }
  };
}

/**
 * 从 StoredVoice 构建详情 DTO（详情标准出口）
 * 包含完整信息，但 voiceId 脱敏处理
 */
function toDetailDto(storedVoice) {
  if (!storedVoice) return null;

  const identity = storedVoice.identity || {};
  const profile = storedVoice.profile || {};
  const runtime = storedVoice.runtime || {};
  const meta = storedVoice.meta || {};

  // voiceId 脱敏处理（保留前4位和后4位）
  const voiceId = runtime.voiceId;
  const maskedVoiceId = voiceId && voiceId.length > 8
    ? `${voiceId.substring(0, 4)}****${voiceId.substring(voiceId.length - 4)}`
    : voiceId;

  return {
    identity: {
      id: identity.id,
      voiceCode: identity.voiceCode,
      sourceId: identity.sourceId,
      provider: identity.provider,
      service: identity.service
    },
    profile: {
      displayName: profile.displayName,
      alias: profile.alias,
      gender: profile.gender,
      languages: profile.languages || ['zh-CN'],
      description: profile.description,
      tags: profile.tags || [],
      status: profile.status || 'active',
      previewUrl: profile.preview || null
    },
    runtimePreview: {
      model: runtime.model,
      maskedVoiceId,
      hasProviderOptions: !!(runtime.providerOptions && Object.keys(runtime.providerOptions).length > 0)
    },
    meta: {
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      dataSource: meta.dataSource,
      version: meta.version
    }
  };
}

const VoiceCatalog = {
  /**
   * 获取单个音色的完整 catalog 对象
   */
  get(voiceId) {
    const raw = voiceRegistry.get(voiceId);
    if (!raw) return null;

    // VoiceRegistry.get 已经过 VoiceNormalizer.fromLegacy 转换
    return raw;
  },

  /**
   * 获取运行时配置（供 VoiceResolver 使用）
   */
  getRuntime(voiceId) {
    const stored = this.get(voiceId);
    return stored ? VoiceNormalizer.toRuntime(stored) : null;
  },

  /**
   * 获取展示 DTO
   */
  getDisplay(voiceId) {
    const stored = this.get(voiceId);
    return toDisplayDto(stored);
  },

  /**
   * 获取详情 DTO
   */
  getDetail(voiceId) {
    const stored = this.get(voiceId);
    return toDetailDto(stored);
  },

  /**
   * 获取所有音色的展示 DTO
   */
  getAllDisplay() {
    const voices = voiceRegistry.getAll();
    return voices
      .map(v => toDisplayDto(v))
      .filter(Boolean);
  },

  /**
   * 按服务商获取
   */
  getByProvider(provider) {
    const voices = voiceRegistry.getByProvider(provider);
    return voices
      .map(v => toDisplayDto(v))
      .filter(Boolean);
  },

  /**
   * 按服务商和服务类型获取
   */
  getByProviderAndService(provider, service) {
    const voices = voiceRegistry.getByProviderAndService(provider, service);
    return voices
      .map(v => toDisplayDto(v))
      .filter(Boolean);
  },

  /**
   * 查询过滤
   */
  query(filters = {}) {
    const { provider, service, gender, tags, language } = filters;

    let voices;
    if (provider && service) {
      voices = voiceRegistry.getByProviderAndService(provider, service);
    } else if (provider) {
      voices = voiceRegistry.getByProvider(provider);
    } else {
      voices = voiceRegistry.getAll();
    }

    let results = voices;

    if (gender) {
      results = results.filter(v => v.profile?.gender === gender);
    }

    if (tags) {
      const tagList = tags.split(',').map(t => t.trim());
      results = results.filter(v =>
        v.profile?.tags && tagList.some(t => v.profile.tags.includes(t))
      );
    }

    if (language) {
      results = results.filter(v =>
        v.profile?.languages && v.profile.languages.includes(language)
      );
    }

    return results.map(toDisplayDto).filter(Boolean);
  },

  /**
   * 获取过滤选项元数据
   */
  getFiltersMeta() {
    const voices = voiceRegistry.getAll();

    const providers = new Set();
    const services = new Set();
    const genders = new Set();
    const languages = new Set();
    const allTags = new Set();

    voices.forEach(v => {
      const identity = v.identity || {};
      const profile = v.profile || {};

      if (identity.provider) providers.add(identity.provider);
      if (identity.service) services.add(identity.service);
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
  toDisplayDto,
  toDetailDto
};
