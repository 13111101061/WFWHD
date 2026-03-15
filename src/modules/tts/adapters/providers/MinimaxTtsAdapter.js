/**
 * MinimaxTtsAdapter - MiniMax TTS适配器
 *
 * 支持凭证池化：
 * - 请求时选择最佳账号
 * - 报告成功/失败用于健康追踪
 */

const BaseTtsAdapter = require('./BaseTtsAdapter');

class MinimaxTtsAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({
      provider: 'minimax',
      serviceType: 'minimax_tts',
      ...config
    });

    // 初始化时获取凭证（向后兼容）
    const creds = this._getCredentials();
    this.apiKey = config.apiKey || creds?.apiKey;
    this.groupId = config.groupId || creds?.groupId;
    this.endpoint = config.endpoint || 'https://api.minimax.chat/v1/text_to_speech';
  }

  async synthesize(text, options = {}) {
    this.validateText(text);
    const params = this.validateOptions(options);

    // 请求时获取凭证（支持池化选择和健康追踪）
    const creds = this._getCredentials();
    const apiKey = creds?.apiKey || this.apiKey;
    const groupId = creds?.groupId || this.groupId;

    if (!apiKey) {
      throw this._error('CONFIG_ERROR', 'MiniMax API密钥未配置');
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
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

      // 报告成功
      this._reportSuccess();

      return {
        audio,
        format: params.format || 'mp3',
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
      { id: 'female-1', name: '中文女声1', gender: 'female' },
      { id: 'female-2', name: '中文女声2', gender: 'female' }
    ];
  }
}

module.exports = MinimaxTtsAdapter;