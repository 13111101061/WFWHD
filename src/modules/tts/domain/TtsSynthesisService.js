/**
 * TtsSynthesisService - TTS合成领域服务
 *
 * 核心职责：
 * - 编排TTS合成流程：验证 → 解析音色 → 能力校验 → 参数合并 → 参数映射 → 调用Provider
 *
 * 调用链（阶段化，上下文由 SynthesisContext 承载）：
 * 1. VoiceResolver 解析身份 → ctx.voiceIdentity + ctx.serviceDescriptor
 * 2. CapabilityResolver 获取能力上下文 → ctx.capabilityContext
 * 3. ParameterResolutionService 合并参数 → ctx.resolvedParams
 * 4. CompiledCapability.validate() + mapToProvider() → ctx.providerParams
 * 5. ProviderAdapter 调用 API → ctx.result
 *
 * 所有依赖通过构造函数注入。
 * 限流/熔断/重试/超时 → 委托 ExecutionPolicy。
 */

const { ExecutionPolicy } = require('../infrastructure/ExecutionPolicy');
const SynthesisRequest = require('./SynthesisRequest');
const { SynthesisContext } = require('./SynthesisContext');
const NormalizedSynthesisInput = require('./NormalizedSynthesisInput');

class TtsSynthesisService {
  /**
   * @param {Object} deps
   * @param {Object} deps.ttsProvider - TTS提供者端口
   * @param {Object} deps.voiceCatalog - 音色目录端口
   * @param {Object} deps.validator - 验证服务
   * @param {Object} [deps.capabilityResolver] - 能力解析器
   * @param {Object} [deps.parameterResolutionService] - 参数解析服务
   * @param {Object} [deps.executionPolicy] - 执行策略 (可选)
   * @param {Object} [deps.voiceResolver] - 音色解析器
   * @param {Object} [deps.providerRegistry] - ProviderRegistry 实例
   */
  constructor({
    ttsProvider,
    voiceCatalog,
    validator,
    capabilityResolver = null,
    parameterResolutionService = null,
    executionPolicy = null,
    voiceResolver = null,
    providerRegistry = null
  }) {
    this.ttsProvider = ttsProvider;
    this.voiceCatalog = voiceCatalog;
    this.validator = validator;
    this.capabilityResolver = capabilityResolver;
    this.parameterResolutionService = parameterResolutionService;
    this.executionPolicy = executionPolicy || new ExecutionPolicy();
    this.voiceResolver = voiceResolver;
    this._providerRegistry = providerRegistry;

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

    const normalized = new NormalizedSynthesisInput(sr);
    const ctx = new SynthesisContext({ request: sr });
    ctx.normalizedInput = normalized;

    this._resolveVoice(sr, ctx);
    const canonicalKey = ctx.serviceKey || 'default';

    await this.executionPolicy.execute(canonicalKey, async () => {
      this._buildCapability(ctx);
      this._checkCapabilityDigest(ctx);
      this._compileInput(ctx);
      this._mergeAndValidateParams(ctx);
      this._mapToProvider(ctx);
      await this._callProvider(ctx);
    });

    const audioResult = ctx.toAudioResult();
    if (ctx.warnings.length > 0) {
      audioResult.warnings = ctx.warnings;
      this.metrics.capabilityValidationFailures++;
    }

    return audioResult;
  }

  // ==================== 阶段方法 ====================

  _resolveVoice(sr, ctx) {
    const resolveInput = {
      text: sr.text,
      service: sr.service,
      options: sr.options
    };

    if (sr.voiceCode) {
      resolveInput.voiceCode = sr.voiceCode;
    } else if (sr.systemId) {
      resolveInput.systemId = sr.systemId;
    } else {
      resolveInput.voice = sr.options?.voice || sr.options?.voiceId;
      resolveInput.voiceId = sr.options?.voiceId;
    }

    let voiceIdentity;
    try {
      voiceIdentity = this.voiceResolver.resolve(resolveInput);
    } catch (error) {
      if (!error.code) error.code = 'VOICE_NOT_FOUND';
      throw error;
    }

    ctx.voiceIdentity = voiceIdentity;

    if (this._providerRegistry) {
      const desc = this._providerRegistry.get(voiceIdentity.serviceKey);
      if (desc) ctx.serviceDescriptor = desc;
    }
  }

  _buildCapability(ctx) {
    const identity = ctx.voiceIdentity;
    const serviceKey = identity?.serviceKey || ctx.serviceKey;
    const req = ctx.request;
    ctx.capabilityContext = this.capabilityResolver.resolve({
      serviceKey,
      modelKey: req?.model || identity?.voiceRuntime?.model || null,
      voiceRuntime: identity?.voiceRuntime,
      mode: req?.mode || null,
      inputFormat: req?.input?.type || req?.inputFormat || null,
      voiceCode: identity?.voiceCode
    });
  }

