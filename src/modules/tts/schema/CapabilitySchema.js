/**
 * CapabilitySchema - 能力模式定义
 *
 * 统一定义服务能力、模型能力、音色默认配置
 * 所有能力规则在此收口，不再散落在各处
 *
 * 数据迁移来源：
 * - ProviderCatalog.js 的 capabilities 字段
 * - ttsDefaults.js 的 byService 默认值
 * - 各 adapter 内部的参数支持逻辑
 *
 * 使用方式：
 * - CapabilityResolver 读取此配置
 * - ParameterResolutionService 使用合并后的默认值
 */

const CapabilitySchema = {

  // ==================== 平台级能力（全局） ====================
  platform: {
    defaultSampleRate: 24000,
    defaultFormat: 'wav',
    maxTextLength: 10000,
    supportedFormats: ['wav', 'mp3', 'pcm', 'flac'],
    supportedSampleRates: [8000, 16000, 22050, 24000, 32000, 44100]
  },

  // ==================== 服务能力定义 ====================
  // 每个 serviceKey 对应的能力配置
  services: {

    // ==================== 阿里云 Qwen HTTP ====================
    'aliyun_qwen_http': {
      displayName: '阿里云 Qwen HTTP',
      provider: 'aliyun',
      service: 'qwen_http',

      // 服务级能力
      capabilities: {
        streaming: false,
        realtime: false,
        emotion: false,
        style: false,
        speedAdjustable: false,   // Qwen 不支持语速调整
        pitchAdjustable: false,   // Qwen 不支持音调调整
        volumeAdjustable: false   // Qwen 不支持音量调整
      },

      // 服务级默认值
      defaults: {
        format: 'wav',
        sampleRate: 24000,
        model: 'qwen3-tts-instruct-flash-realtime'
      },

      // 服务级参数支持声明
      parameters: {
        speed: { supported: false, description: 'Qwen HTTP 不支持语速调整' },
        pitch: { supported: false, description: 'Qwen HTTP 不支持音调调整' },
        volume: { supported: false, description: 'Qwen HTTP 不支持音量调整' },
        format: {
          supported: true,
          type: 'enum',
          values: ['wav', 'mp3'],
          default: 'wav'
        },
        sampleRate: {
          supported: true,
          type: 'enum',
          values: [8000, 16000, 24000],
          default: 24000
        },
        model: {
          supported: true,
          type: 'string',
          default: 'qwen3-tts-instruct-flash-realtime'
        }
      },

      // 锁定参数（不允许用户覆盖）
      lockedParams: ['voice', 'model'],

      // 默认音色
      defaultVoiceId: 'aliyun-qwen_http-cherry',

      status: 'stable'
    },

    // ==================== 阿里云 CosyVoice ====================
    'aliyun_cosyvoice': {
      displayName: '阿里云 CosyVoice',
      provider: 'aliyun',
      service: 'cosyvoice',

      capabilities: {
        streaming: true,
        realtime: true,
        emotion: false,
        style: false,
        speedAdjustable: true,
        pitchAdjustable: true,
        volumeAdjustable: true
      },

      defaults: {
        format: 'wav',
        sampleRate: 22050,
        speed: 1.0,
        pitch: 1.0,
        volume: 50
      },

      parameters: {
        speed: {
          supported: true,
          type: 'number',
          range: { min: 0.5, max: 2.0 },
          default: 1.0
        },
        pitch: {
          supported: true,
          type: 'number',
          range: { min: 0.5, max: 1.5 },
          default: 1.0
        },
        volume: {
          supported: true,
          type: 'number',
          range: { min: 0, max: 100 },
          default: 50
        },
        format: {
          supported: true,
          type: 'enum',
          values: ['wav', 'mp3'],
          default: 'wav'
        },
        sampleRate: {
          supported: true,
          type: 'enum',
          values: [22050, 44100],
          default: 22050
        }
      },

      lockedParams: ['voice', 'model'],
      defaultVoiceId: null, // 待配置
      status: 'stable'
    },

    // ==================== 腾讯云 TTS ====================
    'tencent_tts': {
      displayName: '腾讯云 TTS',
      provider: 'tencent',
      service: 'tts',

      capabilities: {
        streaming: false,
        realtime: false,
        emotion: false,
        style: false,
        speedAdjustable: true,
        pitchAdjustable: false,
        volumeAdjustable: true
      },

      defaults: {
        format: 'wav',
        sampleRate: 16000,
        speed: 0,  // 腾讯云语速范围 -2 到 2
        volume: 5  // 腾讯云音量范围 0-10
      },

      parameters: {
        speed: {
          supported: true,
          type: 'number',
          range: { min: -2, max: 2 },
          default: 0,
          description: '腾讯云语速，-2到2'
        },
        volume: {
          supported: true,
          type: 'number',
          range: { min: 0, max: 10 },
          default: 5,
          description: '腾讯云音量，0-10'
        },
        format: {
          supported: true,
          type: 'enum',
          values: ['wav', 'mp3'],
          default: 'wav'
        },
        sampleRate: {
          supported: true,
          type: 'enum',
          values: [8000, 16000],
          default: 16000
        }
      },

      lockedParams: ['voice', 'model'],
      defaultVoiceId: null,
      status: 'stable'
    },

    // ==================== 火山引擎 HTTP ====================
    'volcengine_http': {
      displayName: '火山引擎 HTTP',
      provider: 'volcengine',
      service: 'volcengine_http',

      capabilities: {
        streaming: false,
        realtime: false,
        emotion: false,
        style: false,
        speedAdjustable: true,
        pitchAdjustable: false,
        volumeAdjustable: true
      },

      defaults: {
        format: 'wav',
        sampleRate: 24000,
        speed: 1.0,
        volume: 50
      },

      parameters: {
        speed: {
          supported: true,
          type: 'number',
          range: { min: 0.5, max: 2.0 },
          default: 1.0
        },
        volume: {
          supported: true,
          type: 'number',
          range: { min: 0, max: 100 },
          default: 50
        },
        format: {
          supported: true,
          type: 'enum',
          values: ['wav', 'mp3'],
          default: 'wav'
        },
        sampleRate: {
          supported: true,
          type: 'enum',
          values: [8000, 16000, 24000],
          default: 24000
        }
      },

      lockedParams: ['voice', 'model'],
      defaultVoiceId: null,
      status: 'stable'
    },

    // ==================== MiniMax TTS ====================
    'minimax_tts': {
      displayName: 'MiniMax TTS',
      provider: 'minimax',
      service: 'minimax_tts',

      capabilities: {
        streaming: false,
        realtime: false,
        emotion: true,            // MiniMax 支持情感
        style: false,
        speedAdjustable: true,
        pitchAdjustable: true,
        volumeAdjustable: true
      },

      defaults: {
        format: 'mp3',
        sampleRate: 32000,
        speed: 1.0,
        pitch: 0,
        volume: 1.0,
        model: 'speech-01-hd-preview'
      },

      parameters: {
        speed: {
          supported: true,
          type: 'number',
          range: { min: 0.1, max: 2.0 },
          default: 1.0
        },
        pitch: {
          supported: true,
          type: 'number',
          range: { min: -12, max: 12 },
          default: 0,
          description: '音调偏移，-12到+12半音'
        },
        volume: {
          supported: true,
          type: 'number',
          range: { min: 0.0, max: 1.0 },
          default: 1.0,
          description: 'MiniMax 音量，0.0-1.0'
        },
        emotion: {
          supported: true,
          type: 'enum',
          values: ['calm', 'happy', 'sad', 'angry', 'fearful', 'neutral'],
          default: 'neutral'
        },
        format: {
          supported: true,
          type: 'enum',
          values: ['wav', 'mp3'],
          default: 'mp3'
        },
        sampleRate: {
          supported: true,
          type: 'enum',
          values: [16000, 24000, 32000],
          default: 32000
        }
      },

      lockedParams: ['voice', 'model'],
      defaultVoiceId: null,
      status: 'beta'
    },

    // ==================== MOSS TTS ====================
    'moss_tts': {
      displayName: 'MOSS TTS',
      provider: 'moss',
      service: 'tts',

      capabilities: {
        streaming: false,
        realtime: false,
        emotion: false,
        style: false,
        speedAdjustable: false,   // MOSS 不支持传统语速调整
        pitchAdjustable: false,
        volumeAdjustable: false,
        samplingParams: true,     // MOSS 特有：采样参数
        expectedDuration: true    // MOSS 特有：期望时长控制
      },

      defaults: {
        format: 'wav',
        sampleRate: 24000,
        model: 'moss-tts',
        samplingParams: {
          temperature: 1.7,
          topP: 0.8,
          topK: 25,
          maxNewTokens: 20000
        }
      },

      parameters: {
        speed: { supported: false, description: 'MOSS 不支持语速调整，可用 expectedDurationSec 替代' },
        pitch: { supported: false, description: 'MOSS 不支持音调调整' },
        volume: { supported: false, description: 'MOSS 不支持音量调整' },
        expectedDurationSec: {
          supported: true,
          type: 'number',
          description: '期望音频时长（秒），用于控制语速'
        },
        samplingParams: {
          supported: true,
          type: 'object',
          properties: {
            temperature: {
              type: 'number',
              default: 1.7,
              range: { min: 0.1, max: 3.0 },
              description: '温度参数，控制随机性'
            },
            topP: {
              type: 'number',
              default: 0.8,
              range: { min: 0, max: 1.0 },
              description: 'Top-P 采样参数'
            },
            topK: {
              type: 'number',
              default: 25,
              range: { min: 1, max: 100 },
              description: 'Top-K 采样参数'
            },
            maxNewTokens: {
              type: 'number',
              default: 20000,
              description: '最大生成 token 数'
            }
          }
        },
        format: {
          supported: true,
          type: 'enum',
          values: ['wav', 'mp3'],
          default: 'wav'
        },
        sampleRate: {
          supported: true,
          type: 'enum',
          values: [16000, 24000],
          default: 24000
        }
      },

      lockedParams: ['voice', 'model'],
      defaultVoiceId: 'moss-tts-beijingnan',
      status: 'beta'
    }
  },

  // ==================== 模型能力定义 ====================
  models: {
    'qwen3-tts-instruct-flash-realtime': {
      displayName: 'Qwen3 TTS Instruct Flash Realtime',
      serviceKey: 'aliyun_qwen_http',
      capabilities: {
        highQuality: false,
        lowLatency: true
      },
      defaults: {},
      parameters: {}
    },
    'moss-tts': {
      displayName: 'MOSS TTS',
      serviceKey: 'moss_tts',
      capabilities: {
        highQuality: true,
        samplingControl: true
      },
      defaults: {
        samplingParams: {
          temperature: 1.7,
          topP: 0.8,
          topK: 25
        }
      },
      parameters: {}
    },
    'speech-01-hd-preview': {
      displayName: 'MiniMax Speech-01 HD Preview',
      serviceKey: 'minimax_tts',
      capabilities: {
        highQuality: true,
        emotionSupport: true
      },
      defaults: {},
      parameters: {}
    }
  }
};

