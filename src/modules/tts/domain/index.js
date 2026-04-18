/**
 * TTS Domain Layer - Index
 * 导出所有领域层组件
 */

const SynthesisRequest = require('./SynthesisRequest');
const AudioResult = require('./AudioResult');
const { TtsSynthesisService } = require('./TtsSynthesisService');
const TtsValidationService = require('./TtsValidationService');
const { ResolvedTtsContext } = require('./ResolvedTtsContext');
const { CapabilityValidator } = require('./CapabilityValidator');

module.exports = {
  // Value Objects
  SynthesisRequest,
  AudioResult,
  ResolvedTtsContext,

  // Domain Services
  TtsSynthesisService,
  TtsValidationService,
  CapabilityValidator
};