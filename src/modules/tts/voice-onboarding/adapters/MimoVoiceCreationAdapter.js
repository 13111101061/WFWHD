/**
 * MimoVoiceCreationAdapter - MiMo 音色创建适配器（克隆 + 指令生成合一）
 *
 * 合并原 MimoVoiceRegistrationAdapter（复刻）+ MimoVoiceGenAdapter（指令生成）。
 *
 * MiMo 架构特点（与 Moss 异步两步式不同）：
 *   - 克隆：同步 inline base64，音频直接内联在请求，立即返回，无持久 voice_id
 *   - 指令生成：voicedesign 模型，instruction 放 user message，testText 放 assistant message
 *   - 鉴权头：api-key（非 Bearer）
 *
 * 公共逻辑由基类承担，子类只写 chat/completions 调用差异。
 */
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const BaseVoiceCreationAdapter = require('./BaseVoiceCreationAdapter');
const VoiceCloneResult = require('../dto/VoiceCloneResult');
const { TtsErrorCodes } = require('../../TtsErrorCodes');

class MimoVoiceCreationAdapter extends BaseVoiceCreationAdapter {
  constructor(config = {}) {
    super({ providerKey: 'mimo', audioStorage: config.audioStorage });
    this.endpoint = config.endpoint || 'https://api.xiaomimimo.com/v1/chat/completions';
    this.cloneModel = config.cloneModel || 'mimo-v2.5-tts-voiceclone';
    this.genModel = config.genModel || 'mimo-v2.5-tts-voicedesign';
    this.timeoutMs = config.timeoutMs || 60000;
  }

  _providerLabel() {
    return 'MiMo';
  }

  /**
   * 能力①：复刻（同步 inline base64 → 立即返回合成语音）
   * @returns {Promise<VoiceCloneResult>} asyncMode 始终为 false（同步）
   */
  async cloneVoice(file, metadata, credentials) {
    const apiKey = this._apiKey(credentials);
    if (!apiKey) throw this._error(TtsErrorCodes.CONFIG_ERROR, '[MimoVoiceCreation] Missing API key');
    if (!file || !file.path) throw this._error(TtsErrorCodes.VALIDATION_ERROR, '[MimoVoiceCreation] Invalid file object');

    const audioBuffer = fs.readFileSync(file.path);
    const mimeType = file.mimetype || 'audio/wav';
    const base64Audio = audioBuffer.toString('base64');
    const audioHash = crypto.createHash('sha256').update(audioBuffer).digest('hex').substring(0, 16);

    const testText = metadata.testText || '欢迎使用 MiMo 音色复刻功能，这是我的定制音色。';
    const instruction = metadata.instruction || '';

    const messages = [];
    if (instruction && instruction.trim()) {
      messages.push({ role: 'user', content: instruction });
    }
    messages.push({ role: 'assistant', content: testText });

    const body = {
      model: this.cloneModel,
      messages,
      audio: {
        voice: `data:${mimeType};base64,${base64Audio}`,
        format: 'wav'
      }
    };

    const data = await this._postJson(this.endpoint, body, apiKey);

    const audioData = data?.choices?.[0]?.message?.audio?.data;
    if (!audioData) {
      throw this._error(TtsErrorCodes.PROVIDER_UNAVAILABLE, '[MimoVoiceCreation] Clone response missing audio data');
    }

    const outputBuffer = Buffer.from(audioData, 'base64');
    const saved = await this._saveBuffer(outputBuffer, {
      service: 'voiceclone',
      text: testText,
      type: 'cln'
    });

    return new VoiceCloneResult({
      providerVoiceId: `mimo_clone_${audioHash}`,
      model: this.cloneModel,
      asyncMode: false,
      meta: {
        audioHash,
        audioSize: audioBuffer.length,
        mimeType,
        voiceSample: `data:${mimeType};base64,${base64Audio}`,
        previewUrl: saved.audioUrl,
        testText
      }
    });
  }

  /**
   * 能力②：指令生成预览（voicedesign 模型，instruction→user，testText→assistant）
   * @param {Object} _samplingParams - MiMo voicedesign 不使用采样参数，忽略
   */
  async generatePreview(instruction, testText, _samplingParams = {}, credentials) {
    const apiKey = this._apiKey(credentials);
    if (!apiKey) throw this._error(TtsErrorCodes.CONFIG_ERROR, '[MimoVoiceCreation] Missing API key');
    if (!instruction) throw this._error(TtsErrorCodes.VALIDATION_ERROR, '[MimoVoiceCreation] instruction is required');
    if (!testText) throw this._error(TtsErrorCodes.VALIDATION_ERROR, '[MimoVoiceCreation] testText is required');

    const body = {
      model: this.genModel,
      messages: [
        { role: 'user', content: instruction },
        { role: 'assistant', content: testText }
      ],
      audio: {
        format: 'wav'
      }
    };

    const data = await this._postJson(this.endpoint, body, apiKey);

    const audioBase64 = data?.choices?.[0]?.message?.audio?.data;
    if (!audioBase64) {
      throw this._error(TtsErrorCodes.PROVIDER_UNAVAILABLE, '[MimoVoiceCreation] Response missing audio data');
    }

    return this._decodeAndSave(audioBase64, {
      service: 'mimo_voicegen',
      text: testText,
      type: 'gen'
    });
  }

  // ==================== 私有：HTTP 封装 ====================

  /**
   * MiMo 统一用 api-key 头（与 Moss 的 Bearer 不同，故单独封装）
   */
  async _postJson(url, body, apiKey) {
    try {
      const resp = await axios.post(url, body, {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: this.timeoutMs,
        maxBodyLength: 12 * 1024 * 1024,
        maxContentLength: 12 * 1024 * 1024,
        responseType: 'json'
      });
      return resp.data;
    } catch (e) {
      throw this._mapHttpError(e);
    }
  }
}

module.exports = MimoVoiceCreationAdapter;
