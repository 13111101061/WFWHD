const BaseTtsAdapter = require('../BaseTtsAdapter');
const axios = require('axios');

class MimoTtsAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({ provider: 'mimo', serviceType: 'tts', ...config });
    const creds = this._getCredentials();
    this.apiKey = config.apiKey || creds?.apiKey;
    this.endpoint = config.endpoint || 'https://api.xiaomimimo.com/v1/chat/completions';
    this.model = config.model || 'mimo-v2.5-tts';
  }

  async synthesize(text, options = {}) {
    this.validateText(text);
    const creds = this._getCredentials();
    const apiKey = creds?.apiKey || this.apiKey;
    if (!apiKey) {
      throw this._error('CONFIG_ERROR', 'MiMo API Key 未配置');
    }

    const instruction = options.instruction || '';
    const voice = options.voice || 'mimo_default';
    const format = options.format || 'wav';
    const model = options.model || this.model;

    try {
      const messages = [];
      if (instruction && instruction.trim()) {
        messages.push({ role: 'user', content: instruction });
      }
      messages.push({ role: 'assistant', content: text });

      const body = {
        model,
        messages,
        audio: {
          voice,
          format
        }
      };

      const response = await axios.post(this.endpoint, body, {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: this.config.timeout || 60000,
        responseType: 'json'
      });

      const choice = response.data?.choices?.[0];
      if (!choice) {
        throw this._error('API_ERROR', 'MiMo 响应缺少 choices');
      }

      const audioData = choice.message?.audio?.data;
      if (!audioData) {
        const refusal = choice.message?.refusal || choice.finish_reason;
        throw this._error('API_ERROR', `MiMo 未返回音频数据: ${refusal || 'unknown'}`);
      }

      const audio = Buffer.from(audioData, 'base64');

      this._reportSuccess();
      return {
        audio,
        format,
        provider: this.provider,
        serviceType: this.serviceType,
        model,
        voice
      };
    } catch (error) {
      if (error.code === 'CONFIG_ERROR' || error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      this._reportFailure(error);
      this._handleApiError(error);
    }
  }

  _handleApiError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      const msg = data?.error?.message || data?.message || error.message;

      if (status === 401 || status === 403) {
        throw this._error('CONFIG_ERROR', `MiMo 认证失败: ${msg}`);
      }
      if (status === 429) {
        throw this._error('RATE_LIMIT_EXCEEDED', `MiMo 请求频率超限: ${msg}`);
      }
      throw this._error('API_ERROR', `MiMo HTTP ${status}: ${msg}`);
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw this._error('TIMEOUT_ERROR', `MiMo 请求超时`);
    }
    throw this._error('PROVIDER_ERROR', `MiMo 请求失败: ${error.message}`);
  }

  getFallbackVoices() {
    return [
      { id: 'mimo_default', name: 'MiMo-默认', gender: 'female', language: 'zh-CN' },
      { id: '冰糖', name: '冰糖', gender: 'female', language: 'zh-CN' },
      { id: '茉莉', name: '茉莉', gender: 'female', language: 'zh-CN' },
      { id: '苏打', name: '苏打', gender: 'male', language: 'zh-CN' },
      { id: '白桦', name: '白桦', gender: 'male', language: 'zh-CN' },
      { id: 'Mia', name: 'Mia', gender: 'female', language: 'en' },
      { id: 'Chloe', name: 'Chloe', gender: 'female', language: 'en' },
      { id: 'Milo', name: 'Milo', gender: 'male', language: 'en' },
      { id: 'Dean', name: 'Dean', gender: 'male', language: 'en' }
    ];
  }

  getStatus() {
    return {
      ...super.getStatus(),
      endpoint: this.endpoint,
      model: this.model,
      hasApiKey: !!this.apiKey
    };
  }
}

module.exports = MimoTtsAdapter;
