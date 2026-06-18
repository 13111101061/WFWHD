/**
 * TencentTtsAdapter - 腾讯云TTS适配器
 *
 * 支持凭证池化：
 * - 请求时选择最佳账号
 * - 报告成功/失败用于健康追踪
 */

const BaseTtsAdapter = require('../BaseTtsAdapter');
const { decodeAudio } = require('../../../../shared/utils/audioDecoder');

class TencentTtsAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({
      provider: 'tencent',
      serviceType: 'tts',
      ...config
    });

    this.region = config.region || 'ap-guangzhou';
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

  async synthesize(text, options = {}, providerInput = null, signal = null) {
    this.validateText(text);
    const params = this.validateOptions(options);

    const { credentials: creds, accountId } = this._getCredentials();
    const secretId = creds?.secretId;
    const secretKey = creds?.secretKey;

    if (!secretId || !secretKey) {
      throw this._error('CONFIG_ERROR', '腾讯云TTS密钥未配置');
    }

    try {
      const client = this._getClient(secretId, secretKey);

      const voiceType = this._pickOption(params, ['VoiceType', 'voice']);
      const mappedSpeed = this._pickOption(params, ['Speed']);
      const legacySpeed = this._pickOption(params, ['speed']);
      const volume = this._pickOption(params, ['Volume', 'volume']);
      const codec = this._pickOption(params, ['Codec', 'format']) || 'mp3';
      const sampleRate = this._pickOption(params, ['SampleRate', 'sampleRate', 'sample_rate']);

      const requestBody = {
        Text: text,
        VoiceType: parseInt(voiceType, 10) || 101001,
        Speed: mappedSpeed !== undefined ? mappedSpeed : Math.round((legacySpeed ?? 1.0) * 5),
        Volume: volume,
        Codec: codec
      };

      if (sampleRate !== undefined) {
        requestBody.SampleRate = sampleRate;
      }

      // 腾讯 SDK 无原生 signal 支持，用 AbortController + 超时包裹
      const response = await this._withAbort(signal, () => client.TextToVoice(requestBody));

      this._reportSuccess(accountId);

      const audio = await decodeAudio(response.Audio);

      return {
        audio,
        format: codec,
        provider: this.provider,
        serviceType: this.serviceType,
        requestId: response.RequestId
      };
    } catch (error) {
      this._reportFailure(accountId, error);
      throw error;
    }
  }

  /**
   * AbortController 包裹：对于不支持 signal 的 SDK，通过超时中断等待
   */
  _withAbort(signal, fn) {
    if (!signal) return fn();
    return new Promise((resolve, reject) => {
      let settled = false;
      const onAbort = () => {
        if (!settled) {
          settled = true;
          reject(this._error('TIMEOUT_ERROR', 'Request aborted'));
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });
      fn()
        .then(result => { if (!settled) { settled = true; signal.removeEventListener('abort', onAbort); resolve(result); } })
        .catch(err => { if (!settled) { settled = true; signal.removeEventListener('abort', onAbort); reject(err); } });
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
