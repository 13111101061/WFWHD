/**
 * MossVoiceRegistrationAdapter - Moss 音色克隆适配器
 *
 * 实现 VoiceRegistrationPort，对接 Moss Voice Clone API (v1)。
 * Moss 是两步式异步克隆引擎：
 *   1. POST /api/v1/files/upload  → 上传音频，返回 file_id
 *   2. POST /api/v1/voice/clone    → 创建 clone，返回 voice_id + status:PENDING
 *   3. GET  /api/v1/voices/{vid}   → 轮询直到 ACTIVE 或 FAILED
 */
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const VoiceRegistrationPort = require('../port/VoiceRegistrationPort');
const VoiceCloneResult = require('../dto/VoiceCloneResult');

class MossVoiceRegistrationAdapter extends VoiceRegistrationPort {
  constructor(config = {}) {
    super();
    this.baseUrl = config.baseUrl
      || process.env.MOSS_BASE_URL
      || 'https://studio.mosi.cn';
    this.uploadEndpoint = config.uploadEndpoint || `${this.baseUrl}/api/v1/files/upload`;
    this.cloneEndpoint = config.cloneEndpoint || `${this.baseUrl}/api/v1/voice/clone`;
    this.voiceEndpoint = config.voiceEndpoint || `${this.baseUrl}/api/v1/voices`;
    this.timeoutMs = config.timeoutMs || 30000;
    this._credentials = config.credentials || null;
  }

  /**
   * 注册音色（两阶段：上传 → 创建克隆）
   * @returns {Promise<VoiceCloneResult>} asyncMode 始终为 true
   */
  async registerVoice(file, metadata, credentials) {
    const apiKey = credentials?.apiKey
      || (this._credentials ? this._credentials.getCredentials('moss')?.apiKey : null);

    if (!apiKey) {
      throw new Error('[MossVoiceRegistration] Missing API key');
    }
    if (!file || !file.path) {
      throw new Error('[MossVoiceRegistration] Invalid file object: missing path');
    }

    // ==== Step 1: 上传音频文件 → file_id ====
    const fileId = await this._uploadFile(file, apiKey);

    // ==== Step 2: 创建 Voice Clone → voice_id + PENDING ====
    const authHeader = { 'Authorization': `Bearer ${apiKey}` };

    const cloneBody = { file_id: fileId };
    if (metadata.transcriptionText) {
      cloneBody.text = metadata.transcriptionText;
    }

    const cloneResponse = await axios.post(this.cloneEndpoint, cloneBody, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeader
      },
      timeout: this.timeoutMs
    });

    const data = cloneResponse.data;
    const voiceId = data.voice_id;
    const status = data.status || 'PENDING';

    if (!voiceId) {
      throw new Error(
        `[MossVoiceRegistration] Clone response missing voice_id. ` +
        `Got: ${JSON.stringify(Object.keys(data))}`
      );
    }

    // 如果有 job_id 也保留
    const jobId = data.job_id || null;

    return new VoiceCloneResult({
      providerVoiceId: voiceId,
      model: 'moss-tts',
      asyncMode: true,                  // Moss 始终异步
      taskId: voiceId,                  // voice_id 就是轮询 key
      meta: {
        jobId,
        fileId,
        initialStatus: status
      }
    });
  }

  /**
   * 轮询音色克隆状态
   * @param {string} voiceId - 克隆返回的 voice_id
   * @param {Object} credentials - { apiKey }
   * @returns {Promise<{ status: 'pending'|'completed'|'failed', providerVoiceId: string, error?: string, voiceInfo?: Object }>}
   */
  async getCloneStatus(voiceId, credentials) {
    const apiKey = credentials?.apiKey
      || (this._credentials ? this._credentials.getCredentials('moss')?.apiKey : null);

    if (!apiKey) {
      throw new Error('[MossVoiceRegistration] Missing API key for status poll');
    }

    const response = await axios.get(`${this.voiceEndpoint}/${voiceId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 15000
    });

    const data = response.data;
    const status = data.status;

    switch (status) {
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
        return {
          status: 'failed',
          providerVoiceId: voiceId,
          error: data.error || 'Voice clone failed'
        };
      case 'PENDING':
      default:
        return {
          status: 'pending',
          providerVoiceId: voiceId
        };
    }
  }

  // ==== 私有方法 ====

  /**
   * 上传音频文件到 Moss
   * @returns {Promise<string>} file_id
   */
  async _uploadFile(file, apiKey) {
    const form = new FormData();
    form.append('file', fs.createReadStream(file.path), {
      filename: file.originalname || 'voice_sample.wav',
      contentType: file.mimetype || 'audio/wav'
    });

    const response = await axios.post(this.uploadEndpoint, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: this.timeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    const fileId = response.data.file_id;
    if (!fileId) {
      throw new Error(
        `[MossVoiceRegistration] Upload response missing file_id. ` +
        `Got: ${JSON.stringify(Object.keys(response.data))}`
      );
    }

    return fileId;
  }
}

module.exports = MossVoiceRegistrationAdapter;
