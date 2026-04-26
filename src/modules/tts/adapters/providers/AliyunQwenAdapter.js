/**
 * AliyunQwenAdapter - 阿里云 Qwen TTS 适配器（HTTP）
 *
 * 基于阿里云百炼平台 Qwen TTS 官方 API:
 *   POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
 *
 * 支持模型:
 *   - qwen3-tts-instruct-flash  (默认)
 *   - qwen3-tts-flash
 *   - qwen-tts 系列
 *
 * 注意：本适配器仅负责基础语音合成（非流式 URL 模式），
 * 声音复刻、声音设计等请走独立服务，不在此处理。
 */

const BaseTtsAdapter = require('./BaseTtsAdapter');

class AliyunQwenAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({
      provider: 'aliyun',
      serviceType: 'qwen_http',
      ...config
    });

    const creds = this._getCredentials();
    const serviceConfig = this._getServiceConfig();

    this.apiKey = config.apiKey || creds?.apiKey;
    this.endpoint = config.endpoint
      || serviceConfig?.endpoint
      || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
  }

  async synthesize(text, options = {}) {
    this.validateText(text);
    const params = this.validateOptions(options);

    const creds = this._getCredentials();
    const apiKey = creds?.apiKey || this.apiKey;
    if (!apiKey) {
      throw this._error('CONFIG_ERROR', 'Qwen TTS API 密钥未配置');
    }

    try {
      const result = await this._executeRequest(text, params, apiKey);
      this._reportSuccess();
      return result;
    } catch (error) {
      this._reportFailure(error);
      throw error;
    }
  }

  async _executeRequest(text, params, apiKey) {
    return this._retry(async () => {
      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };

      const requestBody = {
        model: this._pickOption(params, ['model']) || 'qwen3-tts-instruct-flash',
        input: {
          text,
          voice: this._pickOption(params, ['voice']) || 'Cherry'
        }
      };

      const languageType = this._pickOption(params, ['language_type', 'languageType']);
      if (languageType !== undefined) {
        requestBody.input.language_type = languageType;
      }

      const sampleRate = this._pickOption(params, ['sample_rate', 'sampleRate']);
      if (sampleRate !== undefined) {
        requestBody.input.sample_rate = sampleRate;
      }

      const instructions = this._pickOption(params, ['instructions']);
      if (instructions !== undefined) {
        requestBody.input.instructions = instructions;
      }

      const optimizeInstructions = this._pickOption(params, ['optimize_instructions', 'optimizeInstructions']);
      if (optimizeInstructions !== undefined) {
        requestBody.input.optimize_instructions = optimizeInstructions;
      }

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw this._error('API_ERROR', `Qwen TTS 请求失败 (${response.status}): ${errText}`);
      }

      const result = await response.json();

      const audioUrl = result.output?.audio?.url;
      if (!audioUrl) {
        throw this._error('PARSE_ERROR', '响应中未找到音频 URL', { response: result });
      }

      return {
        audioUrl,
        format: params.format || 'wav',
        provider: this.provider,
        serviceType: this.serviceType,
        audioId: result.output?.audio?.id || null,
        expiresAt: result.output?.audio?.expires_at || null
      };
    });
  }

  getFallbackVoices() {
    return [
      { id: 'Cherry', name: '芊悦', gender: 'female' },
      { id: 'Ethan',  name: '晨煦', gender: 'male' },
      { id: 'Luna',   name: '露娜', gender: 'female' }
    ];
  }
}

module.exports = AliyunQwenAdapter;
