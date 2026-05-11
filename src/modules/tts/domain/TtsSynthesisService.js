/**
 * TtsSynthesisService - TTS合成领域服务
 *
 * 核心职责：
 * - 编排TTS合成流程
 * - 验证 → 解析音色 → 能力校验 → 参数合并 → 参数映射 → 调用Provider
 *
 * 调用链：
 * 1. VoiceResolver 解析身份 → VoiceIdentity
 * 2. CapabilityResolver 获取能力上下文 → CapabilityContext
 * 3. ParameterResolutionService 合并参数 → 平台标准参数
 * 4. ParameterMapper 映射参数 → 服务商参数
 * 5. ProviderAdapter 调用 API
 *
 * 所有依赖通过构造函数注入，消除 setter 时间耦合。
 * 限流/熔断/重试/超时 → 委托 ExecutionPolicy。
 */

const { VoiceResolver } = require('../application/VoiceResolver');
const { ProviderDescriptorRegistry } = require('../provider-management/ProviderDescriptorRegistry');
const { ExecutionPolicy } = require('../infrastructure/ExecutionPolicy');

class TtsSynthesisService {
  /**
   * @param {Object} deps
   * @param {Object} deps.ttsProvider - TTS提供者端口
   * @param {Object} deps.voiceCatalog - 音色目录端口
   * @param {Object} deps.validator - 验证服务
   * @param {Object} deps.capabilityResolver - 能力解析器
   * @param {Object} deps.parameterResolutionService - 参数解析服务
   * @param {Object} deps.parameterMapper - 参数映射器
   * @param {Object} deps.executionPolicy - 执行策略 (可选)
   */
  constructor({
    ttsProvider,
    voiceCatalog,
    validator,
    capabilityResolver = null,
    parameterResolutionService = null,
    parameterMapper = null,
    executionPolicy = null
  }) {
    this.ttsProvider = ttsProvider;
    this.voiceCatalog = voiceCatalog;
    this.validator = validator;
    this.capabilityResolver = capabilityResolver;
    this.parameterResolutionService = parameterResolutionService;
    this.parameterMapper = parameterMapper;
    this.executionPolicy = executionPolicy || new ExecutionPolicy();

    this.metrics = {
      credentialErrors: 0,
      audioSaveErrors: 0,
      capabilityValidationFailures: 0,
      parameterMappingErrors: 0
    };
  }

  // ==================== 核心合成 ====================

  /**
   * 执行TTS合成
   */
  async synthesize(request) {
    const SynthesisRequest = require('./SynthesisRequest');
    const sr = request instanceof SynthesisRequest ? request : SynthesisRequest.fromJSON(request);

    // 1. 验证请求
    this._validateRequest(sr);

    // 2. 解析服务标识
    const { resolvedRequest, voiceIdentity } = await this._resolveServiceIdentifier(sr);
    const resolvedServiceKey = this._buildServiceKey(resolvedRequest);

    // 3. 委托 ExecutionPolicy 执行（限流/熔断/重试/超时）
    const warnings = [];
    const result = await this.executionPolicy.execute(resolvedServiceKey, async () => {
      return this._doSynthesize(resolvedRequest, voiceIdentity);
    });

    // 3.5 收集新链路上的内部 warnings，同步更新校验失败计数
    if (result._warnings) {
      warnings.push(...result._warnings);
      if (result._warnings.length > 0) {
        this.metrics.capabilityValidationFailures++;
      }
      delete result._warnings;
    }

    // 4. 构建结果
    const AudioResult = require('./AudioResult');
    const audioResult = AudioResult.fromServiceResult(result, {
      provider: resolvedRequest.provider,
      serviceType: resolvedRequest.serviceType,
      text: resolvedRequest.text,
      latency: 0
    });

    // 5. 附上 warnings
    if (warnings.length > 0) {
      audioResult.warnings = warnings;
    }

    return audioResult;
  }

