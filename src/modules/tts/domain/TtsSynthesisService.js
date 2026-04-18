/**
 * TtsSynthesisService - TTS合成领域服务
 *
 * 核心职责：
 * - 编排TTS合成流程
 * - 熔断器保护（防止级联故障）
 * - 限流保护（防止过载）
 * - 请求验证与解析
 *
 * 依赖注入：
 * - ttsProvider: TTS提供者端口
 * - voiceCatalog: 音色目录端口
 * - validator: 验证服务
 * - circuitBreaker: 熔断器（可选，有默认实现）
 * - rateLimiter: 限流器（可选，有默认实现）
 */

const CircuitBreaker = require('../../../infrastructure/resilience/CircuitBreaker');
const RateLimiter = require('../../../infrastructure/resilience/RateLimiter');

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

    // 能力校验器和参数映射器（可选，由外部注入）
    this.capabilityValidator = null;
    this.parameterMapper = null;

    // 统计指标
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatency: 0,
      serviceStats: new Map(),
      // 新增：详细错误统计
      timeoutCount: 0,
      rateLimitHits: 0,
      credentialErrors: 0,
      audioSaveErrors: 0,
      capabilityValidationFailures: 0,
      parameterMappingErrors: 0
    };
  }

  /**
   * 设置能力校验器
   * @param {Object} validator - CapabilityValidator 实例
   */
  setCapabilityValidator(validator) {
    this.capabilityValidator = validator;
  }

  /**
   * 设置参数映射器
   * @param {Object} mapper - ParameterMapper 实例
   */
  setParameterMapper(mapper) {
    this.parameterMapper = mapper;
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
    const resolvedRequest = await this._resolveServiceIdentifier(synthesisRequest);
    const resolvedServiceKey = this._buildServiceKey(resolvedRequest);

    // 3. 限流检查
    this._checkRateLimit(resolvedServiceKey);

    // 4. 熔断器保护执行（带超时和重试）
    const breaker = this._getCircuitBreaker(resolvedServiceKey);

    const result = await breaker.execute(async () => {
      return this._synthesizeWithRetry(resolvedRequest, startTime);
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
   */
  async _synthesizeWithRetry(resolvedRequest, startTime) {
    const timeoutMs = DEFAULT_POLICY.timeoutMs;
    const retryTimes = Number.isFinite(DEFAULT_POLICY.retryTimes) ? DEFAULT_POLICY.retryTimes : 1;
    const attempts = Math.max(1, retryTimes + 1);

    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const normalizedOptions = resolvedRequest.getNormalizedOptions();

        // 能力校验（在参数转译之前）
        const adapterKey = `${resolvedRequest.provider}_${resolvedRequest.serviceType}`;
        this._validateCapabilities(adapterKey, normalizedOptions);

        // 参数转译（将用户参数转换为API参数）
        const mappedOptions = await this._translateParameters(
          resolvedRequest.provider,
          resolvedRequest.serviceType,
          normalizedOptions
        );

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
   * 参数转译
   *
   * [WARNING] 当前 DISABLED - 与现有 adapter 入参约定不兼容
   * ProviderConfig.json 定义了映射规则（如 voice -> input.voice），
   * 但 adapter 代码仍读取 params.voice，直接启用会导致回归。
   *
   * TODO: 统一 adapter 入参约定后再启用
   */
  async _translateParameters(provider, serviceType, options) {
    // 暂时禁用：返回原始参数，避免与 adapter 不兼容
    return options;

    // 以下是原始实现，暂不启用
    // if (!this.parameterMapper) {
    //   return options;
    // }
    // try {
    //   return this.parameterMapper.mapAndValidate(provider, serviceType, options);
    // } catch (error) {
    //   this.metrics.parameterMappingErrors++;
    //   console.warn(`[TtsSynthesisService] Parameter mapping failed:`, error.message);
    //   return options;
    // }
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
   * 获取可用音色
   */
  async getVoices(provider, serviceType) {
    if (provider && serviceType) {
      return this.voiceCatalog.getByProviderAndService(provider, serviceType);
    }
    if (provider) {
      return this.voiceCatalog.getByProvider(provider);
    }
    return this.voiceCatalog.getAll();
  }

  /**
   * 获取所有可用音色（按服务分组）
   */
  async getAllVoices() {
    return this.voiceCatalog.getAllGroupedByService();
  }

  /**
   * 获取可用服务提供商
   */
  getProviders() {
    return this.ttsProvider.getAvailableProviders();
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
   */
  setQueryService(queryService) {
    this.queryService = queryService;
  }

  queryVoices(filters = {}) {
    return this.queryService?.queryVoices(filters);
  }

  getFrontendCatalog() {
    return this.queryService?.getFrontendCatalog();
  }

  getVoice(voiceId) {
    return this.queryService?.getVoice(voiceId);
  }

  getVoiceDetail(voiceId) {
    return this.queryService?.getVoiceDetail(voiceId);
  }

  getCapabilities(serviceKey) {
    return this.queryService?.getCapabilities(serviceKey);
  }

  getFilterOptions() {
    return this.queryService?.getFilterOptions();
  }

  getFrontendVoices() {
    return this.queryService?.getFrontendVoices();
  }

  getVoices(provider, serviceType) {
    return this.queryService?.getVoices(provider, serviceType);
  }

  getAllVoices() {
    return this.queryService?.getAllVoices();
  }

  getProviders() {
    return this.queryService?.getProviders() || this.ttsProvider?.getAvailableProviders();
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

      const SynthesisRequest = require('./SynthesisRequest');
      return new SynthesisRequest({
        text: request.text,
        service: request.service,
        voiceCode: resolved.voiceCode,
        systemId: resolved.systemId,
        provider: resolved.providerKey,
        serviceType: resolved.serviceKey,
        options: {
          ...request.options,
          // 关键：使用解析后的 provider_voice_id
          voice: resolved.voiceId,
          voiceId: resolved.voiceId
        }
      });
    } catch (error) {
      if (!error.code) error.code = 'VOICE_NOT_FOUND';
      throw error;
    }
  }

  /**
   * 通过 VoiceResolver 解析（service + voice 组合）
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

      const SynthesisRequest = require('./SynthesisRequest');
      return new SynthesisRequest({
        text: request.text,
        service: request.service,
        voiceCode: resolved.voiceCode,
        systemId: resolved.systemId,
        provider: resolved.providerKey,
        serviceType: resolved.serviceKey,
        options: {
          ...request.options,
          // 关键：使用解析后的 provider_voice_id
          voice: resolved.voiceId,
          voiceId: resolved.voiceId
        }
      });
    } catch (error) {
      if (!error.code) error.code = 'VOICE_NOT_FOUND';
      throw error;
    }
  }

  /**
   * 从 systemId 解析服务信息
   * 使用 VoiceResolver 统一解析，确保返回 providerVoiceId 而非 sourceId
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

      const SynthesisRequest = require('./SynthesisRequest');
      return new SynthesisRequest({
        text: request.text,
        service: request.service,
        voiceCode: resolved.voiceCode,
        systemId: resolved.systemId,
        provider: resolved.providerKey,
        serviceType: resolved.serviceKey,
        options: {
          ...request.options,
          // 关键：使用解析后的 provider_voice_id（而非 sourceId）
          voice: resolved.voiceId,
          voiceId: resolved.voiceId
        }
      });
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