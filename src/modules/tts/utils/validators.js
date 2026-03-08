/**
 * TTS 参数验证工具
 * 集中管理所有 TTS 相关参数验证逻辑
 */

const TtsException = require('../core/TtsException');

/**
 * 验证文本参数
 * @param {string} text - 要验证的文本
 * @param {Object} options - 验证选项
 * @returns {boolean} 验证结果
 * @throws {TtsException} 验证失败时抛出
 */
function validateText(text, options = {}) {
  const { maxLength = 10000, allowEmpty = false } = options;
  
  if (text === undefined || text === null) {
    throw TtsException.BadRequest('Text parameter is required');
  }
  
  if (typeof text !== 'string') {
    throw TtsException.BadRequest('Text must be a string');
  }
  
  if (!allowEmpty && text.trim().length === 0) {
    throw TtsException.BadRequest('Text cannot be empty');
  }
  
  if (text.length > maxLength) {
    throw TtsException.BadRequest(`Text length must not exceed ${maxLength} characters`);
  }
  
  return true;
}

/**
 * 验证语速参数
 * @param {number} speed - 语速值
 * @param {Object} providerLimits - 提供商特定限制
 * @returns {boolean}
 * @throws {TtsException}
 */
function validateSpeed(speed, providerLimits = null) {
  if (speed === undefined || speed === null) return true;
  
  const limits = providerLimits || { min: 0.5, max: 2.0 };
  
  if (typeof speed !== 'number') {
    throw TtsException.BadRequest(`Speed must be a number between ${limits.min} and ${limits.max}`);
  }
  
  if (speed < limits.min || speed > limits.max) {
    throw TtsException.BadRequest(`Speed must be between ${limits.min} and ${limits.max}`);
  }
  
  return true;
}

/**
 * 验证音调参数
 * @param {number} pitch - 音调值
 * @returns {boolean}
 * @throws {TtsException}
 */
function validatePitch(pitch) {
  if (pitch === undefined || pitch === null) return true;
  
  if (typeof pitch !== 'number' || pitch < 0.5 || pitch > 1.5) {
    throw TtsException.BadRequest('Pitch must be a number between 0.5 and 1.5');
  }
  
  return true;
}

/**
 * 验证音量参数
 * @param {number} volume - 音量值
 * @returns {boolean}
 * @throws {TtsException}
 */
function validateVolume(volume) {
  if (volume === undefined || volume === null) return true;
  
  if (typeof volume !== 'number' || volume < 0 || volume > 100) {
    throw TtsException.BadRequest('Volume must be a number between 0 and 100');
  }
  
  return true;
}

/**
 * 验证采样率
 * @param {number} sampleRate - 采样率
 * @returns {boolean}
 * @throws {TtsException}
 */
function validateSampleRate(sampleRate) {
  if (sampleRate === undefined || sampleRate === null) return true;
  
  const validRates = [8000, 16000, 22050, 24000, 32000, 44100, 48000];
  
  if (!validRates.includes(sampleRate)) {
    throw TtsException.BadRequest(`Invalid sample rate. Valid rates: ${validRates.join(', ')}`);
  }
  
  return true;
}

/**
 * 验证音频格式
 * @param {string} format - 音频格式
 * @returns {boolean}
 * @throws {TtsException}
 */
function validateFormat(format) {
  if (!format) return true;
  
  const validFormats = ['mp3', 'wav', 'pcm', 'flac'];
  
  if (!validFormats.includes(format.toLowerCase())) {
    throw TtsException.BadRequest(`Invalid format. Valid formats: ${validFormats.join(', ')}`);
  }
  
  return true;
}

/**
 * 验证音色ID
 * @param {string} voice - 音色ID
 * @returns {boolean}
 * @throws {TtsException}
 */
function validateVoice(voice) {
  if (!voice) return true;
  
  if (typeof voice !== 'string' || voice.trim().length === 0) {
    throw TtsException.BadRequest('Voice must be a non-empty string');
  }
  
  return true;
}

/**
 * 验证服务标识符
 * @param {string} service - 服务标识符
 * @returns {Object} { provider, serviceType }
 * @throws {TtsException}
 */
function validateServiceIdentifier(service) {
  if (!service) {
    throw TtsException.BadRequest('Service identifier is required');
  }
  
  if (typeof service !== 'string') {
    throw TtsException.BadRequest('Service must be a string');
  }
  
  const parts = service.split('_');
  
  if (parts.length === 1) {
    return { provider: parts[0], serviceType: null };
  }
  
  if (parts.length === 2) {
    return { provider: parts[0], serviceType: parts[1] };
  }
  
  throw TtsException.BadRequest('Invalid service identifier format. Expected: "provider" or "provider_serviceType"');
}

/**
 * 统一验证 TTS 请求参数
 * @param {Object} params - 请求参数
 * @param {boolean} strict - 是否严格模式（要求必须提供text）
 * @returns {Object} 验证结果 { valid: true, errors: [] }
 */
function validateTtsRequest(params, strict = true) {
  const errors = [];
  
  try {
    if (strict) {
      validateText(params.text);
    } else if (params.text !== undefined) {
      validateText(params.text);
    }
  } catch (err) {
    errors.push({ field: 'text', message: err.message });
  }
  
  try {
    validateVoice(params.voice);
  } catch (err) {
    errors.push({ field: 'voice', message: err.message });
  }
  
  try {
    validateSpeed(params.speed);
  } catch (err) {
    errors.push({ field: 'speed', message: err.message });
  }
  
  try {
    validatePitch(params.pitch);
  } catch (err) {
    errors.push({ field: 'pitch', message: err.message });
  }
  
  try {
    validateVolume(params.volume);
  } catch (err) {
    errors.push({ field: 'volume', message: err.message });
  }
  
  try {
    validateSampleRate(params.sample_rate);
  } catch (err) {
    errors.push({ field: 'sample_rate', message: err.message });
  }
  
  try {
    validateFormat(params.format);
  } catch (err) {
    errors.push({ field: 'format', message: err.message });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateText,
  validateSpeed,
  validatePitch,
  validateVolume,
  validateSampleRate,
  validateFormat,
  validateVoice,
  validateServiceIdentifier,
  validateTtsRequest
};
