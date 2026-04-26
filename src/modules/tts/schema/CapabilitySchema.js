/**
 * CapabilitySchema - 平台级能力定义
 *
 * 只保留平台级常量和模型定义。
 * 服务级能力定义已迁移到 manifests/<provider>/manifest.json。
 */

const { ProviderManifest } = require('../providers/manifests/ProviderManifest');

const CapabilitySchema = {

  platform: {
    defaultSampleRate: 24000,
    defaultFormat: 'wav',
    maxTextLength: 10000,
    supportedFormats: ['wav', 'mp3', 'pcm', 'flac'],
    supportedSampleRates: [8000, 16000, 22050, 24000, 32000, 44100]
  },

  models: {
    'qwen3-tts-instruct-flash-realtime': {
      displayName: 'Qwen3 TTS Instruct Flash Realtime',
      serviceKey: 'aliyun_qwen_http',
      capabilities: { highQuality: false, lowLatency: true },
      defaults: {},
      parameters: {}
    },
    'moss-tts': {
      displayName: 'MOSS TTS',
      serviceKey: 'moss_tts',
      capabilities: { highQuality: true, samplingControl: true },
      defaults: { samplingParams: { temperature: 1.7, topP: 0.8, topK: 25 } },
      parameters: {}
    },
    'speech-01-hd-preview': {
      displayName: 'MiniMax Speech-01 HD Preview',
      serviceKey: 'minimax_tts',
      capabilities: { highQuality: true, emotionSupport: true },
      defaults: {},
      parameters: {}
    }
  }
};

function getServiceCapabilities(serviceKey) {
  // manifest 是唯一来源
  return ProviderManifest.getCapabilityConfig(serviceKey) || null;
}

function getModelCapabilities(modelKey) {
  return CapabilitySchema.models[modelKey] || null;
}

function getPlatformDefaults() {
  return {
    speed: 1.0, pitch: 1.0, volume: 50,
    format: CapabilitySchema.platform.defaultFormat,
    sampleRate: CapabilitySchema.platform.defaultSampleRate
  };
}

function isParameterSupported(serviceKey, paramName) {
  const service = getServiceCapabilities(serviceKey);
  if (!service || !service.parameters) return false;
  const p = service.parameters[paramName];
  if (!p) return false;
  return p.status !== 'unsupported';
}

function getLockedParamsForService(serviceKey) {
  const service = getServiceCapabilities(serviceKey);
  return service?.lockedParams || ['voice', 'model'];
}

function getServiceDefaults(serviceKey) {
  const service = getServiceCapabilities(serviceKey);
  return service?.defaults || {};
}

function getDefaultVoiceId(serviceKey) {
  const service = getServiceCapabilities(serviceKey);
  return service?.defaultVoiceId || null;
}

function getParameterConfig(serviceKey, paramName) {
  const service = getServiceCapabilities(serviceKey);
  if (!service?.parameters) return null;
  return service.parameters[paramName] || null;
}

function getAllServiceKeys() {
  return ProviderManifest.getAllServiceKeys();
}

function getAllModelKeys() {
  return Object.keys(CapabilitySchema.models);
}

function getServiceKeyByModel(modelKey) {
  const model = CapabilitySchema.models[modelKey];
  return model?.serviceKey || null;
}

module.exports = {
  CapabilitySchema,
  getServiceCapabilities,
  getModelCapabilities,
  getPlatformDefaults,
  isParameterSupported,
  getLockedParamsForService,
  getServiceDefaults,
  getDefaultVoiceId,
  getParameterConfig,
  getAllServiceKeys,
  getAllModelKeys,
  getServiceKeyByModel
};
