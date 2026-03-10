/**
 * TtsValidationService - 验证服务
 * 纯验证逻辑，无副作用
 */
class TtsValidationService {
  constructor() {
    this.maxTextLength = 10000;
    this.invalidCharsPattern = /[<>{}[\]\\]/g;
  }

  /**
   * 验证文本内容
   * @param {string} text
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateText(text) {
    const errors = [];

    if (!text || typeof text !== 'string') {
      errors.push('Text must be a non-empty string');
      return { valid: false, errors };
    }

    if (text.trim().length === 0) {
      errors.push('Text cannot be empty');
    }

    if (text.length > this.maxTextLength) {
      errors.push(`Text too long, maximum ${this.maxTextLength} characters allowed`);
    }

    if (this.invalidCharsPattern.test(text)) {
      errors.push('Text contains invalid characters');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 验证合成选项
   * @param {Object} options
   * @returns {{ valid: boolean, errors: string[], normalized: Object }}
   */
  validateOptions(options = {}) {
    const errors = [];
    const normalized = { ...options };

    // 速度验证
    if (options.speed !== undefined) {
      if (typeof options.speed !== 'number' || options.speed < 0 || options.speed > 5.0) {
        errors.push('Speed must be between 0 and 5.0');
      }
    }

    // 音调验证
    if (options.pitch !== undefined) {
      if (typeof options.pitch !== 'number' || options.pitch < -12 || options.pitch > 12) {
        errors.push('Pitch must be between -12 and 12');
      }
    }

    // 音量验证
    if (options.volume !== undefined) {
      if (typeof options.volume !== 'number' || options.volume < 0 || options.volume > 100) {
        errors.push('Volume must be between 0 and 100');
      }
    }

    // 采样率验证
    if (options.sample_rate !== undefined) {
      const validRates = [8000, 16000, 22050, 24000, 32000, 44100, 48000];
      if (!validRates.includes(options.sample_rate)) {
        errors.push(`Invalid sample rate. Valid rates: ${validRates.join(', ')}`);
      }
    }

    // 格式验证
    if (options.format !== undefined) {
      const validFormats = ['mp3', 'wav', 'pcm', 'flac'];
      if (!validFormats.includes(options.format.toLowerCase())) {
        errors.push(`Invalid format. Valid formats: ${validFormats.join(', ')}`);
      }
    }

    return { valid: errors.length === 0, errors, normalized };
  }

  /**
   * 验证批量请求
   * @param {string[]} texts
   * @returns {{ valid: boolean, errors: string[], validTexts: string[] }}
   */
  validateBatchTexts(texts) {
    const errors = [];
    const validTexts = [];

    if (!Array.isArray(texts)) {
      return { valid: false, errors: ['Texts must be an array'], validTexts: [] };
    }

    if (texts.length === 0) {
      return { valid: false, errors: ['Texts array cannot be empty'], validTexts: [] };
    }

    if (texts.length > 10) {
      return { valid: false, errors: ['Maximum 10 texts allowed per batch request'], validTexts: [] };
    }

    texts.forEach((text, index) => {
      const validation = this.validateText(text);
      if (validation.valid) {
        validTexts.push(text);
      } else {
        errors.push(`Text at index ${index}: ${validation.errors.join(', ')}`);
      }
    });

    return { valid: errors.length === 0, errors, validTexts };
  }
}

module.exports = TtsValidationService;