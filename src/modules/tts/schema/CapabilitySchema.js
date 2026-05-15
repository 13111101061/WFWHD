/**
 * CapabilitySchema - 平台级能力定义
 *
 * 只保留平台级不变常量和工具函数。
 * 服务/模型级能力定义已完全迁移到 ProviderManifest（manifest.json 是唯一事实源）。
 */

const { ProviderManifest } = require('../providers/manifests/ProviderManifest');

const CapabilitySchema = {

  platform: {
    defaultSampleRate: 24000,
    defaultFormat: 'wav',
    maxTextLength: 10000,
    supportedFormats: ['wav', 'mp3', 'pcm', 'flac'],
    supportedSampleRates: [8000, 16000, 22050, 24000, 32000, 44100]
  }

};

function getServiceCapabilities(serviceKey) {
  // manifest 是唯一来源
  return ProviderManifest.getCapabilityConfig(serviceKey) || null;
}

function getModelCapabilities(modelKey) {
  // 模型定义已迁移到 manifest parameters.model.default/lockedValue，不再维护硬编码表
  return null;
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
  const svc = ProviderManifest.getServiceConfig(serviceKey);
  return svc?.defaultVoiceId || null;
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
  // 模型定义已迁移到 manifest
  return [];
}

function getServiceKeyByModel(modelKey) {
  // 模型定义已迁移到 manifest
  return null;
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