  _checkCapabilityDigest(ctx) {
    const req = ctx.request;
    const clientDigest = req?.options?.capabilityDigest || req?.capabilityDigest;
    if (!clientDigest || !ctx.capabilityContext?.compiled) return;

    // 如果请求包含 model/mode/inputFormat，用 contextualDigest 校验
    const serverDigest = (ctx.capabilityContext.modelKey || ctx.capabilityContext.mode || ctx.capabilityContext.inputFormat)
      ? ctx.capabilityContext.contextualDigest
      : ctx.capabilityContext.compiled.capabilityDigest;

    if (clientDigest !== serverDigest) {
      const err = new Error('Capability schema outdated, please refresh service capability schema');
      err.code = 'CAPABILITY_SCHEMA_OUTDATED';
      err.serverDigest = serverDigest;
      throw err;
    }
  }

  _mergeAndValidateParams(ctx) {
    const identity = ctx.voiceIdentity;
    const capCtx = ctx.capabilityContext;
    const normalized = ctx.normalizedInput;

    const merged = this.parameterResolutionService.mergeFromContext(
      normalized.params,
      capCtx,
      identity
    );

    if (merged.warnings?.length) ctx.warnings.push(...merged.warnings);

    const cleanParams = this._cleanProviderParams(merged.parameters, capCtx);

    const buildResult = this.parameterResolutionService.buildFinalParams({
      parameters: cleanParams,
      warnings: merged.warnings,
      lockedParams: merged.lockedParams,
      filtered: merged.filtered
    }, capCtx);

    ctx.resolvedParams = buildResult.params;
    if (buildResult.warnings?.length) ctx.warnings.push(...buildResult.warnings);

    // CompiledCapability.validate — 与前端 schema 同源校验
    if (capCtx?.compiled) {
      const validation = capCtx.compiled.validate(ctx.resolvedParams);
      if (!validation.valid) {
        const err = new Error(validation.errors.join('; '));
        err.code = 'CAPABILITY_ERROR';
        err.errors = validation.errors;
        throw err;
      }
    }

    if (capCtx.providerOptions && Object.keys(capCtx.providerOptions).length > 0) {
      ctx.resolvedParams.providerOptions = {
        ...(ctx.resolvedParams.providerOptions || {}),
        ...capCtx.providerOptions
      };
    }
  }

  _mapToProvider(ctx) {
    const identity = ctx.voiceIdentity;
    ctx.providerParams = ctx.capabilityContext.compiled.mapToProvider(
      ctx.resolvedParams,
      { providerVoiceId: identity?.providerVoiceId }
    );
  }

  async _callProvider(ctx) {
    const identity = ctx.voiceIdentity;
    const desc = ctx.serviceDescriptor;
    const serviceType = desc?.serviceType || 'default';
    const text = ctx.compiledInput?.providerText ?? ctx.normalizedInput?.text ?? '';
    const providerInput = ctx.compiledInput?.providerInput || null;

    ctx.result = await this.ttsProvider.synthesize(
      identity.providerKey,
      serviceType,
      text,
      ctx.providerParams,
      providerInput
    );
  }

  // ==================== 输入编译（最小 stub） ====================

  _compileInput(ctx) {
    const normalized = ctx.normalizedInput;
    const input = normalized.input;

    if (!input) {
      ctx.compiledInput = { providerText: normalized.text, providerInput: null, warnings: [] };
      return;
    }

    const capCtx = ctx.capabilityContext;
    const supportedFormats = capCtx?.inputFormats || ['plainText'];
    const inputType = input.type || 'plainText';

    if (!supportedFormats.includes(inputType)) {
      const err = new Error(`Input format "${inputType}" not supported. Supported: ${supportedFormats.join(', ')}`);
      err.code = 'INPUT_FORMAT_UNSUPPORTED';
      throw err;
    }

    if (inputType === 'markedText' || inputType === 'ssml' || inputType === 'segments') {
      ctx.warnings.push({ type: 'unsupported', param: 'inputFormat', message: `Input format "${inputType}" not yet compiled — using raw text` });
    }

    ctx.compiledInput = {
      providerText: input.raw || normalized.text,
      providerInput: input.segments ? { segments: input.segments } : null,
      inputFormat: inputType,
      warnings: []
    };
  }

  // ==================== 批量合成 ====================

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

  // ==================== 内部工具 ====================

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
