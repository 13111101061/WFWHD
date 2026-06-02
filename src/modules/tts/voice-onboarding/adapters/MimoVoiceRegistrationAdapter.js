/**
 * MimoVoiceRegistrationAdapter - MiMo 音色复刻适配器
 *
 * MiMo voice clone 是同步 inline 模式：音频以 Base64 直接内联在请求中，
 * 立即返回合成语音。不产生持久化 voice_id（每次合成都需传入音频样本）。
 *
 * 与 Moss 异步模式（上传→克隆→轮询）的架构差异：
 *   - Moss:     upload → clone → poll ACTIVE → reuse voice_id
 *   - MiMo:     one-shot inline base64 → audio （无持久 voice_id）
 *
 * 入库策略：将 Base64 编码音频存入 runtime.providerOptions.voiceSample，
 * 后续合成时由 Phase 2 管线检测 sourceType=clone 后路由到 voiceclone 模型。
 */
const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');
const VoiceRegistrationPort = require('../port/VoiceRegistrationPort');
const VoiceCloneResult = require('../dto/VoiceCloneResult');
const { getProviderCode } = require('../../../../shared/utils/audioStorage');

class MimoVoiceRegistrationAdapter extends VoiceRegistrationPort {
  constructor(config = {}) {
    super();
    this.endpoint = config.endpoint || 'https://api.xiaomimimo.com/v1/chat/completions';
    this.model = config.model || 'mimo-v2.5-tts-voiceclone';
    this.timeoutMs = config.timeoutMs || 60000;
    this._audioStorage = config.audioStorage || null;
    this._providerKey = 'mimo';
    this._providerCode = getProviderCode(this._providerKey);
  }

  /**
   * 注册音色（同步：读文件 → base64 → 请求 voiceclone API → 生成测试音频）
   * @returns {Promise<VoiceCloneResult>} asyncMode 始终为 false（同步）
   */
  async registerVoice(file, metadata, credentials) {
    const apiKey = credentials?.apiKey;
    if (!apiKey) throw new Error('[MimoVoiceRegistration] Missing API key');
    if (!file || !file.path) throw new Error('[MimoVoiceRegistration] Invalid file object');

    const audioBuffer = fs.readFileSync(file.path);
    const mimeType = file.mimetype || 'audio/wav';
    const base64Audio = audioBuffer.toString('base64');
    const audioHash = crypto.createHash('sha256').update(audioBuffer).digest('hex').substring(0, 16);

    // 合成测试语音（用复刻音色读一句测试文本）
    const testText = metadata.testText || '欢迎使用 MiMo 音色复刻功能，这是我的定制音色。';
    const instruction = metadata.instruction || '';

    const messages = [];
    if (instruction && instruction.trim()) {
      messages.push({ role: 'user', content: instruction });
    }
    messages.push({ role: 'assistant', content: testText });

    const body = {
      model: this.model,
      messages,
      audio: {
        voice: `data:${mimeType};base64,${base64Audio}`,
        format: 'wav'
      }
    };

    const response = await axios.post(this.endpoint, body, {
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: this.timeoutMs,
      maxBodyLength: 12 * 1024 * 1024,
      maxContentLength: 12 * 1024 * 1024,
      responseType: 'json'
    });

    const audioData = response.data?.choices?.[0]?.message?.audio?.data;
    if (!audioData) {
      throw new Error('[MimoVoiceRegistration] Clone response missing audio data');
    }

    const outputAudio = Buffer.from(audioData, 'base64');

    // 保存测试音频 + 获取 URL
    let previewUrl = null;
    if (this._audioStorage) {
      const saved = await this._audioStorage.saveAudioFile(outputAudio, {
        extension: 'wav',
        metadata: {
          provider: 'mimo',
          service: 'voiceclone',
          text: testText.substring(0, 50),
          nameFormat: 'structured',
          type: 'cln',
          providerCode: this._providerCode
        }
      });
      previewUrl = saved.url;
    }

    return new VoiceCloneResult({
      providerVoiceId: `mimo_clone_${audioHash}`,  // 合成 ID（非 MiMo 原生）
      model: this.model,
      asyncMode: false,
      meta: {
        audioHash,
        audioSize: audioBuffer.length,
        mimeType,
        voiceSample: `data:${mimeType};base64,${base64Audio}`,
        previewUrl,
        testText
      }
    });
  }

  /**
   * MiMo clone 始终同步，无需轮询
   */
  async getCloneStatus(_voiceId, _credentials) {
    return { status: 'completed' };
  }
}

module.exports = MimoVoiceRegistrationAdapter;
