/**
 * TtsValidationService - 验证服务
 * 纯验证逻辑，无副作用
 *
 * 参数范围校验委托给 CompiledCapability（服务商感知）。
 * 此处只保留文本结构校验和通用兜底。
 */
class TtsValidationService {
  constructor() {
    this.maxTextLength = 10000;
    this.invalidCharsPattern = /[<>{}[\]\\]/g;
  }

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
   * 参数校验（通用兜底，不感知服务商）
   * 服务商感知的参数范围校验由 CompiledCapability.validate() 执行。
   */
  validateOptions(options = {}) {
    const errors = [];
    const normalized = { ...options };

    // 不再做硬编码的范围校验
    // 服务商范围各不相同（如 tencent speed:-2~6, minimax volume:0~1），由 domain 层校验

    return { valid: errors.length === 0, errors, normalized };
  }

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