/**
 * TTS 默认值配置
 *
 * 集中管理所有 TTS 相关默认值
 * route 不允许再写默认值，resolver 统一从这里取
 */

module.exports = {
  /**
   * 默认服务
   */
  defaultService: 'aliyun_qwen_http',

  /**
   * 通用默认值（适用于所有服务）
   */
  common: {
    speed: 1.0,
    pitch: 1.0,
    volume: 50,
    format: 'wav'
  },

  /**
   * 按服务区分的默认值
   *
   * 注意：defaultVoiceId 必须与 voices/dist/voices.json 中的实际音色 ID 一致
   * model 必须与音色 ttsConfig.model 一致
   *
   * 当前实际启用的音色库（根据 voices/dist/voices.json）：
   * - aliyun: 49个音色 (qwen_http)
   * - moss: 9个音色 (moss_tts)
   * - minimax/tencent/volcengine: 0个音色（已禁用）
   */
  byService: {
    // 阿里云 Qwen HTTP - 实际存在的音色
    aliyun_qwen_http: {
      defaultVoiceId: 'aliyun-qwen_http-cherry',
      sampleRate: 24000,
      model: 'qwen3-tts-flash'
    },

    // 阿里云 CosyVoice - 待音色数据导入后配置
    // aliyun_cosyvoice: {
    //   defaultVoiceId: null,
    //   sampleRate: 22050,
    //   model: 'cosyvoice-v2'
    // },

    // 腾讯云 - 当前无音色数据（voices.json 中 count: 0, enabled: false）
    // tencent_tts: {
    //   defaultVoiceId: null,
    //   sampleRate: 16000
    // },

    // 火山引擎 HTTP - 当前无音色数据（voices.json 中 count: 0, enabled: false）
    // volcengine_http: {
    //   defaultVoiceId: null,
    //   sampleRate: 24000,
    //   cluster: 'volcano_tts'
    // },

    // MiniMax - 当前无音色数据（voices.json 中 count: 0, enabled: false）
    // minimax_tts: {
    //   defaultVoiceId: null,
    //   sampleRate: 32000,
    //   model: 'speech-01-hd-preview'
    // },

    // MOSS TTS - 实际存在的音色（9个）
    moss_tts: {
      defaultVoiceId: 'moss-tts-beijingnan',  // 改为实际存在的音色ID
      sampleRate: 24000,
      model: 'moss-tts'
    }
  },

  /**
   * 文本限制
   */
  textLimits: {
    minLength: 1,
    maxLength: 10000
  },

  /**
   * 获取服务的默认值
   * @param {string} serviceKey - 服务标识
   * @returns {Object} 合并后的默认值
   */
  getDefaults(serviceKey) {
    const serviceDefaults = this.byService[serviceKey] || {};
    return {
      ...this.common,
      ...serviceDefaults
    };
  },

  /**
   * 获取默认音色ID
   * @param {string} serviceKey - 服务标识
   * @returns {string|null}
   */
  getDefaultVoiceId(serviceKey) {
    const serviceDefaults = this.byService[serviceKey];
    return serviceDefaults?.defaultVoiceId || null;
  }
};