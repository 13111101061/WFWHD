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
   */
  byService: {
    // 阿里云 Qwen HTTP
    aliyun_qwen_http: {
      defaultVoiceId: 'aliyun-qwen_http-cherry',
      sampleRate: 24000,
      model: 'qwen3-tts-flash'  // 实际音色使用的模型
    },

    // 阿里云 CosyVoice（当前无音色数据，待补充）
    aliyun_cosyvoice: {
      // defaultVoiceId: 待音色数据导入后配置
      sampleRate: 22050,
      model: 'cosyvoice-v2'
    },

    // 腾讯云
    tencent_tts: {
      defaultVoiceId: 'tencent-tts-qinqin',  // 实际存在的音色
      sampleRate: 16000
    },

    // 火山引擎 HTTP
    volcengine_http: {
      defaultVoiceId: 'volcengine-volcengine_http-bv001_streaming',
      sampleRate: 24000,
      cluster: 'volcano_tts'
    },

    // MiniMax
    minimax_tts: {
      defaultVoiceId: 'minimax-minimax_tts-female-1',
      sampleRate: 32000,
      model: 'speech-01-hd-preview'
    },

    // MOSS
    moss_tts: {
      defaultVoiceId: 'moss-tts-ashui',
      sampleRate: 24000
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