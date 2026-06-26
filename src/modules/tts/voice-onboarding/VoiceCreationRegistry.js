/**
 * VoiceCreationRegistry - 音色创建统一注册表
 *
 * 取代旧的 VoiceRegistrationRegistry（仅克隆）+ 裸 voiceGenAdapters map（仅指令生成）。
 * 一个 Provider 注册一个 Adapter，能力（克隆/指令生成）按需声明于 manifest，
 * 通过能力路由方法 forClone() / forInstruction() 分发。
 *
 * 同时是 voice-onboarding 侧读取 manifest 配置（voiceCloningConfig /
 * voiceGenerationConfig / 能力开关）的唯一入口，吸收此前散落于
 * VoiceOnboardingService 与 VoiceCreationEnricher 的重复 _getGenerationConfig。
 *
 * 对标 ProviderManagementService，但与合成链路解耦。
 */
const { ProviderManifest } = require('../providers/manifests/ProviderManifest');
const { NotSupportedError } = require('./errors/NotSupportedError');

class VoiceCreationRegistry {
  constructor() {
    this.adapters = new Map();
  }

  /**
   * 注册 Adapter 实例
   * @param {import('./port/VoiceCreationPort')} adapter
   */
  register(adapter) {
    if (!adapter || typeof adapter.providerKey !== 'string') {
      throw new Error('[VoiceCreationRegistry] Adapter must expose a providerKey');
    }
    this.adapters.set(adapter.providerKey, adapter);
  }

  /**
   * 直接获取 Adapter（不做能力检查）
   */
  get(providerKey) {
    const adapter = this.adapters.get(providerKey);
    if (!adapter) {
      throw new Error(`[VoiceCreationRegistry] No adapter registered for provider: ${providerKey}`);
    }
    return adapter;
  }

  has(providerKey) {
    return this.adapters.has(providerKey);
  }

  /**
   * 能力路由：克隆。Provider 必须在 manifest 声明 supportsVoiceCloning。
   */
  forClone(providerKey) {
    const adapter = this.get(providerKey);
    if (!this.supportsClone(providerKey)) {
      throw new NotSupportedError(providerKey, 'cloneVoice');
    }
    return adapter;
  }

  /**
   * 能力路由：指令生成。Provider 必须在 manifest 声明 supportsInstructionGen。
   */
  forInstruction(providerKey) {
    const adapter = this.get(providerKey);
    if (!this.supportsInstruction(providerKey)) {
      throw new NotSupportedError(providerKey, 'generatePreview');
    }
    return adapter;
  }

  // ==================== 能力查询（manifest 驱动） ====================

  supportsClone(providerKey) {
    return this._readCapability(providerKey, 'supportsVoiceCloning');
  }

  supportsInstruction(providerKey) {
    return this._readCapability(providerKey, 'supportsInstructionGen');
  }

  getSupportedCloneProviders() {
    return this._registered().filter(p => this.supportsClone(p));
  }

  getSupportedInstructionProviders() {
    return this._registered().filter(p => this.supportsInstruction(p));
  }

  // ==================== manifest 配置读取（唯一入口） ====================

  /**
   * 读取克隆配置（testPhrases / 文件约束等）
   */
  getCloningConfig(providerKey) {
    return this._getProviderServiceConfig(providerKey)?.voiceCloningConfig || null;
  }

  /**
   * 读取指令生成配置（model / samplingDefaults / testPhrases）
   */
  getGenerationConfig(providerKey) {
    return this._getProviderServiceConfig(providerKey)?.voiceGenerationConfig || null;
  }

  // ==================== 内部 ====================

  _readCapability(providerKey, field) {
    return !!this._getProviderServiceConfig(providerKey)?.[field];
  }

  _getProviderServiceConfig(providerKey) {
    const serviceKey = ProviderManifest.getAllServiceKeys()
      .find(k => k.startsWith(`${providerKey}_`));
    return serviceKey ? ProviderManifest.getServiceConfig(serviceKey) : null;
  }

  _registered() {
    return Array.from(this.adapters.keys());
  }
}

module.exports = VoiceCreationRegistry;
