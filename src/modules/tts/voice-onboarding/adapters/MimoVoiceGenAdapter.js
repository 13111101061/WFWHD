/**
 * MimoVoiceGenAdapter - MiMo 指令音色生成适配器
 *
 * 用于 /api/voices/instruction/preview 前端预览链路。
 * 对接 MiMo mimo-v2.5-tts-voicedesign 模型，以文本描述生成音色。
 *
 * API 差异（vs Moss Voice Generator）：
 *   - Moss:  POST /api/v1/audio/speech { model, text, instruction, sampling_params }
 *   - MiMo:  POST /v1/chat/completions { model, messages:[{role,content}], audio:{format} }
 *
 * 特点：
 *   - instruction 放在 user role message
 *   - testText 放在 assistant role message
 *   - 支持 optimize_text_preview 自动润色（可选）
 */
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { getProviderCode } = require('../../../../shared/utils/audioStorage');

class MimoVoiceGenAdapter {
  constructor(config = {}) {
    this.endpoint = config.endpoint || 'https://api.xiaomimimo.com/v1/chat/completions';
    this.timeoutMs = config.timeoutMs || 60000;
    this.model = config.model || 'mimo-v2.5-tts-voicedesign';
    this._audioStorage = config.audioStorage || null;
    this._providerKey = 'mimo';
    this._providerCode = getProviderCode(this._providerKey);
  }

  /**
   * 根据 instruction 生成预览音频
   * @param {string} instruction - 音色设计描述（放在 user message）
   * @param {string} testText - 合成测试文本（放在 assistant message）
   * @param {Object} _samplingParams - 暂未使用（MiMo voicedesign 不用 sampling_params）
   * @param {string} apiKey - MiMo API Key
   * @returns {Promise<{ audioUrl: string, fileSize: number, format: string, creditCost?: number }>}
   */
  async generatePreview(instruction, testText, _samplingParams = {}, apiKey) {
    if (!apiKey) throw this._error('CONFIG_ERROR', '[MimoVoiceGen] Missing API key');
    if (!instruction) throw this._error('VALIDATION_ERROR', '[MimoVoiceGen] instruction is required');
    if (!testText) throw this._error('VALIDATION_ERROR', '[MimoVoiceGen] testText is required');

    const body = {
      model: this.model,
      messages: [
        { role: 'user', content: instruction },
        { role: 'assistant', content: testText }
      ],
      audio: {
        format: 'wav'
      }
    };

    try {
      const response = await axios.post(this.endpoint, body, {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: this.timeoutMs,
        responseType: 'json'
      });

      const audioBase64 = response.data?.choices?.[0]?.message?.audio?.data;
      if (!audioBase64) {
        throw this._error('API_ERROR', '[MimoVoiceGen] Response missing audio data');
      }

      return await this._saveAudio(audioBase64, testText);
    } catch (error) {
      const HANDLED_CODES = ['CONFIG_ERROR', 'VALIDATION_ERROR', 'TIMEOUT_ERROR', 'PROVIDER_ERROR', 'RATE_LIMIT_EXCEEDED'];
      if (error.code && HANDLED_CODES.includes(error.code)) throw error;
      this._handleApiError(error);
    }
  }

  _handleApiError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      const msg = data?.error?.message || data?.message || error.message;

      if (status === 401 || status === 403) {
        throw this._error('CONFIG_ERROR', `MiMo 认证失败: ${msg}`);
      }
      if (status === 429) {
        throw this._error('RATE_LIMIT_EXCEEDED', `MiMo 请求频率超限: ${msg}`);
      }
      if (status === 400) {
        throw this._error('VALIDATION_ERROR', `MiMo 参数错误: ${msg}`);
      }
      throw this._error('API_ERROR', `MiMo HTTP ${status}: ${msg}`);
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw this._error('TIMEOUT_ERROR', 'MiMo 请求超时');
    }
    throw this._error('PROVIDER_ERROR', `MiMo 请求失败: ${error.message}`);
  }

  _error(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
  }

  async _saveAudio(audioBase64, testText) {
    const buffer = Buffer.from(audioBase64, 'base64');
    const fileName = `mimo_voicegen_${uuidv4()}.wav`;

    if (this._audioStorage) {
      const saved = await this._audioStorage.saveAudioFile(buffer, {
        extension: 'wav',
        metadata: {
          service: 'mimo_voicegen',
          text: testText.substring(0, 50),
          nameFormat: 'structured',
          type: 'gen',
          providerCode: this._providerCode
        }
      });
      return {
        audioUrl: saved.url,
        fileSize: saved.size,
        format: 'wav',
        creditCost: null
      };
    }

    const outputDir = process.env.AUDIO_STORAGE_DIR || 'src/storage/uploads/audio';
    const outputPath = path.resolve(outputDir, fileName);
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.promises.writeFile(outputPath, buffer);

    return {
      audioUrl: `/audio/${fileName}`,
      fileSize: buffer.length,
      format: 'wav',
      creditCost: null
    };
  }
}

module.exports = MimoVoiceGenAdapter;
