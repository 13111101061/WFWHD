/**
 * ResolvedTtsContext - TTS 解析上下文 [已废弃]
 *
 * @deprecated 当前未接入主链路，无实际使用。
 *             VoiceResolver 直接输出 plain Object 即可满足需求。
 *             保留空壳防止遗留代码报错。
 */

class ResolvedTtsContext {
  constructor(resolvedData = {}) {
    // 服务标识
    this.providerKey = resolvedData.providerKey || '';
    this.serviceKey = resolvedData.serviceKey || '';
    this.adapterKey = resolvedData.adapterKey || '';

    // 音色信息
    this.voiceCode = resolvedData.voiceCode || null;
    this.systemId = resolvedData.systemId || null;
    this.voiceId = resolvedData.voiceId || '';

    // 运行时配置
    this.voiceRuntime = resolvedData.voiceRuntime || {};
    this.runtimeOptions = resolvedData.runtimeOptions || {};

    // 校验结果（由后续层填充）
    this.capabilityValidation = null;
    this.parameterMapping = null;
  }

  /**
   * 从 VoiceResolver.resolve() 的输出创建上下文
   * @param {Object} resolved - VoiceResolver 的输出
   * @returns {ResolvedTtsContext}
   */
  static fromResolverOutput(resolved) {
    return new ResolvedTtsContext({
      providerKey: resolved.providerKey,
      serviceKey: resolved.serviceKey,
      adapterKey: resolved.adapterKey,
      voiceCode: resolved.voiceCode,
      systemId: resolved.systemId,
      voiceId: resolved.voiceId,
      voiceRuntime: resolved.voiceRuntime,
      runtimeOptions: resolved.runtimeOptions
    });
  }

  /**
   * 设置能力校验结果
   * @param {Object} result - { valid, errors, warnings }
   */
  setCapabilityValidation(result) {
    this.capabilityValidation = {
      valid: result.valid,
      errors: result.errors || [],
      warnings: result.warnings || []
    };
    return this;
  }

  /**
   * 设置参数转译结果
   * @param {Object} result - { mapped, skipped, defaults }
   */
  setParameterMapping(result) {
    this.parameterMapping = {
      mapped: result.mapped || {},
      skipped: result.skipped || [],
      defaults: result.defaults || []
    };
    return this;
  }

  /**
   * 获取最终的运行时参数
   * @returns {Object}
   */
  getFinalOptions() {
    if (this.parameterMapping && this.parameterMapping.mapped) {
      return this.parameterMapping.mapped;
    }
    return this.runtimeOptions;
  }

  /**
   * 检查是否通过能力校验
   * @returns {boolean}
   */
  isCapabilityValid() {
    return this.capabilityValidation ? this.capabilityValidation.valid : true;
  }

  /**
   * 获取所有校验错误
   * @returns {string[]}
   */
  getValidationErrors() {
    const errors = [];
    if (this.capabilityValidation && this.capabilityValidation.errors) {
      errors.push(...this.capabilityValidation.errors);
    }
    return errors;
  }

  /**
   * 获取所有校验警告
   * @returns {string[]}
   */
  getValidationWarnings() {
    const warnings = [];
    if (this.capabilityValidation && this.capabilityValidation.warnings) {
      warnings.push(...this.capabilityValidation.warnings);
    }
    return warnings;
  }

  /**
   * 转换为 JSON（用于日志和调试）
   * @returns {Object}
   */
  toJSON() {
    return {
      service: {
        provider: this.providerKey,
        service: this.serviceKey,
        adapter: this.adapterKey
      },
      voice: {
        voiceCode: this.voiceCode,
        systemId: this.systemId,
        voiceId: this.voiceId
      },
      validation: {
        capability: this.capabilityValidation,
        parameter: this.parameterMapping
      }
    };
  }
}

module.exports = {
  ResolvedTtsContext
};
