/**
 * VoiceNormalizer - 音色数据格式转换器
 *
 * 职责：
 * - VoiceFormDTO -> StoredVoice（表单转存储）
 * - StoredVoice -> VoiceFormDTO（存储转表单）
 * - StoredVoice -> RuntimeVoice（存储转运行时）
 * - LegacyVoice -> StoredVoice（旧格式兼容转换）
 *
 * 数据流：
 * 表单提交 -> VoiceFormSchema.validate() -> VoiceNormalizer.fromForm() -> StoredVoice
 * 旧数据读取 -> VoiceNormalizer.normalize() -> StoredVoice
 * 运行时调用 -> VoiceNormalizer.toRuntime() -> RuntimeVoice
 */

const VoiceCodeGenerator = require('../config/VoiceCodeGenerator');

/**
 * 从多个候选值中选取第一个有效值
 */
function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

/**
 * 从对象中排除指定字段
 */
function omit(obj = {}, keys = []) {
  const keySet = new Set(keys);
  return Object.entries(obj || {}).reduce((acc, [key, value]) => {
    if (!keySet.has(key) && value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

const VoiceNormalizer = {
  /**
   * 表单转存储结构
   * @param {Object} form - VoiceFormDTO
   * @param {Object} options - 可选配置
   * @param {number} options.voiceNumber - 音色编号（用于生成 voiceCode）
   * @returns {Object} StoredVoice
   */
  fromForm(form, options = {}) {
    const now = new Date().toISOString();

    // 生成 ID
    const id = `${form.provider}-${form.service}-${form.sourceId}`;

    // 生成 voiceCode
    let voiceCode = form.voiceCode;
    if (!voiceCode && options.voiceNumber) {
      try {
        voiceCode = VoiceCodeGenerator.generate({
          providerKey: form.provider,
          voiceNumber: options.voiceNumber
        });
      } catch (e) {
        console.warn(`[VoiceNormalizer] Failed to generate voiceCode: ${e.message}`);
        voiceCode = null;
      }
    }

    return {
      identity: {
        id,
        voiceCode,
        sourceId: form.sourceId,
        provider: form.provider,
        service: form.service
      },
      profile: {
        displayName: form.displayName,
        alias: form.alias || form.displayName,
        gender: form.gender,
        languages: form.languages || ['zh-CN'],
        description: form.description || '',
        tags: form.tags || [],
        status: form.status || 'active',
        preview: form.preview || null
      },
      runtime: {
        voiceId: form.providerVoiceId,
        model: form.model || 'default',
        providerOptions: form.providerOptions || {}
      },
      meta: {
        createdAt: now,
        updatedAt: now,
        dataSource: 'manual',
        version: 'v1'
      }
    };
  },

  /**
   * 存储转表单结构（用于编辑回填）
   * @param {Object} stored - StoredVoice
   * @returns {Object} VoiceFormDTO
   */
  toForm(stored) {
    if (!stored) return null;

    return {
      provider: stored.identity?.provider,
      service: stored.identity?.service,
      sourceId: stored.identity?.sourceId,
      displayName: stored.profile?.displayName,
      alias: stored.profile?.alias,
      gender: stored.profile?.gender,
      languages: stored.profile?.languages,
      description: stored.profile?.description,
      tags: stored.profile?.tags,
      status: stored.profile?.status,
      preview: stored.profile?.preview,
      providerVoiceId: stored.runtime?.voiceId,
      model: stored.runtime?.model,
      providerOptions: stored.runtime?.providerOptions
    };
  },

  /**
   * 存储转运行时结构（供 VoiceResolver 使用）
   * @param {Object} stored - StoredVoice
   * @returns {Object} RuntimeVoice
   */
  toRuntime(stored) {
    if (!stored) return null;

    return {
      provider: stored.identity?.provider,
      service: stored.identity?.service,
      voiceId: stored.runtime?.voiceId,
      model: stored.runtime?.model,
      providerOptions: stored.runtime?.providerOptions || {}
    };
  },

  /**
   * 标准化音色数据（兼容新旧格式）
   *
   * 自动检测新格式或转换旧格式。
   * @param {Object} rawVoice - 音色对象（新旧格式均可）
   * @returns {Object} StoredVoice
   */
  normalize(rawVoice) {
    if (!rawVoice) return null;

    if (rawVoice.identity && rawVoice.profile && rawVoice.runtime) {
      return rawVoice;
    }

    const now = new Date().toISOString();
    const runtime = rawVoice.runtime || {};
    const ttsConfig = rawVoice.ttsConfig || {};
    const voiceCodeMeta = rawVoice.voiceCodeMeta || {};

    const voiceId = pickFirst(
      runtime.voiceId, runtime.voice,
      ttsConfig.voiceId, ttsConfig.voiceName, ttsConfig.sourceId,
      rawVoice.sourceId
    );

    const ttsConfigProviderOptions = omit(ttsConfig, [
      'voiceId', 'voiceName', 'sourceId', 'model', 'sampleRate', 'cluster', 'voiceType'
    ]);

    const providerOptions = {
      ...ttsConfigProviderOptions,
      ...(runtime.providerOptions || {})
    };

    if (ttsConfig.samplingParams) {
      providerOptions.samplingParams = ttsConfig.samplingParams;
    }

    return {
      identity: {
        id: rawVoice.id,
        voiceCode: rawVoice.voiceCode || null,
        sourceId: rawVoice.sourceId,
        provider: rawVoice.provider,
        service: rawVoice.service
      },
      profile: {
        displayName: rawVoice.displayName,
        alias: rawVoice.name || rawVoice.displayName,
        gender: rawVoice.gender,
        languages: rawVoice.languages || ['zh-CN'],
        description: rawVoice.description || '',
        tags: rawVoice.tags || [],
        status: 'active',
        preview: rawVoice.preview || null
      },
      runtime: {
        voiceId,
        model: pickFirst(runtime.model, ttsConfig.model, 'default'),
        providerOptions,
        // 保留其他运行时字段
        sampleRate: pickFirst(runtime.sampleRate, ttsConfig.sampleRate),
        cluster: pickFirst(runtime.cluster, ttsConfig.cluster),
        voiceType: pickFirst(runtime.voiceType, ttsConfig.voiceType)
      },
      meta: {
        createdAt: now,
        updatedAt: now,
        dataSource: 'migration',
        version: 'v1',
        // 保留 voiceCodeMeta 作为兼容信息
        _legacyVoiceCodeMeta: Object.keys(voiceCodeMeta).length > 0 ? voiceCodeMeta : undefined
      }
    };
  },

  /**
   * 批量标准化音色数据
   * @param {Array} voices - 音色数组
   * @returns {Array} StoredVoice 数组
   */
  normalizeBatch(voices) {
    if (!Array.isArray(voices)) return [];
    return voices.map(v => this.normalize(v)).filter(Boolean);
  },

  /**
   * 生成 voiceCode
   * @param {string} providerKey - 服务商 key
   * @param {number} voiceNumber - 音色编号
   * @returns {string|null} voiceCode 或 null
   */
  generateVoiceCode(providerKey, voiceNumber) {
    try {
      return VoiceCodeGenerator.generate({ providerKey, voiceNumber });
    } catch (e) {
      console.warn(`[VoiceNormalizer] Failed to generate voiceCode: ${e.message}`);
      return null;
    }
  },

  /**
   * 检测是否为新格式
   * @param {Object} voice - 音色对象
   * @returns {boolean}
   */
  isNewFormat(voice) {
    return !!(voice && voice.identity && voice.profile && voice.runtime);
  },

  /**
   * 获取服务商真实 voiceId（兼容新旧格式）
   * @param {Object} voice - 音色对象（新格式或旧格式）
   * @returns {string|null}
   */
  extractVoiceId(voice) {
    if (!voice) return null;

    // 新格式
    if (voice.runtime?.voiceId) {
      return voice.runtime.voiceId;
    }

    // 旧格式
    return pickFirst(
      voice.runtime?.voice,
      voice.ttsConfig?.voiceId,
      voice.ttsConfig?.voiceName,
      voice.ttsConfig?.sourceId,
      voice.sourceId
    );
  }
};

// backward compat aliases
VoiceNormalizer.fromLegacy = VoiceNormalizer.normalize;
VoiceNormalizer.fromLegacyBatch = VoiceNormalizer.normalizeBatch;

module.exports = VoiceNormalizer;