// ==================== 辅助函数 ====================

/**
 * 获取服务能力配置
 * @param {string} serviceKey - 服务标识（如 'moss_tts'）
 * @returns {Object|null}
 */
function getServiceCapabilities(serviceKey) {
  return CapabilitySchema.services[serviceKey] || null;
}

/**
 * 获取模型能力配置
 * @param {string} modelKey - 模型标识（如 'moss-tts'）
 * @returns {Object|null}
 */
function getModelCapabilities(modelKey) {
  return CapabilitySchema.models[modelKey] || null;
}

/**
 * 获取平台默认值
 * @returns {Object}
 */
function getPlatformDefaults() {
  return {
    speed: 1.0,
    pitch: 1.0,
    volume: 50,
    format: CapabilitySchema.platform.defaultFormat,
    sampleRate: CapabilitySchema.platform.defaultSampleRate
  };
}

/**
 * 检查参数是否被服务支持
 * @param {string} serviceKey - 服务标识
 * @param {string} paramName - 参数名
 * @returns {boolean}
 */
function isParameterSupported(serviceKey, paramName) {
  const service = CapabilitySchema.services[serviceKey];
  if (!service || !service.parameters[paramName]) {
    return false;
  }
  return service.parameters[paramName].supported !== false;
}

/**
 * 获取服务的锁定参数列表
 * @param {string} serviceKey - 服务标识
 * @returns {string[]}
 */
