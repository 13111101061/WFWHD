/**
 * TtsSynthesisService - TTS合成领域服务
 *
 * 核心职责：
 * - 编排TTS合成流程
 * - 熔断器保护（防止级联故障）
 * - 限流保护（防止过载）
 * - 请求验证与解析
 *
 * [改造后] 新调用链：
 * 1. VoiceResolver 解析身份 → VoiceIdentity
 * 2. CapabilityResolver 获取能力上下文 → CapabilityContext
 * 3. ParameterResolutionService 合并参数 → 平台标准参数
 * 4. ParameterMapper 映射参数 → 服务商参数
 * 5. ProviderAdapter 调用 API
 *
 * 依赖注入：
 * - ttsProvider: TTS提供者端口
 * - voiceCatalog: 音色目录端口
 * - validator: 验证服务
 * - capabilityResolver: 能力解析器 [新增]
 * - parameterResolutionService: 参数解析服务 [新增]
 * - parameterMapper: 参数映射器 [启用]
 * - circuitBreaker: 熔断器（可选，有默认实现）
 * - rateLimiter: 限流器（可选，有默认实现）
 */

const CircuitBreaker = require('../../../infrastructure/resilience/CircuitBreaker');
const RateLimiter = require('../../../infrastructure/resilience/RateLimiter');
const { VoiceResolver } = require('../application/VoiceResolver');
const { ProviderDescriptorRegistry } = require('../provider-management/ProviderDescriptorRegistry');