  /**
   * 实际合成逻辑（在 ExecutionPolicy 保护下执行）
   */
  async _doSynthesize(resolvedRequest, voiceIdentity) {
    return this._synthesizeWithNewChain(resolvedRequest, voiceIdentity);
  }

  /**
   * 新调用链
   */
  async _synthesizeWithNewChain(resolvedRequest, voiceIdentity) {
    // 1. 解析身份（如有缓存则复用）
    const identity = voiceIdentity || VoiceResolver.resolve({
      text: resolvedRequest.text,
      service: resolvedRequest.service,
      voiceCode: resolvedRequest.voiceCode,
      systemId: resolvedRequest.systemId,
      options: resolvedRequest.options
    });

    // 2. 获取能力上下文
    const capabilityContext = this.capabilityResolver.resolve(
      identity.serviceKey,
      identity.modelKey,
      identity.voiceRuntime
    );

    // 3. 参数合并
    const resolvedParams = this.parameterResolutionService.mergeFromContext(
      resolvedRequest.options,
      capabilityContext,
      identity
    );

    // 4. 清理元数据字段（使用 CompiledCapability schema 动态判断，不再硬编码字段列表）
    const cleanParams = this._cleanProviderParams(resolvedParams.parameters, capabilityContext);

    // 5. 构建最终参数
    const buildResult = this.parameterResolutionService.buildFinalParams({
      parameters: cleanParams,
      warnings: resolvedParams.warnings,
      lockedParams: resolvedParams.lockedParams,
      filtered: resolvedParams.filtered
    }, capabilityContext);
    const finalParams = buildResult.params;

    // 5.5 收集参数解析链路上的 warnings
    const chainWarnings = [];
    if (resolvedParams.warnings?.length) {
      chainWarnings.push(...resolvedParams.warnings);
    }
    if (buildResult.warnings?.length) {
      chainWarnings.push(...buildResult.warnings);
    }

    // 6. 合并 providerOptions
    if (capabilityContext.providerOptions && Object.keys(capabilityContext.providerOptions).length > 0) {
      finalParams.providerOptions = {
        ...(finalParams.providerOptions || {}),
        ...capabilityContext.providerOptions
      };
    }

    // 7. 映射到 Provider 参数
    const providerParams = await this._translateParameters(
      identity.serviceKey,
      finalParams,
      { providerVoiceId: identity.providerVoiceId }
    );

    // 8. 调用 Provider
    const serviceType = this._extractServiceType(identity.serviceKey);
    const providerResult = await this.ttsProvider.synthesize(
      identity.providerKey,
      serviceType,
      resolvedRequest.text,
      providerParams
    );

    if (chainWarnings.length > 0) {
      providerResult._warnings = chainWarnings;
    }

    return providerResult;
  }

  /**
   * 批量合成
   */
  async batchSynthesize(requests) {
    const results = [];
    const errors = [];
    for (let i = 0; i < requests.length; i++) {
      try {
        const result = await this.synthesize(requests[i]);
        results.push({
          index: i, success: true, data: result,
          warnings: result.warnings || undefined
        });
      } catch (error) {
        errors.push({ index: i, success: false, error: error.message, code: error.code });
      }
    }
    return { results, errors };
  }

  // ==================== 健康/统计 ====================

  async getHealthStatus() {
    const providerHealth = await this.ttsProvider.getHealthStatus();
    const policyHealth = this.executionPolicy.getHealthStatus();
    return {
      overall: policyHealth.overall === 'degraded' ? 'degraded' : providerHealth?.overall || 'healthy',
      provider: providerHealth,
      circuitBreakers: policyHealth.circuitBreakers,
      timestamp: new Date().toISOString()
    };
  }

  getStats() {
    const policyStats = this.executionPolicy.getStats();
    return {
      ...policyStats,
      errorBreakdown: {
        ...policyStats.errorBreakdown,
        credentialErrors: this.metrics.credentialErrors,
        audioSaveErrors: this.metrics.audioSaveErrors,
        capabilityValidationFailures: this.metrics.capabilityValidationFailures,
        parameterMappingErrors: this.metrics.parameterMappingErrors
      },
      timestamp: new Date().toISOString()
    };
  }

