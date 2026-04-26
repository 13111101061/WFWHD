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
   * @param {Object} deps.queryService - 查询服务 (延迟注入)
   * @param {Object} deps.executionPolicy - 执行策略 (可选)
   */
  constructor({
    ttsProvider,
    voiceCatalog,
    validator,
    capabilityResolver = null,
    parameterResolutionService = null,
    parameterMapper = null,
    queryService = null,
    executionPolicy = null
  }) {
    this.ttsProvider = ttsProvider;
    this.voiceCatalog = voiceCatalog;
    this.validator = validator;
    this.capabilityResolver = capabilityResolver;
    this.parameterResolutionService = parameterResolutionService;
    this.parameterMapper = parameterMapper;
    this.queryService = queryService;
    this.executionPolicy = executionPolicy || new ExecutionPolicy();

    // TTS 特有指标（ExecutionPolicy 管理基本指标）
    this.metrics = {
      credentialErrors: 0,
      audioSaveErrors: 0,
      capabilityValidationFailures: 0,
      parameterMappingErrors: 0
    };
  }

  // ==================== 查询服务委托 ====================

  _ensureQueryService() {
    if (!this.queryService) {
      throw new Error('TtsQueryService not injected');
    }
  }

  queryVoices(filters)   { this._ensureQueryService(); return this.queryService.queryVoices(filters); }
  getFrontendCatalog()   { this._ensureQueryService(); return this.queryService.getFrontendCatalog(); }
  getVoice(voiceId)       { this._ensureQueryService(); return this.queryService.getVoice(voiceId); }
  getVoiceDetail(voiceId) { this._ensureQueryService(); return this.queryService.getVoiceDetail(voiceId); }
  getCapabilities(key)    { this._ensureQueryService(); return this.queryService.getCapabilities(key); }
  getFilterOptions()      { this._ensureQueryService(); return this.queryService.getFilterOptions(); }
  getFrontendVoices()     { this._ensureQueryService(); return this.queryService.getFrontendVoices(); }
  getVoices(p, s)          { this._ensureQueryService(); return this.queryService.getVoices(p, s); }
  getAllVoices()           { this._ensureQueryService(); return this.queryService.getAllVoices(); }
  getProviders()           { this._ensureQueryService(); return this.queryService.getProviders(); }

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

    // 2.5 检查用户输入中不支持的参数
    const warnings = [];
    if (this.capabilityResolver) {
      const userParamWarnings = this.capabilityResolver.checkUnsupportedInput(
        resolvedServiceKey,
        resolvedRequest.options || {}
      );
      warnings.push(...userParamWarnings);
    }

    // 3. 委托 ExecutionPolicy 执行（限流/熔断/重试/超时）
    const result = await this.executionPolicy.execute(resolvedServiceKey, async () => {
      return this._doSynthesize(resolvedRequest, voiceIdentity);
    });

    // 3.5 收集新链路上的内部 warnings
    if (result._warnings) {
      warnings.push(...result._warnings);
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
    // 新调用链
    if (this.capabilityResolver && this.parameterResolutionService) {
      return this._synthesizeWithNewChain(resolvedRequest, voiceIdentity);
    }

    // 旧调用链（向后兼容）
    const normalizedOptions = resolvedRequest.getNormalizedOptions();
    const adapterKey = `${resolvedRequest.provider}_${resolvedRequest.serviceType}`;
    this._validateCapabilitiesLegacy(adapterKey, normalizedOptions);
    const mappedOptions = await this._translateParameters(adapterKey, normalizedOptions, {});
    return this.ttsProvider.synthesize(
      resolvedRequest.provider,
      resolvedRequest.serviceType,
      resolvedRequest.text,
      mappedOptions
    );
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

    // 4. 能力校验 — 只做强制校验，unsupported 参数已在 checkUnsupportedInput 处理
    this._validateCapabilities(identity.serviceKey, resolvedParams.parameters, capabilityContext);

    // 5. 清理元数据字段
    const cleanParams = this._cleanProviderParams(resolvedParams.parameters);

    // 6. 构建最终参数
    const finalParams = this.parameterResolutionService.buildFinalParams({
      parameters: cleanParams,
      warnings: resolvedParams.warnings,
      lockedParams: resolvedParams.lockedParams,
      filtered: resolvedParams.filtered
    }, capabilityContext);

    // 6.5 收集参数解析链路上的 warnings
    const chainWarnings = [];
    if (resolvedParams.warnings?.length) {
      chainWarnings.push(...resolvedParams.warnings);
    }
    if (finalParams.__warnings?.length) {
      chainWarnings.push(...finalParams.__warnings);
      delete finalParams.__warnings;
    }

    // 7. 合并 providerOptions
    if (capabilityContext.providerOptions && Object.keys(capabilityContext.providerOptions).length > 0) {
      finalParams.providerOptions = {
        ...(finalParams.providerOptions || {}),
        ...capabilityContext.providerOptions
      };
    }

    // 8. 映射到 Provider 参数
    const providerParams = await this._translateParameters(
      identity.serviceKey,
      finalParams,
      { providerVoiceId: identity.providerVoiceId }
    );

    // 9. 调用 Provider
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
    const VoiceResolver = require('../application/VoiceResolver');
    if (request.voiceCode) return this._resolveFromVoiceCode(request);
    if (request.systemId) return this._resolveFromSystemId(request);
    return this._resolveViaVoiceResolver(request);
  }

  async _resolveFromVoiceCode(request) {
    try {
      const resolved = VoiceResolver.resolve({
        text: request.text, service: request.service,
        voiceCode: request.voiceCode, options: request.options
      });
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

  async _resolveFromSystemId(request) {
    try {
      const resolved = VoiceResolver.resolve({
        text: request.text, service: request.service,
        systemId: request.systemId, options: request.options
      });
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

  async _resolveViaVoiceResolver(request) {
    try {
      const resolved = VoiceResolver.resolve({
        text: request.text, service: request.service,
        voice: request.options?.voice || request.options?.voiceId,
        voiceId: request.options?.voiceId, options: request.options
      });
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

  _validateCapabilities(serviceKey, params, capabilityContext) {
    if (!this.capabilityResolver) return;
    const { parameterSupport } = capabilityContext;
    const errors = [];
    for (const [param, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      const support = parameterSupport[param];
      if (!support) continue;
      if (!support.supported) {
        errors.push(support.reason || `参数 ${param} 不被 ${serviceKey} 支持`);
      }
    }
    if (errors.length > 0) {
      this.metrics.capabilityValidationFailures++;
      // 只记录 metric，不 throw — unsupported 参数由 checkUnsupportedInput 统一 warn
    }
  }

  _validateCapabilitiesLegacy(adapterKey, options) {
    if (!this.capabilityResolver) return;
    const context = this.capabilityResolver.resolve(adapterKey);
    const { parameterSupport } = context;
    if (!parameterSupport || Object.keys(parameterSupport).length === 0) return;
    const errors = [];
    for (const [param, value] of Object.entries(options)) {
      if (value === undefined || value === null) continue;
      const support = parameterSupport[param];
      if (!support) continue;
      if (support.supported === false) {
        errors.push(support.reason || `参数 ${param} 不被当前服务支持`);
      }
    }
    if (errors.length > 0) {
      this.metrics.capabilityValidationFailures++;
      // 只记录 metric，不 throw — unsupported 参数由 checkUnsupportedInput 统一 warn
    }
  }

  _cleanProviderParams(params) {
    const metadataFields = new Set([
      'defaultVoiceId', 'displayName', 'alias', 'description', 'tags',
      'preview', 'previewUrl', 'status', 'createdAt', 'updatedAt', 'styleStrength'
    ]);
    const cleaned = {};
    for (const [key, value] of Object.entries(params)) {
      if (metadataFields.has(key) || value === undefined || value === null) continue;
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
