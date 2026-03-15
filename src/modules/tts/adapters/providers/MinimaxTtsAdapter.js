/**
 * MinimaxTtsAdapter - MiniMax TTS适配器
 */

const BaseTtsAdapter = require('./BaseTtsAdapter');

class MinimaxTtsAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({
      provider: 'minimax',
      serviceType: 'tts',
      ...config
    });

    const creds = this._getCredentials();
    this.apiKey = config.apiKey || creds?.apiKey;
    this.groupId = config.groupId || creds?.groupId;
    this.endpoint = config.endpoint || 'https://api.minimax.chat/v1/text_to_speech';
  }

  async synthesize(text, options = {}) {
    if (!this.apiKey) {
      throw this._error('CONFIG_ERROR', 'MiniMax API密钥未配置');
    }

    this.validateText(text);
    const params = this.validateOptions(options);

    return this._retry(async () => {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          voice_id: params.voice || 'female-1',
          model: params.model || 'speech-01-turbo',
          audio_format: params.format || 'mp3'
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw this._error('API_ERROR', `MiniMax TTS失败: ${err}`);
      }

      const audio = Buffer.from(await response.arrayBuffer());

      return {
        audio,
        format: params.format || 'mp3',
        provider: this.provider,
        serviceType: this.serviceType
      };
    });
  }

  getFallbackVoices() {
    return [
      { id: 'female-1', name: '中文女声1', gender: 'female' },
      { id: 'female-2', name: '中文女声2', gender: 'female' }
    ];
  }
}

module.exports = MinimaxTtsAdapter;