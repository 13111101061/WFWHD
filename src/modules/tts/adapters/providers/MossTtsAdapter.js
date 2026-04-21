/**
 * MossTtsAdapter - MOSS-TTS 服务商适配器
 *
 * API 文档: https://studio.mosi.cn/api/v1/audio/speech
 *
 * 支持凭证池化：
 * - 请求时选择最佳账号
 * - 报告成功/失败用于健康追踪
 *
 * [改造后] 入参约定：
 * - 接收已映射的服务商参数（由 ParameterMapper 输出）
 * - 不再处理平台标准参数到服务商参数的转换
 * - 所有默认值由 CapabilitySchema 提供，通过 ParameterResolutionService 合并
 * - 期望参数格式：
 *   {
 *     voice_id: '2001257729754140672',
 *     expected_duration_sec: 10,
 *     sampling_params: { temperature: 1.7, top_p: 0.8, top_k: 25 }
 *   }
 *
 * [修复] 移除硬编码兜底，fail fast
 * - voice_id 和 sampling_params 必须由上游提供
 * - 缺少必要参数时直接报错，而不是静默使用默认值
 */

const BaseTtsAdapter = require('./BaseTtsAdapter');

// 错误码映射
const ERROR_CODES = {
  4000: '请求格式无效',
  4002: '参考音频格式无效',
  4010: '未授权，请检查请求头',
  4011: 'API Key 无效',
  4020: '余额不足',
  4029: '请求频率超限',
  5000: '服务内部错误',
  5002: '音色不可用',
  5004: '请求超时'
};

class MossTtsAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({
      provider: 'moss',
      serviceType: 'tts',
      ...config
    });

    // 初始化时获取凭证（向后兼容）
    const creds = this._getCredentials();
    const serviceConfig = this._getServiceConfig();

    this.apiKey = config.apiKey || creds?.apiKey;
    this.endpoint = config.endpoint || serviceConfig?.endpoint || 'https://studio.mosi.cn/api/v1/audio/speech';
  }

  /**
   * 执行TTS合成
   *
   * [改造后] 接收已映射的服务商参数
   * @param {string} text - 要合成的文本
   * @param {Object} providerParams - 已映射的服务商参数
   * @param {string} providerParams.voice_id - 服务商音色ID
   * @param {number} [providerParams.expected_duration_sec] - 期望时长（秒）
   * @param {Object} [providerParams.sampling_params] - 采样参数
   */
  async synthesize(text, providerParams = {}) {
    this.validateText(text);

    // 请求时获取凭证（支持池化选择和健康追踪）
    const creds = this._getCredentials();
    const apiKey = creds?.apiKey || this.apiKey;

    if (!apiKey) {
      throw this._error('CONFIG_ERROR', 'MOSS-TTS API Key 未配置');
    }

    try {
      const result = await this._callApi(text, providerParams, apiKey);

      // 解码 Base64 音频数据
      const audio = Buffer.from(result.audio_data, 'base64');

      // 报告成功
      this._reportSuccess();

      return {
        audio,
        format: 'wav',
        provider: this.provider,
        serviceType: this.serviceType,
        duration: result.duration_s,
        usage: result.usage
      };
    } catch (error) {
      // 报告失败
      this._reportFailure(error);
      throw error;
    }
  }

  /**
   * 调用 MOSS-TTS API
   *
   * [改造后] 直接使用已映射的服务商参数
   * [修复] 移除硬编码兜底，fail fast
   */
  async _callApi(text, providerParams, apiKey) {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    // [修复] voice_id 必须由调用方传入，否则直接报错
    const voiceId = providerParams.voice_id || providerParams.voice;
    if (!voiceId) {
      const error = new Error('voice_id is required for MOSS-TTS. Check parameter mapping chain.');
      error.code = 'MISSING_VOICE_ID';
      throw error;
    }

    const body = {
      model: providerParams.model || 'moss-tts',
      text,
      voice_id: voiceId
    };

    // 添加期望时长（如果指定）
    if (providerParams.expected_duration_sec) {
      body.expected_duration_sec = providerParams.expected_duration_sec;
    }

    // [修复] sampling_params 必须由调用方传入，否则直接报错
    if (providerParams.sampling_params) {
      body.sampling_params = providerParams.sampling_params;
    } else {
      const error = new Error('sampling_params is required for MOSS-TTS. Check parameter mapping chain.');
      error.code = 'MISSING_SAMPLING_PARAMS';
      throw error;
    }

    // 是否返回性能指标（默认true）
    body.meta_info = providerParams.meta_info !== undefined ? providerParams.meta_info : true;

    console.log('[MOSS-TTS] Request body:', JSON.stringify(body, null, 2));

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    // 处理错误响应
    if (!response.ok) {
      await this._handleError(response);
    }

    const result = await response.json();

    // 验证返回数据
    if (!result.audio_data) {
      throw this._error('PARSE_ERROR', '响应中未找到音频数据', { response: result });
    }

    return result;
  }

  /**
   * 处理 API 错误
   */
  async _handleError(response) {
    let errorMessage = `HTTP ${response.status}`;
    let errorCode = 'API_ERROR';

    try {
      const errorData = await response.json();
      const code = errorData.code || errorData.error?.code;
      const message = errorData.message || errorData.error?.message;

      if (code && ERROR_CODES[code]) {
        errorMessage = `MOSS-TTS 错误 [${code}]: ${ERROR_CODES[code]}`;
        // 将MOSS错误码映射为标准错误码
        if (code === 4000) {
          errorCode = 'VALIDATION_ERROR'; // 请求格式无效
        } else if (code === 4002) {
          errorCode = 'VALIDATION_ERROR'; // 参考音频格式无效
        } else if (code === 4010 || code === 4011) {
          errorCode = 'CONFIG_ERROR'; // 未授权/API Key无效
        } else if (code === 4020) {
          errorCode = 'API_ERROR'; // 余额不足
        } else if (code === 4029) {
          errorCode = 'API_ERROR'; // 请求频率超限
        } else if (code === 5000) {
          errorCode = 'PROVIDER_ERROR'; // 服务内部错误
        } else if (code === 5002) {
          errorCode = 'PROVIDER_ERROR'; // 音色不可用
        } else if (code === 5004) {
          errorCode = 'TIMEOUT_ERROR'; // 请求超时
        } else {
          errorCode = 'API_ERROR'; // 默认
        }
      } else if (message) {
        errorMessage = `MOSS-TTS 错误: ${message}`;
      }
    } catch (e) {
      // JSON 解析失败，使用 HTTP 状态文本
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }

    throw this._error(errorCode, errorMessage);
  }

  /**
   * [已移除] validateOptions 自定义实现
   *
   * 参数格式转换已迁移到 ParameterMapper
   * Adapter 现在直接接收已映射的服务商参数
   */

  /**
   * 备用音色列表
   */
  getFallbackVoices() {
    return [
      {
        id: '2001257729754140672',
        name: '阿树',
        gender: 'female',
        language: 'zh-CN',
        description: '冬天清晨的灰白天空，风很冷，但阳光迟早会出来。',
        tags: ['松弛', '耐听']
      }
    ];
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      ...super.getStatus(),
      endpoint: this.endpoint,
      hasApiKey: !!this.apiKey
    };
  }
}

module.exports = MossTtsAdapter;