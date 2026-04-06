/**
 * VoiceCatalog
 *
 * Responsibilities:
 * - Convert raw voice records from VoiceRegistry into stable catalog objects
 * - Separate profile (display) and runtime (execution) concerns
 * - Provide a single query facade for voice metadata
 */

const { voiceRegistry } = require('../core/VoiceRegistry');

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function omit(obj = {}, keys = []) {
  const keySet = new Set(keys);
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (!keySet.has(key) && value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

/**
 * Normalize runtime fields to a canonical schema:
 * - voiceId: provider-side voice identifier
 * - model, sampleRate, cluster, voiceType: common execution fields
 * - providerOptions: provider-specific runtime fields
 *
 * Backward compatibility:
 * - keep runtime.voice alias (same as voiceId when needed)
 * - keep _raw.ttsConfig in catalog object
 */
function normalizeRuntime(rawVoice = {}) {
  const legacy = rawVoice.ttsConfig || {};
  const rawRuntime = rawVoice.runtime || {};

  const fallbackVoiceId = pickFirst(
    legacy.voiceId,
    legacy.voiceName,
    legacy.sourceId,
    rawVoice.sourceId
  );

  const voiceId = pickFirst(
    rawRuntime.voiceId,
    rawRuntime.voice,
    fallbackVoiceId
  );

  const legacyProviderOptions = omit(legacy, [
    'voiceId',
    'voiceName',
    'sourceId',
    'model',
    'sampleRate',
    'cluster',
    'voiceType'
  ]);

  const runtimeProviderOptions = rawRuntime.providerOptions || {};

  const runtimeExtras = omit(rawRuntime, [
    'voice',
    'voiceId',
    'model',
    'sampleRate',
    'cluster',
    'voiceType',
    'providerOptions'
  ]);

  return {
    voiceId,
    model: pickFirst(rawRuntime.model, legacy.model),
    sampleRate: pickFirst(rawRuntime.sampleRate, legacy.sampleRate),
    cluster: pickFirst(rawRuntime.cluster, legacy.cluster),
    voiceType: pickFirst(rawRuntime.voiceType, legacy.voiceType),
    providerOptions: {
      ...legacyProviderOptions,
      ...runtimeProviderOptions
    },
    ...runtimeExtras,
    // Compatibility alias
    voice: pickFirst(rawRuntime.voice, voiceId)
  };
}

/**
 * Convert raw voice from registry to catalog object (profile/runtime split)
 */
function toCatalogVoice(rawVoice) {
  if (!rawVoice) return null;

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

  const runtime = normalizeRuntime(rawVoice);

  return {
    profile,
    runtime,
    _raw: {
      ttsConfig: rawVoice.ttsConfig,
      metadata: rawVoice.metadata
    }
  };
}

/**
 * Display DTO without runtime internals
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
 * Detail DTO with profile/runtime split
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
  get(voiceId) {
    const raw = voiceRegistry.get(voiceId);
    return toCatalogVoice(raw);
  },

  getRuntime(voiceId) {
    const catalog = this.get(voiceId);
    return catalog?.runtime || null;
  },

  getDisplay(voiceId) {
    const catalog = this.get(voiceId);
    return toDisplayDto(catalog);
  },

  getDetail(voiceId) {
    const catalog = this.get(voiceId);
    return toDetailDto(catalog);
  },

  getAllDisplay() {
    const rawVoices = voiceRegistry.getAll();
    return rawVoices
      .map(v => toCatalogVoice(v))
      .filter(Boolean)
      .map(toDisplayDto);
  },

  getByProvider(provider) {
    const rawVoices = voiceRegistry.getByProvider(provider);
    return rawVoices
      .map(v => toCatalogVoice(v))
      .filter(Boolean)
      .map(toDisplayDto);
  },

  getByProviderAndService(provider, service) {
    const rawVoices = voiceRegistry.getByProviderAndService(provider, service);
    return rawVoices
      .map(v => toCatalogVoice(v))
      .filter(Boolean)
      .map(toDisplayDto);
  },

  query(filters = {}) {
    const { provider, service, gender, tags, language } = filters;

    let rawVoices;
    if (provider && service) {
      rawVoices = voiceRegistry.getByProviderAndService(provider, service);
    } else if (provider) {
      rawVoices = voiceRegistry.getByProvider(provider);
    } else {
      rawVoices = voiceRegistry.getAll();
    }

    let catalogVoices = rawVoices
      .map(v => toCatalogVoice(v))
      .filter(Boolean);

    if (gender) {
      catalogVoices = catalogVoices.filter(v => v.profile.gender === gender);
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
