/**
 * TTS 默认值配置
 *
 * @deprecated 此文件已废弃，请使用 CapabilitySchema
 *
 * 能力定义和默认值已迁移到：
 * - src/modules/tts/schema/CapabilitySchema.js
 * - src/modules/tts/application/CapabilityResolver.js
 *
 * 迁移说明：
 * - common 默认值 → CapabilitySchema.platform
 * - byService 默认值 → CapabilitySchema.services[].defaults
 * - getDefaults() → CapabilitySchema.getServiceDefaults()
 * - getDefaultVoiceId() → CapabilitySchema.getDefaultVoiceId()
 */

const { CapabilitySchema, getServiceDefaults, getDefaultVoiceId } = require('../schema/CapabilitySchema');

/**
 * @deprecated 请使用 CapabilitySchema.platform
 */
const common = {
  speed: 1.0,
  pitch: 1.0,
  volume: 50,
  format: 'wav'
};

/**
 * @deprecated 请使用 CapabilitySchema.services
 */
const byService = {
  aliyun_qwen_http: {
    defaultVoiceId: 'aliyun-qwen_http-cherry',
    sampleRate: 24000,
    model: 'qwen3-tts-instruct-flash-realtime'
  },
  moss_tts: {
    defaultVoiceId: 'moss-tts-beijingnan',
    sampleRate: 24000,
    model: 'moss-tts'
  }
};

module.exports = {
  /**
   * 默认服务
   */
  defaultService: 'aliyun_qwen_http',

  /**
   * @deprecated 请使用 CapabilitySchema.platform
   */
  common,

  /**
   * @deprecated 请使用 CapabilitySchema.services
   */
  byService,

  /**
   * 文本限制
   */
  textLimits: {
    minLength: 1,
    maxLength: CapabilitySchema.platform.maxTextLength
  },

  /**
   * 获取服务的默认值
   * @deprecated 请使用 CapabilitySchema.getServiceDefaults(serviceKey)
   * @param {string} serviceKey - 服务标识
   * @returns {Object} 合并后的默认值
   */
  getDefaults(serviceKey) {
    return getServiceDefaults(serviceKey);
  },

  /**
   * 获取默认音色ID
   * @deprecated 请使用 CapabilitySchema.getDefaultVoiceId(serviceKey)
   * @param {string} serviceKey - 服务标识
   * @returns {string|null}
   */
  getDefaultVoiceId(serviceKey) {
    return getDefaultVoiceId(serviceKey);
  }
};
