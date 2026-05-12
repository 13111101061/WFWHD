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
 * 4. CompiledCapability.mapToProvider() 映射参数 → 服务商参数
 * 5. ProviderAdapter 调用 API
 *
 * 所有依赖通过构造函数注入，消除 setter 时间耦合。
 * 限流/熔断/重试/超时 → 委托 ExecutionPolicy。
 */

const { VoiceResolver } = require('../application/VoiceResolver');
const { ProviderDescriptorRegistry } = require('../provider-management/ProviderDescriptorRegistry');
const { ExecutionPolicy } = require('../infrastructure/ExecutionPolicy');
const SynthesisRequest = require('./SynthesisRequest');
const AudioResult = require('./AudioResult');

class TtsSynthesisService {
  /**
   * @param {Object} deps
   * @param {Object} deps.ttsProvider - TTS提供者端口
   * @param {Object} deps.voiceCatalog - 音色目录端口
   * @param {Object} deps.validator - 验证服务
   * @param {Object} deps.capabilityResolver - 能力解析器
   * @param {Object} deps.parameterResolutionService - 参数解析服务
   * @param {Object} deps.executionPolicy - 执行策略 (可选)
   */
  constructor({
    ttsProvider,
    voiceCatalog,
    validator,
    capabilityResolver = null,
    parameterResolutionService = null,
    executionPolicy = null
  }) {
    this.ttsProvider = ttsProvider;
    this.voiceCatalog = voiceCatalog;
    this.validator = validator;
    this.capabilityResolver = capabilityResolver;
    this.parameterResolutionService = parameterResolutionService;
    this.executionPolicy = executionPolicy || new ExecutionPolicy();

    this.metrics = {
      credentialErrors: 0,
      audioSaveErrors: 0,
      capabilityValidationFailures: 0,
      parameterMappingErrors: 0
    };
  }

  // ==================== 核心合成 ====================

  async synthesize(request) {
    const sr = request instanceof SynthesisRequest ? request : SynthesisRequest.fromJSON(request);

    this._validateRequest(sr);

    const { resolvedRequest, voiceIdentity } = await this._resolveServiceIdentifier(sr);
    const resolvedServiceKey = this._buildServiceKey(resolvedRequest);

    const { result, warnings: chainWarnings } = await this.executionPolicy.execute(resolvedServiceKey, async () => {
      return this._doSynthesize(resolvedRequest, voiceIdentity);
    });

    const warnings = [];
    if (chainWarnings?.length) {
      warnings.push(...chainWarnings);
      this.metrics.capabilityValidationFailures++;
    }

    const audioResult = AudioResult.fromServiceResult(result, {
      provider: resolvedRequest.provider,
      serviceType: resolvedRequest.serviceType,
      text: resolvedRequest.text,
      latency: 0
    });

    if (warnings.length > 0) {
      audioResult.warnings = warnings;
    }

    return audioResult;
  }

  async _doSynthesize(resolvedRequest, voiceIdentity) {
    return this._synthesizeWithNewChain(resolvedRequest, voiceIdentity);
  }

  async _synthesizeWithNewChain(resolvedRequest, voiceIdentity) {
    const identity = voiceIdentity || VoiceResolver.resolve({
      text: resolvedRequest.text,
      service: resolvedRequest.service,
      voiceCode: resolvedRequest.voiceCode,
      systemId: resolvedRequest.systemId,
      options: resolvedRequest.options
    });

    const capabilityContext = this.capabilityResolver.resolve(
      identity.serviceKey,
      identity.modelKey,
      identity.voiceRuntime
    );

    const resolvedParams = this.parameterResolutionService.mergeFromContext(
      resolvedRequest.options,
      capabilityContext,
      identity
    );

    const cleanParams = this._cleanProviderParams(resolvedParams.parameters, capabilityContext);

    const buildResult = this.parameterResolutionService.buildFinalParams({
      parameters: cleanParams,
      warnings: resolvedParams.warnings,
      lockedParams: resolvedParams.lockedParams,
      filtered: resolvedParams.filtered
    }, capabilityContext);
    const finalParams = buildResult.params;

    const chainWarnings = [];
    if (resolvedParams.warnings?.length) chainWarnings.push(...resolvedParams.warnings);
    if (buildResult.warnings?.length) chainWarnings.push(...buildResult.warnings);

    if (capabilityContext.providerOptions && Object.keys(capabilityContext.providerOptions).length > 0) {
      finalParams.providerOptions = {
        ...(finalParams.providerOptions || {}),
        ...capabilityContext.providerOptions
      };
    }

    const providerParams = capabilityContext.compiled.mapToProvider(
      finalParams,
      { providerVoiceId: identity.providerVoiceId }
    );

    const serviceType = this._extractServiceType(identity.serviceKey);
    const providerResult = await this.ttsProvider.synthesize(
      identity.providerKey,
      serviceType,
      resolvedRequest.text,
      providerParams
    );

    return { result: providerResult, warnings: chainWarnings };
  }

  // ==================== 批量合成 ====================

  /**
   * 批量合成（流式并发：完成一个立即补下一个，始终保持 concurrency 个飞行中）
   */
  async batchSynthesize(requests, opts = {}) {
    const concurrency = opts.concurrency
      || parseInt(process.env.TTS_BATCH_CONCURRENCY, 10)
      || 5;

    const results = [];
    const errors = [];
    const inFlight = new Set();
    let cursor = 0;

    const runOne = async (index) => {
      try {
        const result = await this.synthesize(requests[index]);
        results.push({ index, success: true, data: result, warnings: result.warnings || undefined });
      } catch (error) {
        errors.push({ index, success: false, error: error.message, code: error.code });
      }
    };

    while (cursor < requests.length || inFlight.size > 0) {
      while (inFlight.size < concurrency && cursor < requests.length) {
        const idx = cursor++;
        const p = runOne(idx).finally(() => inFlight.delete(p));
        inFlight.add(p);
      }
      if (inFlight.size > 0) {
        await Promise.race(inFlight);
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
    if (!schema) return params;
    const validKeys = new Set(Object.keys(schema));
    const cleaned = {};
    for (const [key, value] of Object.entries(params)) {
      if (!validKeys.has(key) || value === undefined || value === null) continue;
      cleaned[key] = value;
    }
    return cleaned;
  }
}

module.exports = { TtsSynthesisService };