/**
 * VolcengineTtsAdapter - 火山引擎TTS适配器
 *
 * 支持凭证池化：
 * - 请求时选择最佳账号
 * - 报告成功/失败用于健康追踪
 */

const BaseTtsAdapter = require('./BaseTtsAdapter');

class VolcengineTtsAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({
      provider: 'volcengine',
      serviceType: 'volcengine_http',
      ...config
    });

    // 初始化时获取凭证（向后兼容）
    const creds = this._getCredentials();
    this.appId = config.appId || creds?.appId;
    this.token = config.token || creds?.token;
    this.endpoint = config.endpoint || 'https://openspeech.bytedance.com/api/v1/tts';
  }

  async synthesize(text, options = {}) {
    this.validateText(text);
    const params = this.validateOptions(options);

    // 请求时获取凭证（支持池化选择和健康追踪）
    const creds = this._getCredentials();
    const appId = creds?.appId || this.appId;
    const token = creds?.token || this.token;

    if (!appId || !token) {
      throw this._error('CONFIG_ERROR', '火山引擎TTS配置不完整');
    }

    try {
      const mappedAudio = this._getNestedValue(params, 'audio') || {};
      const audioPayload = {
        ...mappedAudio,
        voice_type: this._pickOption(params, ['audio.voice_type', 'voice']) || 'zh_female_shuangkuaisisi_moon_bigtts',
        encoding: this._pickOption(params, ['audio.encoding', 'format']) || 'mp3',
        speed_ratio: this._pickOption(params, ['audio.speed_ratio', 'speed']) ?? 1.0,
        volume_ratio: this._pickOption(params, ['audio.volume_ratio']) ?? ((this._pickOption(params, ['volume']) ?? 50) / 100)
      };

      const requestPayload = {
        user: { uid: 'tts-service' },
        audio: audioPayload,
        request: {
          reqid: Date.now().toString(),
          text,
          operation: 'query'
        }
      };

      const response = await fetch(`${this.endpoint}?appid=${appId}&token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        throw this._error('API_ERROR', `火山引擎TTS失败: ${response.status}`);
      }

      const result = await response.json();

      // 验证响应数据
      if (!result.data) {
        const errorMsg = result.base_resp?.status_msg || '响应中未找到音频数据';
        throw this._error('PARSE_ERROR', `火山引擎TTS响应格式错误: ${errorMsg}`);
      }

      if (typeof result.data !== 'string') {
        throw this._error('PARSE_ERROR', '火山引擎TTS: data字段不是Base64字符串');
      }

      const audio = Buffer.from(result.data, 'base64');
      if (audio.length === 0) {
        throw this._error('PARSE_ERROR', '火山引擎TTS: 解码Base64后音频数据为空');
      }

      // 报告成功
      this._reportSuccess();

      return {
        audio,
        format: audioPayload.encoding || 'mp3',
        provider: this.provider,
        serviceType: this.serviceType
      };
    } catch (error) {
      // 报告失败
      this._reportFailure(error);
      throw error;
    }
  }

  getFallbackVoices() {
    return [
      { id: 'zh_female_shuangkuaisisi_moon_bigtts', name: '中文女声', gender: 'female' }
    ];
  }
}

module.exports = VolcengineTtsAdapter;
