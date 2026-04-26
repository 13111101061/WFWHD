/**
 * PlatformParameterDictionary - 平台标准参数字典
 *
 * 这是平台内部的唯一参数名称标准，所有层都按这套名字走：
 * - HTTP 接口层：接收这些参数
 * - VoiceResolver：输出这些参数名
 * - ParameterResolutionService：合并这些参数
 * - ParameterMapper：从这些参数映射到服务商参数
 *
 * 参数优先级（从低到高）：
 * 1. 平台默认值 (source: 'platform')
 * 2. 服务默认值 (source: 'service')
 * 3. 模型默认值 (source: 'model')
 * 4. 音色默认值 (source: 'voice')
 * 5. 用户输入
 * 6. 锁定参数回写 (locked: true)
 */

const PlatformParameterDictionary = {
  // ==================== 锁定参数（不允许用户覆盖）====================

  /**
   * 服务商真实音色ID
   * 来源：VoiceResolver 解析
   * 锁定原因：用户传入的 voice 可能是别名或 systemId，不能直接使用
   */
  voice: {
    name: '音色',
    type: 'string',
    description: '服务商真实音色ID',
    locked: true,
    source: 'voiceResolver',
    required: true
  },

  /**
   * 模型标识
   * 来源：VoiceResolver 解析或用户指定
   * 锁定原因：模型与音色强绑定，不一致应报错
   */
  model: {
    name: '模型',
    type: 'string',
    description: '模型标识（如 moss-tts, qwen3-tts-instruct-flash-realtime）',
    locked: true,
    source: 'capabilityResolver',
    required: false
  },

  // ==================== 基础音频参数（平台级）====================

  /**
   * 语速
   * 标准范围 0.5-2.0，1.0 为正常速度
   * 注意：部分服务不支持语速调整（如 MOSS, Qwen）
   */
  speed: {
    name: '语速',
    type: 'number',
    standardRange: { min: 0.5, max: 2.0 },
    default: 1.0,
    description: '语速调整，1.0为正常速度',
    source: 'platform'
  },

  /**
   * 音调
   * 标准范围 0.5-1.5，1.0 为正常音调
   * 注意：部分服务不支持音调调整
   */
  pitch: {
    name: '音调',
    type: 'number',
    standardRange: { min: 0.5, max: 1.5 },
    default: 1.0,
    description: '音调调整，1.0为正常音调',
    source: 'platform'
  },

  /**
   * 音量
   * 标准范围 0-100
   * 注意：各服务商的音量范围可能不同，ParameterMapper 负责转换
   */
  volume: {
    name: '音量',
    type: 'number',
    standardRange: { min: 0, max: 100 },
    default: 50,
    description: '音量 0-100范围',
    source: 'platform'
  },

  /**
   * 音频格式
   * 标准值：wav, mp3, pcm, flac
   */
  format: {
    name: '音频格式',
    type: 'enum',
    values: ['wav', 'mp3', 'pcm', 'flac'],
    default: 'wav',
    description: '输出音频格式',
    source: 'platform'
  },

  /**
   * 采样率
   * 标准值：8000, 16000, 22050, 24000, 32000, 44100
   */
  sampleRate: {
    name: '采样率',
    type: 'enum',
    values: [8000, 16000, 22050, 24000, 32000, 44100],
    default: 24000,
    description: '音频采样率（Hz）',
    source: 'platform'
  },

  // ==================== 高级参数（模型级）====================

  /**
   * 情感
   * 来源：模型能力
   * 注意：仅部分模型支持（如 MiniMax）
   */
  emotion: {
    name: '情感',
    type: 'enum',
    values: ['calm', 'happy', 'sad', 'angry', 'fearful', 'neutral'],
    description: '语音情感表达',
    source: 'model'
  },

  /**
   * 风格
   * 来源：模型能力
   */
  style: {
    name: '风格',
    type: 'string',
    description: '语音风格（如 亲切、专业、活泼）',
    source: 'model'
  },

  /**
   * 风格强度
   * 来源：模型能力
   */
  styleStrength: {
    name: '风格强度',
    type: 'number',
    standardRange: { min: 0, max: 1.0 },
    default: 0.5,
    description: '风格强度 0-1范围',
    source: 'model'
  },

  /**
   * 期望时长（秒）
   * 来源：模型能力（MOSS 特有）
   */
  expectedDurationSec: {
    name: '期望时长',
    type: 'number',
    description: '期望音频时长（秒），用于控制语速',
    source: 'model'
  },

  // ==================== 采样参数（模型级，MOSS特有）====================

  /**
   * 采样参数
   * 来源：模型能力
   * MOSS-TTS 特有的高级参数
   */
  samplingParams: {
    name: '采样参数',
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
    },
    description: '高级采样参数，用于控制生成质量',
    source: 'model'
  },

  // ==================== 扩展参数 ====================

  /**
   * 时长提示（秒）
   */
  durationHint: {
    name: '时长提示',
    type: 'number',
    description: '时长提示（秒），非强制控制',
    source: 'platform'
  },

  /**
   * 服务商扩展参数
   * 用于透传服务商特有参数
   */
  providerOptions: {
    name: '服务商扩展参数',
    type: 'object',
    description: '服务商特定扩展参数，直接透传给服务商',
    source: 'voice'
  }
};

// ==================== 辅助函数 ====================

function getParameterDefinition(paramName) {
  return PlatformParameterDictionary[paramName] || null;
}

function getPlatformParameterNames() {
  return Object.keys(PlatformParameterDictionary);
}

function getLockedParameters() {
  return Object.entries(PlatformParameterDictionary)
    .filter(([_, config]) => config.locked)
    .map(([name]) => name);
}

function getPlatformDefaults() {
  const defaults = {};
  for (const [name, config] of Object.entries(PlatformParameterDictionary)) {
    if (config.default !== undefined && !config.locked) {
      defaults[name] = config.default;
    }
  }
  return defaults;
}

function getParameterRange(paramName) {
  const param = PlatformParameterDictionary[paramName];
  if (!param) return null;
  return param.standardRange || param.range || null;
}

function isValidParameter(paramName) {
  return paramName in PlatformParameterDictionary;
}

function validateParameterValue(paramName, value) {
  const param = PlatformParameterDictionary[paramName];
  if (!param) {
    return { valid: false, error: `Unknown parameter: ${paramName}` };
  }

  if (value === undefined || value === null) {
    return { valid: true };
  }

  if (param.type === 'number' && typeof value !== 'number') {
    return { valid: false, error: `${paramName} must be a number` };
  }
  if (param.type === 'string' && typeof value !== 'string') {
    return { valid: false, error: `${paramName} must be a string` };
  }
  if (param.type === 'object' && typeof value !== 'object') {
    return { valid: false, error: `${paramName} must be an object` };
  }

  const range = param.standardRange || param.range;
  if (range && typeof value === 'number') {
    if (value < range.min || value > range.max) {
      return {
        valid: false,
        error: `${paramName} must be between ${range.min} and ${range.max}, got ${value}`
      };
    }
  }

  if (param.type === 'enum' && param.values) {
    if (!param.values.includes(value)) {
      return {
        valid: false,
        error: `${paramName} must be one of [${param.values.join(', ')}], got ${value}`
      };
    }
  }

  return { valid: true };
}

module.exports = {
  PlatformParameterDictionary,
  getParameterDefinition,
  getPlatformParameterNames,
  getLockedParameters,
  getPlatformDefaults,
  getParameterRange,
  isValidParameter,
  validateParameterValue
};
