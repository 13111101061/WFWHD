/**
 * TencentTtsAdapter - 腾讯云TTS适配器
 */

const BaseTtsAdapter = require('./BaseTtsAdapter');

class TencentTtsAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({
      provider: 'tencent',
      serviceType: 'tts',
      ...config
    });

    const creds = this._getCredentials();
    this.secretId = config.secretId || creds?.secretId;
    this.secretKey = config.secretKey || creds?.secretKey;
    this.region = config.region || creds?.region || 'ap-guangzhou';

    this._client = null;
  }

  _getClient() {
    if (!this._client) {
      try {
        const tencentcloud = require('tencentcloud-sdk-nodejs-tts');
        this._client = new tencentcloud.tts.v20190823.Client({
          credential: {
            secretId: this.secretId,
            secretKey: this.secretKey
          },
          region: this.region,
          profile: { httpProfile: { endpoint: 'tts.tencentcloudapi.com' } }
        });
      } catch (e) {
        throw this._error('DEPENDENCY_ERROR', '腾讯云SDK未安装: npm install tencentcloud-sdk-nodejs-tts');
      }
    }
    return this._client;
  }

  async synthesize(text, options = {}) {
    if (!this.secretId || !this.secretKey) {
      throw this._error('CONFIG_ERROR', '腾讯云TTS密钥未配置');
    }

    this.validateText(text);
    const params = this.validateOptions(options);

    return this._retry(async () => {
      const client = this._getClient();

      const response = await client.TextToVoice({
        Text: text,
        VoiceType: parseInt(params.voice) || 101001,
        Speed: Math.round(params.speed * 5),
        Volume: params.volume,
        Codec: params.format || 'mp3'
      });

      return {
        audio: Buffer.from(response.Audio, 'base64'),
        format: params.format || 'mp3',
        provider: this.provider,
        serviceType: this.serviceType,
        requestId: response.RequestId
      };
    });
  }

  getFallbackVoices() {
    return [
      { id: '101001', name: '亲亲', gender: 'female' },
      { id: '101002', name: '鸭鸭', gender: 'female' },
      { id: '101003', name: '圆圆', gender: 'female' },
      { id: '101004', name: '小龙', gender: 'male' }
    ];
  }
}

module.exports = TencentTtsAdapter;