  resetStats() {
    this.executionPolicy.resetStats();
    this.metrics = {
      credentialErrors: 0,
      audioSaveErrors: 0,
      capabilityValidationFailures: 0,
      parameterMappingErrors: 0
    };
    console.log('📊 TTS服务统计已重置');
  }

  // ==================== 私有方法 ====================

  _validateRequest(request) {
    const baseValidation = request.validate();
    if (!baseValidation.valid) {
      const error = new Error(baseValidation.errors.join('; '));
      error.code = 'VALIDATION_ERROR';
      error.errors = baseValidation.errors;
      throw error;
    }
    if (request.text && this.validator) {
      const textValidation = this.validator.validateText(request.text);
      if (!textValidation.valid) {
        const error = new Error(textValidation.errors.join('; '));
        error.code = 'VALIDATION_ERROR';
        error.errors = textValidation.errors;
        throw error;
      }
    }
  }

  async _resolveServiceIdentifier(request) {
    const resolveInput = {
      text: request.text,
      service: request.service,
      options: request.options
    };

    if (request.voiceCode) {
      resolveInput.voiceCode = request.voiceCode;
    } else if (request.systemId) {
      resolveInput.systemId = request.systemId;
    } else {
      resolveInput.voice = request.options?.voice || request.options?.voiceId;
      resolveInput.voiceId = request.options?.voiceId;
    }

    try {
      const resolved = VoiceResolver.resolve(resolveInput);
      const serviceType = this._extractServiceType(resolved.serviceKey);
      const SynthesisRequest = require('./SynthesisRequest');
      const resolvedRequest = new SynthesisRequest({
        text: request.text, service: request.service,
        voiceCode: resolved.voiceCode, systemId: resolved.systemId,
        provider: resolved.providerKey, serviceType,
        options: { ...request.options, voice: resolved.providerVoiceId, voiceId: resolved.providerVoiceId }
      });
      return { resolvedRequest, voiceIdentity: resolved };
    } catch (error) {
      if (!error.code) error.code = 'VOICE_NOT_FOUND';
      throw error;
    }
  }

  _buildServiceKey(request) {
    if (request.provider && request.serviceType) return `${request.provider}_${request.serviceType}`;
    if (request.service) return request.service;
    return 'default';
  }

  _extractServiceType(serviceKey) {
    if (!serviceKey) return 'default';
    const descriptor = ProviderDescriptorRegistry.get(serviceKey);
    const canonicalKey = descriptor?.key || ProviderDescriptorRegistry.resolveCanonicalKey(serviceKey) || serviceKey;
    const providerKey = descriptor?.provider || canonicalKey.split('_')[0];
    const prefix = `${providerKey}_`;
    if (canonicalKey.startsWith(prefix) && canonicalKey.length > prefix.length) return canonicalKey.slice(prefix.length);
    if (!canonicalKey.includes('_')) return canonicalKey;
    return canonicalKey.split('_').slice(1).join('_');
  }

  _cleanProviderParams(params, capabilityContext) {
    const schema = capabilityContext?.compiled?.getSchema();
    if (!schema) return params; // 无 compiled schema 时不过滤
    const validKeys = new Set(Object.keys(schema));
    const cleaned = {};
    for (const [key, value] of Object.entries(params)) {
      if (!validKeys.has(key) || value === undefined || value === null) continue;
      cleaned[key] = value;
    }
    return cleaned;
  }

  async _translateParameters(serviceKey, platformParams, context = {}) {
    if (!this.parameterMapper) {
      console.warn(`[TtsSynthesisService] No parameter mapper, using raw params for ${serviceKey}`);
      return platformParams;
    }
    try {
      return this.parameterMapper.mapToProvider(serviceKey, platformParams, context);
    } catch (error) {
      this.metrics.parameterMappingErrors++;
      if (!error.code) error.code = 'PARAMETER_MAPPING_ERROR';
      throw error;
    }
  }
}

module.exports = { TtsSynthesisService };
