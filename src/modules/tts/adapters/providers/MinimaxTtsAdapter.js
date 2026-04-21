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
      const voiceSetting = {
        ...(this._getNestedValue(params, 'voice_setting') || {})
      };

      if (!voiceSetting.voice_id) {
        voiceSetting.voice_id = this._pickOption(params, ['voice']) || 'female-1';
      }

      const legacySpeed = this._pickOption(params, ['speed']);
      if (voiceSetting.speed === undefined && legacySpeed !== undefined) {
        voiceSetting.speed = legacySpeed;
      }

      const legacyVolume = this._pickOption(params, ['volume']);
      if (voiceSetting.vol === undefined && legacyVolume !== undefined) {
        voiceSetting.vol = legacyVolume;
      }

      const legacyPitch = this._pickOption(params, ['pitch']);
      if (voiceSetting.pitch === undefined && legacyPitch !== undefined) {
        voiceSetting.pitch = legacyPitch;
      }

      const legacyEmotion = this._pickOption(params, ['emotion']);
      if (voiceSetting.emotion === undefined && legacyEmotion !== undefined) {
        voiceSetting.emotion = legacyEmotion;
      }

      const audioSetting = {
        ...(this._getNestedValue(params, 'audio_setting') || {})
      };

      const audioFormat = this._pickOption(params, ['audio_setting.format', 'format']) || 'mp3';
      if (audioSetting.format === undefined) {
        audioSetting.format = audioFormat;
      }

      const sampleRate = this._pickOption(params, ['audio_setting.sample_rate', 'sample_rate', 'sampleRate']);
      if (sampleRate !== undefined && audioSetting.sample_rate === undefined) {
        audioSetting.sample_rate = sampleRate;
      }

      const requestBody = {
        text,
        model: this._pickOption(params, ['model']) || 'speech-01-turbo',
        voice_setting: voiceSetting,
        audio_setting: audioSetting
      };

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
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
        format: audioFormat,
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
