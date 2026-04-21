/**
 * VoiceMapper - 音色数据映射工具
 *
 * 职责：
 * - 专为 adapter/runtime 层提供映射
 * - 展示层 DTO 请使用 VoiceCatalog.toDisplayDto() / toDetailDto()
 *
 * 注意：
 * - toAdapterFormat() 用于 BaseTtsAdapter.getAvailableVoices()
 * - 展示相关的映射已移至 VoiceCatalog
 */

const VoiceMapper = {
  /**
   * 映射为适配器格式（用于 BaseTtsAdapter）
   * 包含运行时完整信息，供 provider 调用使用
   */
  toAdapterFormat(voice) {
    if (!voice) return null;

    const identity = voice.identity || {};
    const profile = voice.profile || {};
    const runtime = voice.runtime || {};

    return {
      // 基础标识
      id: identity.id || voice.id,
      systemId: identity.id || voice.id,
      sourceId: identity.sourceId || voice.sourceId,
      provider: identity.provider || voice.provider,
      service: identity.service || voice.service,
      voiceCode: identity.voiceCode || voice.voiceCode,

      // 展示信息（适配器可能需要用于日志）
      displayName: profile.displayName || voice.displayName,
      name: profile.displayName || voice.displayName || voice.name,
      gender: profile.gender || voice.gender,
      languages: profile.languages || voice.languages || ['zh-CN'],
      language: (profile.languages || voice.languages || ['zh-CN'])[0],

      // 运行时信息（核心）
      voiceId: runtime.voiceId || null,
      model: runtime.model || null,
      providerOptions: runtime.providerOptions || {},

      // 兼容层：保留 ttsConfig（向后兼容旧 adapter）
      ttsConfig: voice._compat?.ttsConfig || voice.ttsConfig || {},

      // 标签和描述
      tags: profile.tags || voice.tags || [],
      description: profile.description || voice.description
    };
  },

  /**
   * 提取运行时配置（精简版，只含调用必需字段）
   * @param {Object} voice - StoredVoice
   * @returns {Object} { provider, service, voiceId, model, providerOptions }
   */
  toRuntimeConfig(voice) {
    if (!voice) return null;

    const identity = voice.identity || {};
    const runtime = voice.runtime || {};

    return {
      provider: identity.provider || voice.provider,
      service: identity.service || voice.service,
      voiceId: runtime.voiceId || null,
      model: runtime.model || null,
      providerOptions: runtime.providerOptions || {}
    };
  },

  /**
   * 批量映射为适配器格式
   */
  mapAllToAdapter(voices) {
    if (!Array.isArray(voices)) return [];
    return voices.map(v => this.toAdapterFormat(v)).filter(Boolean);
  }
};

module.exports = VoiceMapper;
