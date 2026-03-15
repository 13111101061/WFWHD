/**
 * ProviderCatalog - 服务商目录
 *
 * 维护 provider/service 的稳定元信息
 * 暴露 canonical key、displayName、aliases、capabilities
 *
 * Alias 管理规则：
 * - alias 只保留真实对外兼容所必需的入口
 * - 不扩散 _legacy 等内部遗留名
 * - canonical key 本身不需要作为 alias
 */

const providers = {
  // ==================== 阿里云 ====================
  aliyun_qwen_http: {
    provider: 'aliyun',
    service: 'qwen_http',
    displayName: '阿里云 Qwen HTTP',
    description: '阿里云通义千问语音合成 HTTP 接口',
    aliases: ['aliyun_qwen', 'qwen_http'],  // 对外兼容入口
    capabilities: {
      speed: { min: 0.5, max: 2.0, default: 1.0 },
      pitch: { min: 0.5, max: 1.5, default: 1.0 },
      formats: ['wav', 'mp3'],
      sampleRates: [8000, 16000, 24000],
      streaming: false,
      realtime: false
    },
    status: 'stable'
  },

  aliyun_cosyvoice: {
    provider: 'aliyun',
    service: 'cosyvoice',
    displayName: '阿里云 CosyVoice',
    description: '阿里云 CosyVoice 语音合成',
    aliases: ['cosyvoice'],  // 对外兼容入口
    capabilities: {
      speed: { min: 0.5, max: 2.0, default: 1.0 },
      pitch: { min: 0.5, max: 1.5, default: 1.0 },
      formats: ['wav', 'mp3'],
      sampleRates: [22050, 44100],
      streaming: true,
      realtime: true
    },
    status: 'stable'
  },

  // ==================== 腾讯云 ====================
  tencent_tts: {
    provider: 'tencent',
    service: 'tts',
    displayName: '腾讯云 TTS',
    description: '腾讯云语音合成',
    aliases: ['tencent'],  // 对外兼容入口
    capabilities: {
      speed: { min: -2, max: 2, default: 0 },
      volume: { min: 0, max: 10, default: 5 },
      formats: ['wav', 'mp3'],
      sampleRates: [8000, 16000],
      streaming: false,
      realtime: false
    },
    status: 'stable'
  },

  // ==================== 火山引擎 ====================
  volcengine_http: {
    provider: 'volcengine',
    service: 'volcengine_http',
    displayName: '火山引擎 HTTP',
    description: '火山引擎语音合成 HTTP 接口',
    aliases: ['volcengine'],  // 对外兼容入口（移除 _legacy）
    capabilities: {
      speed: { min: 0.5, max: 2.0, default: 1.0 },
      volume: { min: 0, max: 100, default: 50 },
      formats: ['wav', 'mp3'],
      sampleRates: [8000, 16000, 24000],
      streaming: false,
      realtime: false
    },
    status: 'stable'
  },

  // ==================== MiniMax ====================
  minimax_tts: {
    provider: 'minimax',
    service: 'minimax_tts',
    displayName: 'MiniMax TTS',
    description: 'MiniMax 语音合成',
    aliases: ['minimax'],  // 对外兼容入口
    capabilities: {
      speed: { min: 0.5, max: 2.0, default: 1.0 },
      formats: ['wav', 'mp3'],
      sampleRates: [16000, 24000, 32000],
      streaming: false,
      realtime: false
    },
    status: 'beta'
  },

  // ==================== MOSS ====================
  moss_tts: {
    provider: 'moss',
    service: 'tts',
    displayName: 'MOSS TTS',
    description: 'MOSS 语音合成服务',
    aliases: ['moss'],  // 对外兼容入口
    capabilities: {
      formats: ['wav', 'mp3'],
      sampleRates: [16000, 24000],
      streaming: false,
      realtime: false
    },
    status: 'beta'
  }
};

/**
 * 别名到 canonical key 的映射
 */
const aliasMap = {};
Object.entries(providers).forEach(([canonicalKey, config]) => {
  // canonical key 本身
  aliasMap[canonicalKey] = canonicalKey;

  // 所有别名
  if (config.aliases) {
    config.aliases.forEach(alias => {
      aliasMap[alias] = canonicalKey;
    });
  }
});

const ProviderCatalog = {
  /**
   * 获取服务商配置
   * @param {string} key - canonical key 或 alias
   * @returns {Object|null}
   */
  get(key) {
    const canonicalKey = aliasMap[key];
    return canonicalKey ? providers[canonicalKey] : null;
  },

  /**
   * 解析为 canonical key
   * @param {string} key - 任意有效的 key 或 alias
   * @returns {string|null}
   */
  resolveCanonicalKey(key) {
    return aliasMap[key] || null;
  },

  /**
   * 获取所有服务商列表
   * @returns {Object[]}
   */
  getAll() {
    return Object.entries(providers).map(([key, config]) => ({
      key,
      ...config
    }));
  },

  /**
   * 获取所有 canonical keys
   * @returns {string[]}
   */
  getAllCanonicalKeys() {
    return Object.keys(providers);
  },

  /**
   * 检查 key 是否有效
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return key in aliasMap;
  },

  /**
   * 获取服务商能力
   * @param {string} key
   * @returns {Object|null}
   */
  getCapabilities(key) {
    const config = this.get(key);
    return config?.capabilities || null;
  },

  /**
   * 按 provider 分组获取
   * @returns {Object}
   */
  getByProvider() {
    const result = {};
    Object.entries(providers).forEach(([key, config]) => {
      const { provider } = config;
      if (!result[provider]) {
        result[provider] = [];
      }
      result[provider].push({ key, ...config });
    });
    return result;
  },

  /**
   * 获取状态统计
   * @returns {Object}
   */
  getStats() {
    const stats = {
      total: Object.keys(providers).length,
      byStatus: {},
      byProvider: {}
    };

    Object.values(providers).forEach(config => {
      // 按状态统计
      const status = config.status || 'unknown';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

      // 按 provider 统计
      const { provider } = config;
      stats.byProvider[provider] = (stats.byProvider[provider] || 0) + 1;
    });

    return stats;
  }
};

module.exports = {
  ProviderCatalog,
  providers,
  aliasMap
};