/**
 * VoiceRegistrationRegistry - 音色注册适配器注册表
 *
 * 映射 providerKey → VoiceRegistrationPort 实现。
 * Service 层只管向 Registry 要 Adapter，不关心具体类名。
 * 对标 ProviderRegistry，但与 TTS 合成链路解耦。
 */
const VoiceRegistrationPort = require('./port/VoiceRegistrationPort');

class VoiceRegistrationRegistry {
  constructor() {
    this.adapters = new Map();
  }

  /**
   * 注册 Adapter 实例
   * @param {string} providerKey - 例如 'moss', 'aliyun'
   * @param {VoiceRegistrationPort} adapterInstance
   */
  register(providerKey, adapterInstance) {
    if (!(adapterInstance instanceof VoiceRegistrationPort)) {
      throw new Error(`Adapter for ${providerKey} must implement VoiceRegistrationPort`);
    }
    this.adapters.set(providerKey, adapterInstance);
  }

  /**
   * 获取 Adapter 实例
   * @param {string} providerKey
   * @returns {VoiceRegistrationPort}
   */
  get(providerKey) {
    const adapter = this.adapters.get(providerKey);
    if (!adapter) {
      throw new Error(`[VoiceRegistrationRegistry] No registration adapter found for provider: ${providerKey}`);
    }
    return adapter;
  }

  has(providerKey) {
    return this.adapters.has(providerKey);
  }

  /**
   * 获取所有支持音色克隆的 provider
   * @returns {string[]}
   */
  getSupportedProviders() {
    return Array.from(this.adapters.keys());
  }
}

module.exports = VoiceRegistrationRegistry;
