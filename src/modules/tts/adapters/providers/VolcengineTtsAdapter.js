/**
 * VolcengineTtsAdapter - 火山引擎TTS适配器
 */

const BaseTtsAdapter = require('./BaseTtsAdapter');

class VolcengineTtsAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({
      provider: 'volcengine',
      serviceType: 'http',
      ...config
    });

    const creds = this._getCredentials();
    this.appId = config.appId || creds?.appId;
    this.token = config.token || creds?.token;
    this.endpoint = config.endpoint || 'https://openspeech.bytedance.com/api/v1/tts';
  }

  async synthesize(text, options = {}) {
    if (!this.appId || !this.token) {
      throw this._error('CONFIG_ERROR', '火山引擎TTS配置不完整');
    }

    this.validateText(text);
    const params = this.validateOptions(options);

    return this._retry(async () => {
      const response = await fetch(`${this.endpoint}?appid=${this.appId}&token=${this.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: { uid: 'tts-service' },
          audio: {
            voice_type: params.voice || 'zh_female_shuangkuaisisi_moon_bigtts',
            encoding: params.format || 'mp3',
            speed_ratio: params.speed || 1.0,
            volume_ratio: params.volume / 100 || 0.5
          },
          request: {
            reqid: Date.now().toString(),
            text,
            operation: 'query'
          }
        })
      });

      if (!response.ok) {
        throw this._error('API_ERROR', `火山引擎TTS失败: ${response.status}`);
      }

      const result = await response.json();
      const audio = Buffer.from(result.data, 'base64');

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
      { id: 'zh_female_shuangkuaisisi_moon_bigtts', name: '中文女声', gender: 'female' }
    ];
  }
}

module.exports = VolcengineTtsAdapter;