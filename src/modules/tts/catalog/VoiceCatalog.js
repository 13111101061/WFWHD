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
 * - voiceRegistry 通过构造函数注入
 */

const VoiceNormalizer = require('../application/VoiceNormalizer');

/**
 * 从 StoredVoice 构建展示 DTO（列表标准出口）
 * 只包含前端展示所需字段，不暴露运行时敏感信息
 */
function toDisplayDto(storedVoice) {
  if (!storedVoice) return null;
  if (storedVoice.profile?.status === 'deleted') return null;

  const identity = storedVoice.identity || {};
  const profile = storedVoice.profile || {};
  const runtime = storedVoice.runtime || {};

  return {
    id: identity.id,
    voiceCode: identity.voiceCode,
    provider: identity.provider,
    service: identity.service,
    displayName: profile.displayName,
    gender: profile.gender,
    languages: profile.languages || ['zh-CN'],
    categories: profile.categories || [],
    tags: profile.tags || [],
    tagCategories: profile.tagCategories || {},
    description: profile.description || '',
    status: profile.status || 'active',
    previewUrl: profile.preview || null,
    alias: profile.alias || null
  };
}

/**
 * 从 StoredVoice 构建详情 DTO（详情标准出口）
 */
function toDetailDto(storedVoice) {
  if (!storedVoice) return null;

  const identity = storedVoice.identity || {};
  const profile = storedVoice.profile || {};
  const runtime = storedVoice.runtime || {};
  const meta = storedVoice.meta || {};

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

class VoiceCatalog {
  /**
   * @param {Object} options
   * @param {Object|Array} options.registries - VoiceRegistry 实例数组（或单个）
   * @param {Object} [options.voiceRegistry] - 向后兼容：单个 registry
   */
  constructor({ registries, voiceRegistry } = {}) {
    if (registries) {
      this.registries = Array.isArray(registries) ? registries : [registries];
    } else if (voiceRegistry) {
      this.registries = [voiceRegistry];
    } else {
      this.registries = [];
    }
  }

  get isReady() {
    return this.registries.length > 0 && this.registries.every(r => r.isReady);
  }

  get(voiceId) {
    for (const reg of this.registries) {
      const v = reg.get(voiceId);
      if (v) return v;
    }
    return null;
  }

  getByVoiceCode(voiceCode) {
    for (const reg of this.registries) {
      const id = reg.voiceCodeIndex.get(voiceCode);
      if (id) {
        const v = reg.get(id);
        if (v) return v;
      }
    }
    return null;
  }

  getRuntime(voiceId) {
    const stored = this.get(voiceId);
    return stored ? VoiceNormalizer.toRuntime(stored) : null;
  }

  getDisplay(voiceId) {
    const stored = this.get(voiceId);
    return toDisplayDto(stored);
  }

  getDetail(voiceId) {
    const stored = this.get(voiceId);
    return toDetailDto(stored);
  }

  getAllDisplay(source) {
    let voices = [];
    for (const reg of this.registries) {
      voices = voices.concat(reg.getAll());
    }
    if (source) {
      voices = voices.filter(v => v.meta?.dataSource === source);
    }
    return voices.map(v => toDisplayDto(v)).filter(Boolean);
  }

  getByProvider(provider) {
    let results = [];
    for (const reg of this.registries) {
      results = results.concat(reg.getByProvider(provider));
    }
    return results.map(v => toDisplayDto(v)).filter(Boolean);
  }

  getByProviderAndService(provider, service) {
    let results = [];
    for (const reg of this.registries) {
      results = results.concat(reg.getByProviderAndService(provider, service));
    }
    return results.map(v => toDisplayDto(v)).filter(Boolean);
  }

  query(filters = {}) {
    const { provider, service, gender, tags, language, category, source } = filters;

    let voices = [];
    for (const reg of this.registries) {
      if (provider && service) {
        voices = voices.concat(reg.getByProviderAndService(provider, service));
      } else if (provider) {
        voices = voices.concat(reg.getByProvider(provider));
      } else if (category) {
        voices = voices.concat(reg.getByCategory(category));
      } else {
        voices = voices.concat(reg.getAll());
      }
    }

    let results = voices;

    if (source) {
      results = results.filter(v => v.meta?.dataSource === source);
    }

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

    if (category && results.length === 0) {
      results = [];
      for (const reg of this.registries) {
        results = results.concat(reg.getAll().filter(v =>
          v.profile?.categories && v.profile.categories.includes(category)
        ));
      }
    }

    return results.map(toDisplayDto).filter(Boolean);
  }

  getFiltersMeta() {
    const providers = new Set();
    const services = new Set();
    const genders = new Set();
    const languages = new Set();
    const allTags = new Set();
    const allCategories = new Set();

    for (const reg of this.registries) {
      reg.getAll().forEach(v => {
        const identity = v.identity || {};
        const profile = v.profile || {};
        if (identity.provider) providers.add(identity.provider);
        if (identity.service) services.add(identity.service);
        if (profile.gender) genders.add(profile.gender);
        if (profile.languages) profile.languages.forEach(l => languages.add(l));
        if (profile.tags) profile.tags.forEach(t => allTags.add(t));
        if (profile.categories) profile.categories.forEach(c => allCategories.add(c));
      });
    }

    return {
      providers: Array.from(providers).sort(),
      services: Array.from(services).sort(),
      genders: Array.from(genders).sort(),
      languages: Array.from(languages).sort(),
      tags: Array.from(allTags).sort(),
      categories: Array.from(allCategories).sort()
    };
  }

  getStats() {
    let total = 0;
    const byProvider = {};

    for (const reg of this.registries) {
      const stats = reg.getStats();
      total += stats.total;
      for (const [p, info] of Object.entries(stats.providers)) {
        if (byProvider[p]) {
          byProvider[p].count += info.count;
        } else {
          byProvider[p] = { ...info };
        }
      }
    }

    return {
      total,
      providers: byProvider,
      registries: this.registries.length
    };
  }
}

module.exports = { VoiceCatalog, toDisplayDto, toDetailDto };
