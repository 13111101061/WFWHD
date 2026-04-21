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
 * 旧数据读取 -> VoiceNormalizer.fromLegacy() -> StoredVoice
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
   * 旧格式兼容转换
   * 自动检测新格式或转换旧格式
   *
   * @param {Object} legacy - 旧格式音色对象
   * @returns {Object} StoredVoice
   *
   * 旧格式示例：
   * {
   *   id: "moss-tts-ashui",
   *   provider: "moss",
   *   service: "tts",
   *   sourceId: "ashui",
   *   displayName: "阿树",
   *   name: "阿树",
   *   gender: "female",
   *   languages: ["zh-CN"],
   *   description: "...",
   *   tags: ["治愈"],
   *   runtime: { voiceId: "...", model: "...", providerOptions: {} },
   *   ttsConfig: { sourceId: "...", model: "...", ... }
   * }
   */
  fromLegacy(legacy) {
    if (!legacy) return null;

    // 检测是否已经是新格式
    if (legacy.identity && legacy.profile && legacy.runtime) {
      return legacy;
    }

    // 旧格式转换
    const now = new Date().toISOString();
    const runtime = legacy.runtime || {};
    const ttsConfig = legacy.ttsConfig || {};
    const voiceCodeMeta = legacy.voiceCodeMeta || {};

    // 从 ttsConfig/runtime 中提取 voiceId
    // 优先级: runtime.voiceId > runtime.voice > ttsConfig.voiceId > ttsConfig.voiceName > ttsConfig.sourceId
    const voiceId = pickFirst(
      runtime.voiceId,
      runtime.voice,
      ttsConfig.voiceId,
      ttsConfig.voiceName,
      ttsConfig.sourceId,
      legacy.sourceId  // 最后备选
    );

    // 从 ttsConfig 中提取 providerOptions（排除已知字段）
    const ttsConfigProviderOptions = omit(ttsConfig, [
      'voiceId',
      'voiceName',
      'sourceId',
      'model',
      'sampleRate',
      'cluster',
      'voiceType'
    ]);

    // 合并 providerOptions
    const providerOptions = {
      ...ttsConfigProviderOptions,
      ...(runtime.providerOptions || {})
    };

    // 如果 ttsConfig 有其他字段（如 samplingParams），也合并进去
    if (ttsConfig.samplingParams) {
      providerOptions.samplingParams = ttsConfig.samplingParams;
    }

    return {
      identity: {
        id: legacy.id,
        voiceCode: legacy.voiceCode || null,
        sourceId: legacy.sourceId,
        provider: legacy.provider,
        service: legacy.service
      },
      profile: {
        displayName: legacy.displayName,
        alias: legacy.name || legacy.displayName,
        gender: legacy.gender,
        languages: legacy.languages || ['zh-CN'],
        description: legacy.description || '',
        tags: legacy.tags || [],
        status: 'active',
        preview: legacy.preview || null
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
   * 批量转换旧格式
   * @param {Array} legacyVoices - 旧格式音色数组
   * @returns {Array} StoredVoice 数组
   */
  fromLegacyBatch(legacyVoices) {
    if (!Array.isArray(legacyVoices)) return [];
    return legacyVoices.map(v => this.fromLegacy(v)).filter(Boolean);
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

module.exports = VoiceNormalizer;
