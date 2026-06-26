/**
 * MossVoiceCreationAdapter - Moss 音色创建适配器（克隆 + 指令生成合一）
 *
 * 合并原 MossVoiceRegistrationAdapter（克隆）+ MossVoiceGenAdapter（指令生成），
 * 继承 BaseVoiceCreationAdapter，只保留 Moss 特有逻辑：
 *   - 能力①：两步式异步克隆（upload → clone → poll ACTIVE）
 *   - 能力②：voice-generator API（POST /audio/speech）
 *
 * 公共逻辑（HTTP 错误映射 / 音频落盘 / 凭证解析）由基类承担。
 */
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const BaseVoiceCreationAdapter = require('./BaseVoiceCreationAdapter');
const VoiceCloneResult = require('../dto/VoiceCloneResult');
const { TtsErrorCodes } = require('../../TtsErrorCodes');

class MossVoiceCreationAdapter extends BaseVoiceCreationAdapter {
  constructor(config = {}) {
    super({ providerKey: 'moss', audioStorage: config.audioStorage });
    this.baseUrl = config.baseUrl || process.env.MOSS_BASE_URL || 'https://studio.mosi.cn';
    this.uploadEndpoint = config.uploadEndpoint || `${this.baseUrl}/api/v1/files/upload`;
    this.cloneEndpoint = config.cloneEndpoint || `${this.baseUrl}/api/v1/voice/clone`;
    this.voiceEndpoint = config.voiceEndpoint || `${this.baseUrl}/api/v1/voices`;
    this.speechEndpoint = config.speechEndpoint || `${this.baseUrl}/api/v1/audio/speech`;
    this.cloneModel = config.cloneModel || 'moss-tts';
    this.genModel = config.genModel || 'moss-voice-generator';
    this.timeoutMs = config.timeoutMs || 30000;
  }

  _providerLabel() {
    return 'Moss';
  }

  /**
   * 能力①：克隆（两阶段：上传 → 创建克隆，始终异步）
   * @returns {Promise<VoiceCloneResult>} asyncMode 始终为 true
   */
  async cloneVoice(file, metadata, credentials) {
    const apiKey = this._apiKey(credentials);
    if (!apiKey) throw this._error(TtsErrorCodes.CONFIG_ERROR, '[MossVoiceCreation] Missing API key');
    if (!file || !file.path) throw this._error(TtsErrorCodes.VALIDATION_ERROR, '[MossVoiceCreation] Invalid file object: missing path');

    // Step 1: 上传音频 → file_id
    const fileId = await this._uploadFile(file, apiKey);

    // Step 2: 创建 Voice Clone → voice_id + PENDING
    const cloneBody = { file_id: fileId };
    if (metadata.transcriptionText) cloneBody.text = metadata.transcriptionText;

    const data = await this._postJson(this.cloneEndpoint, cloneBody, apiKey);

    const voiceId = data.voice_id;
    if (!voiceId) {
      throw this._error(TtsErrorCodes.PROVIDER_UNAVAILABLE, '[MossVoiceCreation] Clone response missing voice_id');
    }

    return new VoiceCloneResult({
      providerVoiceId: voiceId,
      model: this.cloneModel,
      asyncMode: true,
      taskId: voiceId,
      meta: {
        jobId: data.job_id || null,
        fileId,
        initialStatus: data.status || 'PENDING'
      }
    });
  }

  /**
   * 能力①：轮询克隆状态
   */
  async getCloneStatus(voiceId, credentials) {
    const apiKey = this._apiKey(credentials);
    if (!apiKey) throw this._error(TtsErrorCodes.CONFIG_ERROR, '[MossVoiceCreation] Missing API key for status poll');

    const data = await this._getJson(`${this.voiceEndpoint}/${voiceId}`, apiKey);

    switch (data.status) {
      case 'ACTIVE':
        return {
          status: 'completed',
          providerVoiceId: voiceId,
          voiceInfo: {
            voiceName: data.voice_name,
            transcriptionText: data.transcription_text,
            sourceType: data.source_type,
            createdAt: data.created_at,
            updatedAt: data.updated_at
          }
        };
      case 'FAILED':
        return { status: 'failed', providerVoiceId: voiceId, error: data.error || 'Voice clone failed' };
      case 'PENDING':
      default:
        return { status: 'pending', providerVoiceId: voiceId };
    }
  }

  /**
   * 能力②：指令生成预览（voice-generator API）
   * @param {Object} samplingParams - { model?, temperature?, topP?, topK? }，默认值由 Service 从 manifest 注入
   */
  async generatePreview(instruction, testText, samplingParams = {}, credentials) {
    const apiKey = this._apiKey(credentials);
    if (!apiKey) throw this._error(TtsErrorCodes.CONFIG_ERROR, '[MossVoiceCreation] Missing API key');
    if (!instruction) throw this._error(TtsErrorCodes.VALIDATION_ERROR, '[MossVoiceCreation] instruction is required');
    if (!testText) throw this._error(TtsErrorCodes.VALIDATION_ERROR, '[MossVoiceCreation] testText is required');

    const payload = {
      model: samplingParams.model || this.genModel,
      text: testText,
      instruction,
      sampling_params: {
        temperature: samplingParams.temperature,
        top_p: samplingParams.topP,
        top_k: samplingParams.topK
      },
      meta_info: true
    };

    const data = await this._postJson(this.speechEndpoint, payload, apiKey);

    const audioBase64 = data?.audio_data;
    if (!audioBase64) {
      throw this._error(TtsErrorCodes.PROVIDER_UNAVAILABLE, '[MossVoiceCreation] Response missing audio_data');
    }

    return this._decodeAndSave(audioBase64, {
      service: 'voicegen',
      text: testText,
      type: 'gen',
      creditCost: data?.usage?.credit_cost
    });
  }

  // ==================== 私有：HTTP 封装 ====================

  async _postJson(url, body, apiKey) {
    try {
      const resp = await axios.post(url, body, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        timeout: this.timeoutMs,
        responseType: 'json'
      });
      return resp.data;
    } catch (e) {
      throw this._mapHttpError(e);
    }
  }

  async _getJson(url, apiKey, timeoutMs) {
    try {
      const resp = await axios.get(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: timeoutMs || 15000
      });
      return resp.data;
    } catch (e) {
      throw this._mapHttpError(e);
    }
  }

  /**
   * 上传音频文件 → file_id（multipart，单独封装因 FormData header 特殊）
   */
  async _uploadFile(file, apiKey) {
    const form = new FormData();
    form.append('file', fs.createReadStream(file.path), {
      filename: file.originalname || 'voice_sample.wav',
      contentType: file.mimetype || 'audio/wav'
    });

    let data;
    try {
      const resp = await axios.post(this.uploadEndpoint, form, {
        headers: { ...form.getHeaders(), Authorization: `Bearer ${apiKey}` },
        timeout: this.timeoutMs,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });
      data = resp.data;
    } catch (e) {
      throw this._mapHttpError(e);
    }

    if (!data.file_id) {
      throw this._error(TtsErrorCodes.PROVIDER_UNAVAILABLE, '[MossVoiceCreation] Upload response missing file_id');
    }
    return data.file_id;
  }
}

module.exports = MossVoiceCreationAdapter;
