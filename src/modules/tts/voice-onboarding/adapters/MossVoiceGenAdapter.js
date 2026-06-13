/**
 * MossVoiceGenAdapter - Moss 指令声音生成适配器
 *
 * 用于 /api/voices/instruction/preview 的前端预览链路。
 * 不继承 BaseTtsAdapter（非 TTS 合成管线），
 * 只负责调用 Moss Voice Generator API 并返回音频数据。
 *
 * 特点：
 * - 模型固定为 moss-voice-generator
 * - 返回 Base64 编码音频，需解码落盘
 * - 不经过合成管线，不触达 VoiceResolver / CompiledCapability
 */
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { getProviderCode } = require('../../../../shared/utils/audioStorage');

class MossVoiceGenAdapter {
  constructor(config = {}) {
    this.endpoint = config.endpoint
      || (process.env.MOSS_BASE_URL ? `${process.env.MOSS_BASE_URL}/api/v1/audio/speech` : null)
      || 'https://studio.mosi.cn/api/v1/audio/speech';
    this.timeoutMs = config.timeoutMs || 30000;
    this.model = config.model || 'moss-voice-generator';
    this._audioStorage = config.audioStorage || null;
    this._providerKey = 'moss';
    this._providerCode = getProviderCode(this._providerKey);
  }

  /**
   * 根据 instruction 生成预览音频
   * @param {string} instruction - 声音风格描述
   * @param {string} testText - 合成测试文本
   * @param {Object} samplingParams - { temperature?, topP?, topK? }
   * @param {string} apiKey - Moss API Key
   * @returns {Promise<{ audioUrl: string, fileSize: number, format: string }>}
   */
  async generatePreview(instruction, testText, samplingParams = {}, apiKey) {
    if (!apiKey) throw this._error('CONFIG_ERROR', '[MossVoiceGen] Missing API key');
    if (!instruction) throw this._error('VALIDATION_ERROR', '[MossVoiceGen] instruction is required');
    if (!testText) throw this._error('VALIDATION_ERROR', '[MossVoiceGen] testText is required');

    const payload = {
      model: this.model,
      text: testText,
      instruction,
      sampling_params: {
        temperature: samplingParams.temperature ?? 1.5,
        top_p: samplingParams.topP ?? 0.6,
        top_k: samplingParams.topK ?? 50
      },
      meta_info: true
    };

    try {
      const response = await axios.post(this.endpoint, payload, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeoutMs,
        responseType: 'json'
      });

      const audioBase64 = response.data?.audio_data;
      if (!audioBase64) {
        throw this._error('API_ERROR', '[MossVoiceGen] Response missing audio_data');
      }

      const creditCost = response.data?.usage?.credit_cost || null;
      return await this._saveAudio(audioBase64, testText, creditCost);
    } catch (error) {
      if (error.code && error.code !== 'API_ERROR') throw error;
      this._handleApiError(error);
    }
  }

  _handleApiError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      const msg = data?.error?.message || data?.message || data?.detail || error.message;

      if (status === 401 || status === 403) {
        throw this._error('CONFIG_ERROR', `Moss 认证失败: ${msg}`);
      }
      if (status === 429) {
        throw this._error('RATE_LIMIT_EXCEEDED', `Moss 请求频率超限: ${msg}`);
      }
      if (status === 400) {
        throw this._error('VALIDATION_ERROR', `Moss 参数错误: ${msg}`);
      }
      throw this._error('API_ERROR', `Moss HTTP ${status}: ${msg}`);
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw this._error('TIMEOUT_ERROR', 'Moss 请求超时');
    }
    throw this._error('PROVIDER_ERROR', `Moss 请求失败: ${error.message}`);
  }

  _error(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
  }

  async _saveAudio(audioBase64, testText, creditCost) {
    const buffer = Buffer.from(audioBase64, 'base64');
    const fileName = `voicegen_tmp_${uuidv4()}.wav`;

    if (this._audioStorage) {
      const saved = await this._audioStorage.saveAudioFile(buffer, {
        extension: 'wav',
        metadata: {
          service: 'voicegen',
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
        creditCost
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
      creditCost
    };
  }
}

module.exports = MossVoiceGenAdapter;
