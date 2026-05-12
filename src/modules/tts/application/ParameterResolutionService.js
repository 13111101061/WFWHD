/**
 * ParameterResolutionService - 参数解析服务
 *
 * 核心职责：按固定优先级合并参数
 *
 * 参数优先级（从低到高）：
 * 1. 平台默认值 (platform)
 * 2. 服务默认值 (service)
 * 3. 模型默认值 (model)
 * 4. 音色默认值 (voice)
 * 5. 用户输入值 (user)
 * 6. 锁定参数回写 (locked) - 最高优先级
 *
 * 实际执行委托 CompiledCapability.resolveParams()，
 * 不再自行遍历字段、不再依赖旧字典。
 */

class ParameterResolutionService {

  /**
   * 从能力上下文合并参数
   *
   * @param {Object} userOptions - 用户输入的参数
   * @param {Object} capabilityContext - CapabilityResolver 返回的上下文
   * @param {Object} voiceIdentity - VoiceResolver 返回的身份信息
   * @returns {ResolvedParameters}
   */
  mergeFromContext(userOptions, capabilityContext, voiceIdentity) {
    const compiled = capabilityContext.compiled;
    const providerVoiceId = voiceIdentity?.providerVoiceId;

    const { params: merged, warnings } = compiled.resolveParams(
      userOptions || {},
      { providerVoiceId }
    );

    const layerTrace = {};
    for (const key of Object.keys(compiled.getDefaults())) {
      layerTrace[key] = 'defaults';
    }
    for (const key of Object.keys(userOptions || {})) {
      if (merged[key] !== undefined) layerTrace[key] = 'user';
    }
    for (const key of Object.keys(compiled.getLockedParams())) {
      layerTrace[key] = 'locked';
    }

    return {
      parameters: merged,
      layers: layerTrace,
      lockedParams: Object.keys(compiled.getLockedParams()),
      warnings,
      filtered: warnings.filter(w => w.type === 'unsupported').map(w => ({
        param: w.param,
        value: w.value,
        reason: w.type
      }))
    };
  }

  /**
   * 提取 providerOptions
   * 从用户参数中提取不在 CompiledCapability schema 里的字段
   *
   * @param {Object} params - 参数对象
   * @param {Object} [context] - 能力上下文（包含 compiled）
   * @returns {Object}
   */
  extractProviderOptions(params, context = null) {
    if (context?.compiled) {
      const schema = context.compiled.getSchema();
      const knownParams = new Set(Object.keys(schema));
      knownParams.add('text');
      knownParams.add('providerOptions');

      const providerOptions = {};
      for (const [key, value] of Object.entries(params)) {
        if (!knownParams.has(key)) providerOptions[key] = value;
      }
      return providerOptions;
    }

    return {};
  }

  /**
   * 构建最终参数对象
   *
   * @param {Object} resolvedParams - 解析后的参数
   * @param {Object} [context] - 能力上下文
   * @returns {{ params: Object, warnings: Object[] }}
   */
  buildFinalParams(resolvedParams, context = null) {
    const { parameters, warnings } = resolvedParams;

    const extraProviderOptions = this.extractProviderOptions(parameters, context);

    const final = { ...parameters };

    if (Object.keys(extraProviderOptions).length > 0) {
      final.providerOptions = {
        ...(parameters.providerOptions || {}),
        ...extraProviderOptions
      };

      for (const key of Object.keys(extraProviderOptions)) {
        delete final[key];
      }
    }

    return { params: final, warnings: warnings || [] };
  }
}

const parameterResolutionService = new ParameterResolutionService();

module.exports = {
  ParameterResolutionService,
  parameterResolutionService
};