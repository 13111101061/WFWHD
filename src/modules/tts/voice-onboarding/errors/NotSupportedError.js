/**
 * NotSupportedError - Provider 能力不支持错误
 *
 * 当某个 Provider 未实现 VoiceCreationPort 的某项能力（克隆/指令生成）时抛出。
 * 路由层据此返回清晰的 400/404，而非模糊的 500。
 *
 * 语义切分：
 *   - NotSupportedError → Provider 架构上不支持该能力（如腾讯不支持指令生成）
 *   - CONFIG_ERROR       → 支持该能力但 manifest/env 未配置（如缺 API Key）
 */
const { TtsErrorCodes } = require('../../TtsErrorCodes');

class NotSupportedError extends Error {
  /**
   * @param {string} providerKey - 如 'moss', 'tencent'
   * @param {string} capability  - 如 'cloneVoice', 'generatePreview'
   */
  constructor(providerKey, capability) {
    super(`Provider "${providerKey}" does not support capability: ${capability}`);
    this.name = 'NotSupportedError';
    this.code = TtsErrorCodes.CAPABILITY_NOT_SUPPORTED;
    this.providerKey = providerKey;
    this.capability = capability;
  }
}

module.exports = { NotSupportedError };