function getLockedParamsForService(serviceKey) {
  const service = CapabilitySchema.services[serviceKey];
  return service?.lockedParams || ['voice', 'model'];
}

/**
 * 获取服务的默认值
 * @param {string} serviceKey - 服务标识
 * @returns {Object}
 */
function getServiceDefaults(serviceKey) {
  const service = CapabilitySchema.services[serviceKey];
  return service?.defaults || {};
}

/**
 * 获取服务的默认音色ID
 * @param {string} serviceKey - 服务标识
 * @returns {string|null}
 */
function getDefaultVoiceId(serviceKey) {
  const service = CapabilitySchema.services[serviceKey];
  return service?.defaultVoiceId || null;
}

/**
 * 获取参数的配置信息
 * @param {string} serviceKey - 服务标识
 * @param {string} paramName - 参数名
 * @returns {Object|null}
 */
function getParameterConfig(serviceKey, paramName) {
  const service = CapabilitySchema.services[serviceKey];
  if (!service) return null;
  return service.parameters[paramName] || null;
}

/**
 * 获取所有服务标识
 * @returns {string[]}
 */
function getAllServiceKeys() {
  return Object.keys(CapabilitySchema.services);
}

/**
 * 获取所有模型标识
 * @returns {string[]}
 */
function getAllModelKeys() {
  return Object.keys(CapabilitySchema.models);
}

/**
 * 根据模型获取对应的服务标识
 * @param {string} modelKey - 模型标识
 * @returns {string|null}
 */
function getServiceKeyByModel(modelKey) {
  const model = CapabilitySchema.models[modelKey];
  return model?.serviceKey || null;
}

module.exports = {
  CapabilitySchema,
  getServiceCapabilities,
  getModelCapabilities,
  getPlatformDefaults,
  isParameterSupported,
  getLockedParamsForService,
  getServiceDefaults,
  getDefaultVoiceId,
  getParameterConfig,
  getAllServiceKeys,
  getAllModelKeys,
  getServiceKeyByModel
};