// 超时和重试策略配置
const DEFAULT_POLICY = {
  timeoutMs: parseInt(process.env.TTS_SYNTH_TIMEOUT_MS || '60000', 10),
  retryTimes: parseInt(process.env.TTS_SYNTH_RETRY_TIMES || '1', 10)
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(error) {
  if (!error) return false;
  const retryableCodes = new Set([
    'API_ERROR',
    'PROVIDER_ERROR',
    'TIMEOUT_ERROR',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'EAI_AGAIN'
  ]);
  if (retryableCodes.has(error.code)) return true;

  const msg = String(error.message || '').toLowerCase();
  return msg.includes('timeout') || msg.includes('timed out') || msg.includes('network');
}

async function withTimeout(taskPromise, timeoutMs) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Synthesis timeout after ${timeoutMs}ms`);
      error.code = 'TIMEOUT_ERROR';
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class TtsSynthesisService {
  /**
   * @param {Object} deps - 依赖注入
   */
  constructor({
    ttsProvider,
    voiceCatalog,
    validator,
    circuitBreaker,
    rateLimiter
  }) {
    this.ttsProvider = ttsProvider;
    this.voiceCatalog = voiceCatalog;
    this.validator = validator;

    // 熔断器：按服务粒度管理
    this.circuitBreakers = new Map();
    this.defaultCircuitBreaker = circuitBreaker || null;

    // 限流器：按服务粒度管理
    this.rateLimiters = new Map();
    this.defaultRateLimiter = rateLimiter || null;

    // [新增] 能力解析器和参数解析服务
    this.capabilityResolver = null;
    this.parameterResolutionService = null;

    // 参数映射器（启用）
    this.parameterMapper = null;

    // 能力校验器（保留兼容）
    this.capabilityValidator = null;

    // 统计指标
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatency: 0,
      serviceStats: new Map(),
      timeoutCount: 0,
      rateLimitHits: 0,
      credentialErrors: 0,
      audioSaveErrors: 0,
      capabilityValidationFailures: 0,
      parameterMappingErrors: 0
    };
  }

  /**
   * 设置能力解析器
   * @param {Object} resolver - CapabilityResolver 实例
   */
  setCapabilityResolver(resolver) {
    this.capabilityResolver = resolver;
  }

  /**
   * 设置参数解析服务
   * @param {Object} service - ParameterResolutionService 实例
   */
  setParameterResolutionService(service) {
    this.parameterResolutionService = service;
  }

  /**
   * 设置参数映射器
   * @param {Object} mapper - ParameterMapper 实例
   */
  setParameterMapper(mapper) {
    this.parameterMapper = mapper;
  }

  /**
   * 设置能力校验器（保留兼容）
   * @param {Object} validator - CapabilityValidator 实例
   */
  setCapabilityValidator(validator) {
    this.capabilityValidator = validator;
  }

  /**
   * 执行TTS合成（核心方法）
   * @param {SynthesisRequest|Object} request - 合成请求（支持 SynthesisRequest 实例或普通对象）
   * @returns {Promise<AudioResult>} 合成结果
   */
  async synthesize(request) {
    const startTime = Date.now();

    // 自动转换普通对象为 SynthesisRequest 实例
    const SynthesisRequest = require('./SynthesisRequest');
    const synthesisRequest = request instanceof SynthesisRequest
      ? request
      : SynthesisRequest.fromJSON(request);

    const serviceKey = this._buildServiceKey(synthesisRequest);

    // 1. 验证请求
    this._validateRequest(synthesisRequest);

    // 2. 解析服务标识
    // [优化] 返回 { resolvedRequest, voiceIdentity } 避免新链路重复解析
    const { resolvedRequest, voiceIdentity } = await this._resolveServiceIdentifier(synthesisRequest);
    const resolvedServiceKey = this._buildServiceKey(resolvedRequest);

    // 3. 限流检查
    this._checkRateLimit(resolvedServiceKey);

    // 4. 熔断器保护执行（带超时和重试）
    const breaker = this._getCircuitBreaker(resolvedServiceKey);

    const result = await breaker.execute(async () => {
      return this._synthesizeWithRetry(resolvedRequest, startTime, voiceIdentity);
    });

    // 7. 记录成功指标
    const latency = Date.now() - startTime;
    this._recordSuccess(resolvedServiceKey, latency);

    // 8. 构建结果
    const AudioResult = require('./AudioResult');
    return AudioResult.fromServiceResult(result, {
      provider: resolvedRequest.provider,
      serviceType: resolvedRequest.serviceType,
      text: resolvedRequest.text,
      latency
    });
  }

  /**
   * 带重试策略的合成方法
   *
   * [改造后] 支持新调用链：
   * 1. VoiceResolver 解析身份
   * 2. CapabilityResolver 获取能力上下文
   * 3. ParameterResolutionService 合并参数
   * 4. ParameterMapper 映射参数
   *
   * @param {SynthesisRequest} resolvedRequest - 已解析的请求
   * @param {number} startTime - 开始时间
   * @param {Object} [cachedVoiceIdentity] - 缓存的 VoiceResolver 结果（避免重复解析）
   */
  async _synthesizeWithRetry(resolvedRequest, startTime, cachedVoiceIdentity = null) {
    const timeoutMs = DEFAULT_POLICY.timeoutMs;
    const retryTimes = Number.isFinite(DEFAULT_POLICY.retryTimes) ? DEFAULT_POLICY.retryTimes : 1;
    const attempts = Math.max(1, retryTimes + 1);

    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        // 检查是否启用新的调用链
        if (this.capabilityResolver && this.parameterResolutionService) {
          // 新调用链 - 传入缓存的 voiceIdentity
          return await this._synthesizeWithNewChain(resolvedRequest, timeoutMs, cachedVoiceIdentity);
        }

        // 旧调用链（向后兼容）
        const normalizedOptions = resolvedRequest.getNormalizedOptions();

        // 能力校验（在参数转译之前）
        const adapterKey = `${resolvedRequest.provider}_${resolvedRequest.serviceType}`;
        this._validateCapabilities(adapterKey, normalizedOptions);

        // 参数转译（使用 serviceKey，旧链路无 context）
        const serviceKey = adapterKey;
        const mappedOptions = await this._translateParameters(serviceKey, normalizedOptions, {});

        return await withTimeout(
          this.ttsProvider.synthesize(
            resolvedRequest.provider,
            resolvedRequest.serviceType,
            resolvedRequest.text,
            mappedOptions
          ),
          timeoutMs
        );
      } catch (error) {
        lastError = error;

        // 记录超时错误
        if (error.code === 'TIMEOUT_ERROR') {
          this.metrics.timeoutCount++;
        }

        const shouldRetry = attempt < attempts && isRetryableError(error);
        if (!shouldRetry) break;
        await sleep(120 * attempt);
      }
    }

    throw lastError;
  }

  /**
   * 使用新调用链的合成方法
   * @param {SynthesisRequest} resolvedRequest - 已解析的请求
   * @param {number} timeoutMs - 超时时间
   * @param {Object} [cachedVoiceIdentity] - 缓存的 VoiceResolver 结果（避免重复解析）
   * @private
   */
  async _synthesizeWithNewChain(resolvedRequest, timeoutMs, cachedVoiceIdentity = null) {
    // 1. VoiceResolver 解析身份 - 使用缓存或重新解析
    const voiceIdentity = cachedVoiceIdentity || VoiceResolver.resolve({
      text: resolvedRequest.text,
      service: resolvedRequest.service,
      voiceCode: resolvedRequest.voiceCode,
      systemId: resolvedRequest.systemId,
      options: resolvedRequest.options
    });

    // 2. CapabilityResolver 获取能力上下文
    const capabilityContext = this.capabilityResolver.resolve(
      voiceIdentity.serviceKey,
      voiceIdentity.modelKey,
      voiceIdentity.voiceRuntime
    );

    // 3. ParameterResolutionService 合并参数
    const resolvedParams = this.parameterResolutionService.mergeFromContext(
      resolvedRequest.options,
      capabilityContext,
      voiceIdentity
    );

    // 4. [修复] 能力校验 - 在参数转译之前验证
    this._validateCapabilitiesWithResolvedParams(voiceIdentity.serviceKey, resolvedParams.parameters, capabilityContext);

    // 5. [修复] 清理参数中的元数据字段，防止污染出站
    const cleanParams = this._cleanProviderParams(resolvedParams.parameters);

    // 6. [修复] 处理 providerOptions 统一出口（传递 capabilityContext 支持动态字段识别）
    const finalParams = this.parameterResolutionService.buildFinalParams({
      parameters: cleanParams,
      warnings: resolvedParams.warnings,
      lockedParams: resolvedParams.lockedParams,
      filtered: resolvedParams.filtered
    }, capabilityContext);

    // 7. [修复] 合并音色运行时的 providerOptions（服务商专属参数）
    if (capabilityContext.providerOptions && Object.keys(capabilityContext.providerOptions).length > 0) {
      finalParams.providerOptions = {
        ...(finalParams.providerOptions || {}),
        ...capabilityContext.providerOptions
      };
    }

    // 8. ParameterMapper 映射参数（传递 context 支持动态字段注入）
    const providerParams = await this._translateParameters(
      voiceIdentity.serviceKey,
      finalParams,
      { providerVoiceId: voiceIdentity.providerVoiceId }
    );

    // 9. 调用 Provider - 使用正确的字段
    const serviceType = this._extractServiceType(voiceIdentity.serviceKey);

    return await withTimeout(
      this.ttsProvider.synthesize(
        voiceIdentity.providerKey,
        serviceType,
        resolvedRequest.text,
        providerParams
      ),
      timeoutMs
    );
  }

  /**
   * 使用解析后的参数进行能力校验
   * @private
   */
  _validateCapabilitiesWithResolvedParams(serviceKey, params, capabilityContext) {
    // 使用 CapabilityResolver 的校验功能
    if (!this.capabilityResolver) return;

    const { parameterSupport } = capabilityContext;
    const errors = [];

    for (const [param, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;

      const support = parameterSupport[param];
      if (support && support.supported === false) {
        errors.push(support.config?.description || `参数 ${param} 不被当前服务支持`);
      }
    }

    if (errors.length > 0) {
      this.metrics.capabilityValidationFailures++;
      const error = new Error(`Capability validation failed: ${errors.join('; ')}`);
      error.code = 'CAPABILITY_ERROR';
      error.errors = errors;
      throw error;
    }
  }

  /**
   * 清理参数中的元数据字段，防止污染出站
   * @private
   */
  _cleanProviderParams(params) {
    // 这些字段是元数据/展示字段，不应该发给服务商
    // 注意：不清理 speed/pitch/volume/emotion 等参数，由能力校验层处理
    const metadataFields = new Set([
      'defaultVoiceId',      // 默认音色ID（元数据）
      'displayName',         // 显示名称（展示）
      'alias',               // 别名（展示）
      'description',         // 描述（展示）
      'tags',                // 标签（展示）
      'preview',             // 预览（展示）
      'previewUrl',          // 预览URL（展示）
      'status',              // 状态（元数据）
      'createdAt',           // 创建时间（元数据）
      'updatedAt',           // 更新时间（元数据）
      'styleStrength'        // 风格强度（展示用，非API参数）
    ]);

    const cleaned = {};
    for (const [key, value] of Object.entries(params)) {
      // 跳过元数据字段
      if (metadataFields.has(key)) continue;

      // 跳过 undefined/null
      if (value === undefined || value === null) continue;

      cleaned[key] = value;
    }

    return cleaned;
  }

  /**
   * 能力校验
   * @param {string} adapterKey - 适配器标识
   * @param {Object} options - 请求参数
   */
  _validateCapabilities(adapterKey, options) {
    if (!this.capabilityValidator) {
      return; // 未注入校验器，跳过
    }

    const result = this.capabilityValidator.validate(adapterKey, options);

    if (!result.valid) {
      this.metrics.capabilityValidationFailures++;
      const error = new Error(`Capability validation failed: ${result.errors.join('; ')}`);
      error.code = 'CAPABILITY_ERROR';
      error.errors = result.errors;
      error.warnings = result.warnings;
      throw error;
    }

    // 有警告但可继续执行，记录日志
    if (result.warnings && result.warnings.length > 0) {
      console.warn(`[TtsSynthesisService] Capability warnings for ${adapterKey}:`, result.warnings);
    }
  }

  /**
   * 参数转译（启用）
   *
   * [改造后] 使用 mapToProvider 方法
   * 将平台标准参数转换为服务商参数
   *
   * @param {string} serviceKey - 服务标识（如 "moss_tts"）
   * @param {Object} platformParams - 平台标准参数
   * @param {Object} [context] - 上下文（包含 providerVoiceId 等）
   * @returns {Object} 服务商参数
   * @throws Error 映射失败时抛出错误（fail fast）
   */
  async _translateParameters(serviceKey, platformParams, context = {}) {
    if (!this.parameterMapper) {
      // 无映射器，返回原始参数（兼容旧服务）
      console.warn(`[TtsSynthesisService] No parameter mapper, using raw params for ${serviceKey}`);
      return platformParams;
    }

    try {
      return this.parameterMapper.mapToProvider(serviceKey, platformParams, context);
    } catch (error) {
      this.metrics.parameterMappingErrors++;
      console.error(`[TtsSynthesisService] Parameter mapping failed for ${serviceKey}:`, error.message);

      // [修复] 不要静默降级，而是抛出错误
      // 让调用方知道参数链出了问题
      if (!error.code) {
        error.code = 'PARAMETER_MAPPING_ERROR';
      }
      throw error;
    }
  }

  /**
   * 批量合成
   * @param {SynthesisRequest[]} requests
   * @returns {Promise<{ results: Array, errors: Array }>}
   */
  async batchSynthesize(requests) {
    const results = [];
    const errors = [];

    for (let i = 0; i < requests.length; i++) {
      try {
        const result = await this.synthesize(requests[i]);
        results.push({
          index: i,
          success: true,
          data: result
        });
      } catch (error) {
        errors.push({
          index: i,
          success: false,
          error: error.message,
          code: error.code
        });
      }
    }

    return { results, errors };
  }

  /**
   * 获取服务健康状态
   */
  async getHealthStatus() {
    const providerHealth = await this.ttsProvider.getHealthStatus();
    const circuitBreakerStatus = this._getCircuitBreakerStatus();

    return {
      overall: this._determineOverallHealth(providerHealth, circuitBreakerStatus),
      provider: providerHealth,
      circuitBreakers: circuitBreakerStatus,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const successRate = this.metrics.totalRequests > 0
      ? (this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2)
      : 0;

    const avgLatency = this.metrics.successfulRequests > 0
      ? Math.round(this.metrics.totalLatency / this.metrics.successfulRequests)
      : 0;

    return {
      overview: {
        totalRequests: this.metrics.totalRequests,
        successfulRequests: this.metrics.successfulRequests,
        failedRequests: this.metrics.failedRequests,
        successRate: `${successRate}%`,
        averageLatency: `${avgLatency}ms`
      },
      services: Array.from(this.metrics.serviceStats.entries()).map(([key, stats]) => ({
        service: key,
        calls: stats.calls,
        errors: stats.errors,
        errorRate: stats.calls > 0 ? `${(stats.errors / stats.calls * 100).toFixed(2)}%` : '0%',
        avgLatency: stats.calls > 0 ? `${Math.round(stats.totalLatency / stats.calls)}ms` : '0ms'
      })),
      circuitBreakers: this._getCircuitBreakerStatus(),
      // 新增：详细错误分类
      errorBreakdown: {
        timeouts: this.metrics.timeoutCount,
        rateLimitHits: this.metrics.rateLimitHits,
        credentialErrors: this.metrics.credentialErrors,
        audioSaveErrors: this.metrics.audioSaveErrors,
        capabilityValidationFailures: this.metrics.capabilityValidationFailures,
        parameterMappingErrors: this.metrics.parameterMappingErrors
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatency: 0,
      serviceStats: new Map(),
      timeoutCount: 0,
      rateLimitHits: 0,
      credentialErrors: 0,
      audioSaveErrors: 0,
      capabilityValidationFailures: 0,
      parameterMappingErrors: 0
    };

    // 重置所有熔断器
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }

    console.log('📊 TTS服务统计已重置');
  }

  // ==================== 查询服务方法（委托给TtsQueryService） ====================

  /**
   * 设置查询服务实例
   * @param {TtsQueryService} queryService
   */
  setQueryService(queryService) {
    this.queryService = queryService;
  }

  /**
   * 检查查询服务是否已注入
   * @private
   */
  _ensureQueryService() {
    if (!this.queryService) {
      throw new Error(
        'TtsQueryService not injected. ' +
        'Ensure ServiceContainer.initialize() is called before using query methods.'
      );
    }
  }

  queryVoices(filters = {}) {
    this._ensureQueryService();
    return this.queryService.queryVoices(filters);
  }

  getFrontendCatalog() {
    this._ensureQueryService();
    return this.queryService.getFrontendCatalog();
  }

  getVoice(voiceId) {
    this._ensureQueryService();
    return this.queryService.getVoice(voiceId);
  }

  getVoiceDetail(voiceId) {
    this._ensureQueryService();
    return this.queryService.getVoiceDetail(voiceId);
  }

  getCapabilities(serviceKey) {
    this._ensureQueryService();
    return this.queryService.getCapabilities(serviceKey);
  }

  getFilterOptions() {
    this._ensureQueryService();
    return this.queryService.getFilterOptions();
  }

  getFrontendVoices() {
    this._ensureQueryService();
    return this.queryService.getFrontendVoices();
  }

  getVoices(provider, serviceType) {
    this._ensureQueryService();
    return this.queryService.getVoices(provider, serviceType);
  }

  getAllVoices() {
    this._ensureQueryService();
    return this.queryService.getAllVoices();
  }

  getProviders() {
    this._ensureQueryService();
    return this.queryService.getProviders();
  }

  // ==================== 私有方法 ====================

  /**
   * 验证请求
   */
  _validateRequest(request) {
    // 基础验证
    const baseValidation = request.validate();
    if (!baseValidation.valid) {
      const error = new Error(baseValidation.errors.join('; '));
      error.code = 'VALIDATION_ERROR';
      error.errors = baseValidation.errors;
      throw error;
    }

    // 文本内容验证
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

  /**
   * 解析服务标识符
   * 支持三种方式（优先级从高到低）：
   * 1. voiceCode - 15位数字编码（新标准）
   * 2. systemId - 系统音色ID（兼容）
   * 3. service + provider/serviceType - 服务标识
   *
   * [优化] 返回 { resolvedRequest, voiceIdentity } 供新链路复用
   */
  async _resolveServiceIdentifier(request) {
    const { VoiceResolver } = require('../application/VoiceResolver');

    // 1. voiceCode 优先（新标准）
    if (request.voiceCode) {
      return this._resolveFromVoiceCode(request);
    }

    // 2. systemId 兼容（旧标准）
    if (request.systemId) {
      return this._resolveFromSystemId(request);
    }

    // 3. 使用 VoiceResolver 解析（支持 service + voice 组合）
    return this._resolveViaVoiceResolver(request);
  }

  /**
   * 从 voiceCode 解析（新标准）
   *
   * [修复] 使用新的输出结构：
   * - providerVoiceId 而非 voiceId
   * - 从 serviceKey 正确提取 serviceType
   * - [优化] 返回 voiceIdentity 供新链路复用
   */
  async _resolveFromVoiceCode(request) {
    const { VoiceResolver } = require('../application/VoiceResolver');
    try {
      const resolved = VoiceResolver.resolve({
        text: request.text,
        service: request.service,
        voiceCode: request.voiceCode,
        options: request.options
      });

      // [修复] 从 serviceKey 提取 serviceType
      const serviceType = this._extractServiceType(resolved.serviceKey);

      const SynthesisRequest = require('./SynthesisRequest');
      const resolvedRequest = new SynthesisRequest({
        text: request.text,
        service: request.service,
        voiceCode: resolved.voiceCode,
        systemId: resolved.systemId,
        provider: resolved.providerKey,
        serviceType: serviceType,
        options: {
          ...request.options,
          // [修复] 使用 providerVoiceId
          voice: resolved.providerVoiceId,
          voiceId: resolved.providerVoiceId
        }
      });

      // [优化] 返回 voiceIdentity 供新链路复用，避免重复解析
      return { resolvedRequest, voiceIdentity: resolved };
    } catch (error) {
      if (!error.code) error.code = 'VOICE_NOT_FOUND';
      throw error;
    }
  }

  /**
   * 通过 VoiceResolver 解析（service + voice 组合）
   *
   * [修复] 使用新的输出结构
   * [优化] 返回 voiceIdentity 供新链路复用
   */
  async _resolveViaVoiceResolver(request) {
    const { VoiceResolver } = require('../application/VoiceResolver');
    try {
      const resolved = VoiceResolver.resolve({
        text: request.text,
        service: request.service,
        voice: request.options?.voice || request.options?.voiceId,
        voiceId: request.options?.voiceId,
        options: request.options
      });

      // [修复] 从 serviceKey 提取 serviceType
      const serviceType = this._extractServiceType(resolved.serviceKey);

      const SynthesisRequest = require('./SynthesisRequest');
      const resolvedRequest = new SynthesisRequest({
        text: request.text,
        service: request.service,
        voiceCode: resolved.voiceCode,
        systemId: resolved.systemId,
        provider: resolved.providerKey,
        serviceType: serviceType,
        options: {
          ...request.options,
          // [修复] 使用 providerVoiceId
          voice: resolved.providerVoiceId,
          voiceId: resolved.providerVoiceId
        }
      });

      // [优化] 返回 voiceIdentity 供新链路复用
      return { resolvedRequest, voiceIdentity: resolved };
    } catch (error) {
      if (!error.code) error.code = 'VOICE_NOT_FOUND';
      throw error;
    }
  }

  /**
   * 从 systemId 解析服务信息
   *
   * [修复] 使用新的输出结构
   * [优化] 返回 voiceIdentity 供新链路复用
   */
  async _resolveFromSystemId(request) {
    const { VoiceResolver } = require('../application/VoiceResolver');

    try {
      const resolved = VoiceResolver.resolve({
        text: request.text,
        service: request.service,
        systemId: request.systemId,
        options: request.options
      });

      // [修复] 从 serviceKey 提取 serviceType
      const serviceType = this._extractServiceType(resolved.serviceKey);

      const SynthesisRequest = require('./SynthesisRequest');
      const resolvedRequest = new SynthesisRequest({
        text: request.text,
        service: request.service,
        voiceCode: resolved.voiceCode,
        systemId: resolved.systemId,
        provider: resolved.providerKey,
        serviceType: serviceType,
        options: {
          ...request.options,
          // [修复] 使用 providerVoiceId
          voice: resolved.providerVoiceId,
          voiceId: resolved.providerVoiceId
        }
      });

      // [优化] 返回 voiceIdentity 供新链路复用
      return { resolvedRequest, voiceIdentity: resolved };
    } catch (error) {
      if (!error.code) error.code = 'VOICE_NOT_FOUND';
      throw error;
    }
  }

  /**
   * 构建服务键
   */
  _buildServiceKey(request) {
    if (request.provider && request.serviceType) {
      return `${request.provider}_${request.serviceType}`;
    }
    if (request.service) {
      return request.service;
    }
    return 'default';
  }

  /**
   * 从 serviceKey 提取 serviceType
   * @param {string} serviceKey - 服务标识（如 "moss_tts", "aliyun_qwen_http"）
   * @returns {string} 服务类型
   */
  _extractServiceType(serviceKey) {
    if (!serviceKey) {
      return 'default';
    }

    const descriptor = ProviderDescriptorRegistry.get(serviceKey);
    const canonicalKey = descriptor?.key || ProviderDescriptorRegistry.resolveCanonicalKey(serviceKey) || serviceKey;
    const providerKey = descriptor?.provider || canonicalKey.split('_')[0];
    const prefix = `${providerKey}_`;

    if (canonicalKey.startsWith(prefix) && canonicalKey.length > prefix.length) {
      return canonicalKey.slice(prefix.length);
    }

    if (!canonicalKey.includes('_')) {
      return canonicalKey;
    }

    return canonicalKey.split('_').slice(1).join('_');
  }

  /**
   * 获取或创建熔断器
   */
  _getCircuitBreaker(serviceKey) {
    if (!this.circuitBreakers.has(serviceKey)) {
      this.circuitBreakers.set(serviceKey, new CircuitBreaker({
        name: `tts-${serviceKey}`,
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000
      }));
    }
    return this.circuitBreakers.get(serviceKey);
  }

  /**
   * 限流检查
   */
  _checkRateLimit(serviceKey) {
    const limiter = this._getRateLimiter(serviceKey);
    const result = limiter.check(serviceKey);

    if (!result.allowed) {
      this.metrics.rateLimitHits++; // 记录限流命中
      const error = new Error(`Rate limit exceeded for service ${serviceKey}`);
      error.code = 'RATE_LIMIT_EXCEEDED';
      error.retryAfter = result.retryAfter;
      error.limit = result.limit;
      throw error;
    }
  }

  /**
   * 获取或创建限流器
   */
  _getRateLimiter(serviceKey) {
    if (!this.rateLimiters.has(serviceKey)) {
      this.rateLimiters.set(serviceKey, new RateLimiter({
        name: `tts-${serviceKey}`,
        maxRequests: 100,
        windowMs: 60000
      }));
    }
    return this.rateLimiters.get(serviceKey);
  }

  /**
   * 记录成功
   */
  _recordSuccess(serviceKey, latency) {
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
    this.metrics.totalLatency += latency;

    if (!this.metrics.serviceStats.has(serviceKey)) {
      this.metrics.serviceStats.set(serviceKey, {
        calls: 0,
        errors: 0,
        totalLatency: 0
      });
    }

    const stats = this.metrics.serviceStats.get(serviceKey);
    stats.calls++;
    stats.totalLatency += latency;
  }

  /**
   * 记录失败（由熔断器回调）
   */
  _recordFailure(serviceKey) {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;

    if (!this.metrics.serviceStats.has(serviceKey)) {
      this.metrics.serviceStats.set(serviceKey, {
        calls: 0,
        errors: 0,
        totalLatency: 0
      });
    }

    const stats = this.metrics.serviceStats.get(serviceKey);
    stats.calls++;
    stats.errors++;
  }

  /**
   * 获取熔断器状态
   */
  _getCircuitBreakerStatus() {
    return Array.from(this.circuitBreakers.entries()).map(([key, breaker]) => ({
      service: key,
      state: breaker.getState(),
      ...breaker.getStats()
    }));
  }

  /**
   * 确定整体健康状态
   */
  _determineOverallHealth(providerHealth, circuitBreakerStatus) {
    // 如果有任何熔断器打开，状态为 degraded
    const openBreakers = circuitBreakerStatus.filter(cb => cb.state === 'OPEN');
    if (openBreakers.length > 0) {
      return 'degraded';
    }

    // 如果提供者健康，返回 healthy
    if (providerHealth && providerHealth.overall === 'healthy') {
      return 'healthy';
    }

    return 'degraded';
  }
}

module.exports = { TtsSynthesisService };
