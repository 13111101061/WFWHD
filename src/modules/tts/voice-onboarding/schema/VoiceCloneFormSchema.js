/**
 * VoiceCloneFormSchema - 音色克隆表单校验
 *
 * 补充 VoiceFormSchema：校验上传文件、provider 是否支持克隆、配置限制。
 */

const VALID_GENDERS = ['male', 'female', 'neutral'];
const VALID_AUDIO_MIMETYPES = new Set([
  'audio/wav', 'audio/x-wav', 'audio/wave',
  'audio/mpeg', 'audio/mp3',
  'audio/mp4', 'audio/x-m4a',
  'audio/flac',
  'audio/ogg'
]);

const VoiceCloneFormSchema = {
  /**
   * 校验克隆表单 + 文件
   * @param {Object} body - req.body
   * @param {Object} file - req.file (multer)
   * @param {Object} cloningConfig - manifest voiceCloningConfig
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  validate(body, file, cloningConfig) {
    const errors = [];
    const warnings = [];

    if (!body.providerKey && !body.provider) {
      errors.push('providerKey is required');
    }
    if (!body.displayName || typeof body.displayName !== 'string' || body.displayName.trim().length === 0) {
      errors.push('displayName is required and must be a non-empty string');
    }
    if (!VALID_GENDERS.includes(body.gender)) {
      errors.push(`gender must be one of: ${VALID_GENDERS.join(', ')}`);
    }

    if (body.tags && !Array.isArray(body.tags)) {
      errors.push('tags must be an array');
    }
    if (body.languages && !Array.isArray(body.languages)) {
      errors.push('languages must be an array');
    }

    // 文件校验
    if (!file) {
      errors.push('audioFile is required');
    } else {
      if (!file.path) {
        errors.push('uploaded file has no path');
      }
      if (!VALID_AUDIO_MIMETYPES.has(file.mimetype)) {
        errors.push(`unsupported audio format: ${file.mimetype}. Supported: wav, mp3, m4a, flac, ogg`);
      }

      // 跟 manifest 配置比对
      if (cloningConfig) {
        const maxSizeBytes = (cloningConfig.maxAudioSizeMb || 10) * 1024 * 1024;
        if (file.size > maxSizeBytes) {
          errors.push(`audio file too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${cloningConfig.maxAudioSizeMb}MB)`);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
};

module.exports = VoiceCloneFormSchema;
