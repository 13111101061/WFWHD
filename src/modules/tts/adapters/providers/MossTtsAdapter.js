/**
 * MossTtsAdapter - MOSS-TTS 服务商适配器
 *
 * 实现与 MOSS-TTS API 的对接
 * API 文档: https://studio.mosi.cn/api/v1/audio/speech
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

    // 获取凭证
    const creds = this._getCredentials();
    const serviceConfig = this._getServiceConfig();

    this.apiKey = config.apiKey || creds?.apiKey;
    // 更新为正确的 API 端点
    this.endpoint = config.endpoint || serviceConfig?.endpoint || 'https://studio.mosi.cn/api/v1/audio/speech';
  }

  /**
   * 执行TTS合成
   * @param {string} text - 要合成的文本
   * @param {Object} options - 合成选项
   * @returns {Promise<{audio?: Buffer, audioUrl?: string, format: string}>}
   */
  async synthesize(text, options = {}) {
    this.validateText(text);
    const params = this.validateOptions(options);

    // 检查凭证
    if (!this.apiKey) {
      throw this._error('MISSING_API_KEY', 'MOSS-TTS API Key 未配置');
    }

    return this._retry(async () => {
      const result = await this._callApi(text, params);

      // 解码 Base64 音频数据
      const audio = Buffer.from(result.audio_data, 'base64');

      return {
        audio,
        format: 'wav',
        provider: this.provider,
        serviceType: this.serviceType,
        duration: result.duration_s,
        usage: result.usage
      };
    });
  }

  /**
   * 调用 MOSS-TTS API
   * @param {string} text - 文本
   * @param {Object} params - 参数
   * @returns {Promise<Object>}
   */
  async _callApi(text, params) {
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };

    // 构建请求体
    const body = {
      model: 'moss-tts',
      text,
      voice_id: params.voice || params.voiceId || '2001257729754140672'
    };

    // 添加期望时长（如果指定）
    if (params.expectedDurationSec || params.expected_duration_sec) {
      body.expected_duration_sec = params.expectedDurationSec || params.expected_duration_sec;
    }

    // 添加采样参数
    if (params.samplingParams || params.sampling_params) {
      body.sampling_params = params.samplingParams || params.sampling_params;
    } else {
      // 默认采样参数（中文推荐配置）
      body.sampling_params = {
        max_new_tokens: 512,
        temperature: params.temperature || 1.7,
        top_p: params.topP || params.top_p || 0.8,
        top_k: params.topK || params.top_k || 25
      };
    }

    // 是否返回性能指标
    if (params.metaInfo !== undefined) {
      body.meta_info = params.metaInfo;
    }

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
   * @param {Response} response
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
        errorCode = `MOSS_${code}`;
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
   * 验证选项参数
   * @param {Object} options
   * @returns {Object}
   */
  validateOptions(options) {
    const base = super.validateOptions(options);

    return {
      ...base,
      // MOSS-TTS 特有参数
      voiceId: options.voiceId || options.voice_id,
      expectedDurationSec: options.expectedDurationSec || options.expected_duration_sec,
      samplingParams: options.samplingParams || options.sampling_params,
      temperature: options.temperature,
      topP: options.topP || options.top_p,
      topK: options.topK || options.top_k,
      metaInfo: options.metaInfo || options.meta_info
    };
  }

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