/**
 * TencentTtsAdapter - 腾讯云TTS适配器
 *
 * 支持凭证池化：
 * - 请求时选择最佳账号
 * - 报告成功/失败用于健康追踪
 */

const BaseTtsAdapter = require('./BaseTtsAdapter');

class TencentTtsAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({
      provider: 'tencent',
      serviceType: 'tts',
      ...config
    });

    // 初始化时获取凭证（向后兼容）
    const creds = this._getCredentials();
    this.secretId = config.secretId || creds?.secretId;
    this.secretKey = config.secretKey || creds?.secretKey;
    this.region = config.region || creds?.region || 'ap-guangzhou';

    this._client = null;
  }

  _getClient(secretId, secretKey) {
    try {
      const tencentcloud = require('tencentcloud-sdk-nodejs-tts');
      return new tencentcloud.tts.v20190823.Client({
        credential: { secretId, secretKey },
        region: this.region,
        profile: { httpProfile: { endpoint: 'tts.tencentcloudapi.com' } }
      });
    } catch (e) {
      throw this._error('CONFIG_ERROR', '腾讯云SDK未安装: npm install tencentcloud-sdk-nodejs-tts');
    }
  }

  async synthesize(text, options = {}) {
    this.validateText(text);
    const params = this.validateOptions(options);

    // 请求时获取凭证（支持池化选择和健康追踪）
    const creds = this._getCredentials();
    const secretId = creds?.secretId || this.secretId;
    const secretKey = creds?.secretKey || this.secretKey;

    if (!secretId || !secretKey) {
      throw this._error('CONFIG_ERROR', '腾讯云TTS密钥未配置');
    }

    try {
      const client = this._getClient(secretId, secretKey);

      const response = await client.TextToVoice({
        Text: text,
        VoiceType: parseInt(params.voice) || 101001,
        Speed: Math.round(params.speed * 5),
        Volume: params.volume,
        Codec: params.format || 'mp3'
      });

      // 报告成功
      this._reportSuccess();

      return {
        audio: Buffer.from(response.Audio, 'base64'),
        format: params.format || 'mp3',
        provider: this.provider,
        serviceType: this.serviceType,
        requestId: response.RequestId
      };
    } catch (error) {
      // 报告失败
      this._reportFailure(error);
      throw error;
    }
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