/**
 * SynthesisRequest - Value Object
 * 纯数据传输对象，无副作用，不可变
 * 用于封装TTS合成请求的所有参数
 *
 * 支持三种音色标识方式（兼容期内）：
 * - voiceCode: 15位数字编码（新标准，如 "001000300100001"）
 * - systemId: 旧系统ID（如 "moss-tts-ashui"）
 * - voice: 提供商音色名（旧方式，如 "ashui"）
 */
class SynthesisRequest {
  /**
   * @param {Object} params
   * @param {string} params.text - 要转换的文本
   * @param {string} [params.service] - 服务标识符 (如 "aliyun_cosyvoice")
   * @param {string} [params.voiceCode] - 15位音色编码（新标准）
   * @param {string} [params.systemId] - 系统音色ID（兼容）
   * @param {string} [params.provider] - 服务提供商 (如 "aliyun")
   * @param {string} [params.serviceType] - 服务类型 (如 "cosyvoice")
   * @param {Object} [params.options] - 合成选项
   */
  constructor({
    text,
    service,
    voiceCode,
    systemId,
    provider,
    serviceType,
    options = {}
  }) {
    // 不可变性：使用 Object.freeze
    this.text = text;
    this.service = service;
    this.voiceCode = voiceCode;
    this.systemId = systemId;
    this.provider = provider;
    this.serviceType = serviceType;
    this.options = Object.freeze({ ...options });

    // 元数据
    this.requestId = this._generateRequestId();
    this.timestamp = new Date().toISOString();

    Object.freeze(this);
  }

  /**
   * 从JSON对象创建请求
   * @param {Object} json - 原始JSON数据
   * @returns {SynthesisRequest}
   */
  static fromJSON(json) {
    // 支持字段别名（下划线转驼峰，兼容前端多种传参方式）
    const fieldAliasMap = {
      'voice_code': 'voiceCode',
      'voiceCode': 'voiceCode',
      'system_id': 'systemId',
      'systemId': 'systemId',
      'voice_id': 'voiceId',
      'voiceId': 'voiceId',
      'voice': 'voice'  // 保留，后续映射到 voiceId
    };

    // 提取标准化后的字段值（优先级：同名 > 下划线别名）
    const getFieldValue = (camelKey, snakeKey) => {
      return json[camelKey] !== undefined ? json[camelKey] :
             json[snakeKey] !== undefined ? json[snakeKey] : undefined;
    };

    const voiceCode = getFieldValue('voiceCode', 'voice_code');
    const systemId = getFieldValue('systemId', 'system_id');

    // 处理 voice/voiceId：voice 字段可能是音色名称或 ID，统一保留供后续解析
    let voiceId = getFieldValue('voiceId', 'voice_id');
    if (!voiceId && json.voice) {
      voiceId = json.voice;
    }

    const reservedKeys = new Set([
      'text', 'service',
      'voiceCode', 'voice_code',
      'systemId', 'system_id',
      'provider', 'serviceType',
      'options',
      'voice', 'voiceId', 'voice_id'
    ]);

    const topLevelOptions = Object.entries(json || {}).reduce((acc, [key, value]) => {
      if (!reservedKeys.has(key) && value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});

    // 如果有 voiceId，放入 options 供解析器使用
    if (voiceId) {
      topLevelOptions.voiceId = voiceId;
    }

    return new SynthesisRequest({
      text: json.text,
      service: json.service,
      voiceCode,
      systemId,
      provider: json.provider,
      serviceType: json.serviceType,
      // Backward compatible:
      // - allow top-level options (voice/speed/model/...)
      // - allow nested options object (preferred)
      options: {
        ...topLevelOptions,
        ...(json.options || {})
      }
    });
  }

  /**
   * 解析服务标识符
   * 支持: "tencent", "aliyun_cosyvoice", "aliyun_qwen_http"
   * @returns {{ provider: string, serviceType: string|null }}
   */
  parseServiceIdentifier() {
    if (this.provider && this.serviceType) {
      return { provider: this.provider, serviceType: this.serviceType };
    }

    if (this.service) {
      const parts = this.service.split('_');

      if (parts.length === 1) {
        return { provider: parts[0], serviceType: null };
      }

      if (parts.length === 2) {
        return { provider: parts[0], serviceType: parts[1] };
      }

      if (parts.length === 3) {
        return { provider: parts[0], serviceType: `${parts[1]}_${parts[2]}` };
      }
    }

    return { provider: null, serviceType: null };
  }

  /**
   * 获取完整的服务键
   * @returns {string}
   */
  getServiceKey() {
    const { provider, serviceType } = this.parseServiceIdentifier();
    return serviceType ? `${provider}_${serviceType}` : provider;
  }

  /**
   * 归一化选项参数
   * 支持旧版参数名映射
   */
  getNormalizedOptions() {
    const normalized = { ...this.options };

    // voice 参数别名归一化
    if (normalized.voiceType !== undefined && normalized.voice === undefined) {
      normalized.voice = normalized.voiceType;
      delete normalized.voiceType;
    }
    if (normalized.voice_id !== undefined && normalized.voice === undefined) {
      normalized.voice = normalized.voice_id;
      delete normalized.voice_id;
    }
    if (normalized.voice_type !== undefined && normalized.voice === undefined) {
      normalized.voice = normalized.voice_type;
      delete normalized.voice_type;
    }

    // format 参数别名归一化
    if (normalized.encoding !== undefined && normalized.format === undefined) {
      normalized.format = normalized.encoding;
      delete normalized.encoding;
    }

    return Object.freeze(normalized);
  }

  /**
   * 验证请求基本字段
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate() {
    const errors = [];

    if (!this.text) {
      errors.push('Text parameter is required');
    }

    if (!this.service && !this.voiceCode && !this.systemId && !this.provider) {
      errors.push('Either service, voiceCode, systemId, or provider parameter is required');
    }

    if (this.text && typeof this.text !== 'string') {
      errors.push('Text must be a string');
    }

    if (this.text && this.text.length > 10000) {
      errors.push('Text too long, maximum 10000 characters allowed');
    }

    // voiceCode 格式校验（如果提供）
    if (this.voiceCode) {
      const VoiceCodeGenerator = require('../config/VoiceCodeGenerator');
      if (!VoiceCodeGenerator.isValid(this.voiceCode)) {
        errors.push(`Invalid voiceCode format: ${this.voiceCode} (must be 15-digit number with valid Luhn checksum)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 创建带有provider/serviceType解析后的新请求
   * @param {Object} voice - 音色配置
   * @returns {SynthesisRequest}
   */
  withResolvedProvider(voice) {
    return new SynthesisRequest({
      text: this.text,
      service: this.service,
      voiceCode: this.voiceCode || voice.voiceCode,
      systemId: this.systemId,
      provider: voice.provider,
      serviceType: voice.service,
      options: {
        ...this.options,
        voice: this.options.voice || voice.sourceId
      }
    });
  }

  /**
   * 序列化为JSON
   */
  toJSON() {
    return {
      text: this.text,
      service: this.service,
      voiceCode: this.voiceCode,
      systemId: this.systemId,
      provider: this.provider,
      serviceType: this.serviceType,
      options: { ...this.options },
      requestId: this.requestId,
      timestamp: this.timestamp
    };
  }

  _generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = SynthesisRequest;
