/**
 * TTS Domain Layer - Index
 * 导出所有领域层组件
 */

const SynthesisRequest = require('./SynthesisRequest');
const AudioResult = require('./AudioResult');
const TtsSynthesisService = require('./TtsSynthesisService');
const TtsValidationService = require('./TtsValidationService');

module.exports = {
  // Value Objects
  SynthesisRequest,
  AudioResult,

  // Domain Services
  TtsSynthesisService,
  TtsValidationService
};