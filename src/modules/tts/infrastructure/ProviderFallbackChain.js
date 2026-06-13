/**
 * ProviderFallbackChain - Provider 自动降级链路
 *
 * 职责：
 * - 当主 Provider 不可用时（circuit open / 凭证失效 / 超时），查找能力最接近的备选
 * - 按 capabilityDigest 相似度排序
 * - 排除同样不可用的备选
 * - 选择健康度最高的候选
 */

class ProviderFallbackChain {
  /**
   * @param {Object} deps
   * @param {Object} deps.executionPolicy - 执行策略（检查 circuit breaker 状态）
   * @param {Object} deps.capabilityResolver - 能力解析器
   * @param {Object} deps.providerManagementService - 服务商管理
   */
  constructor({ executionPolicy, capabilityResolver, providerManagementService }) {
    this._executionPolicy = executionPolicy;
    this._capabilityResolver = capabilityResolver;
    this._pms = providerManagementService;
  }

  /**
   * 获取降级候选列表
   * @param {string} failedServiceKey - 失败的服务 key
   * @returns {Object[]} 按优先级排序的备选列表 [{ key, similarity, score }]
   */
  getCandidates(failedServiceKey) {
    let failedContext;
    try {
      failedContext = this._capabilityResolver.resolve(failedServiceKey);
    } catch (e) {
      return [];
    }

    if (!failedContext?.compiled) return [];

    const allServices = this._pms.getAllServices();
    const candidates = [];

    for (const svc of allServices) {
      if (svc.key === failedServiceKey) continue;
      if (svc.status === 'disabled') continue;

      try {
        const ctx = this._capabilityResolver.resolve(svc.key);
        if (!ctx?.compiled) continue;

        const similarity = this._calculateSimilarity(
          failedContext.compiled,
          ctx.compiled
        );

        const isCircuitOpen = this._executionPolicy.isCircuitOpen
          ? this._executionPolicy.isCircuitOpen(svc.key)
          : false;

        const availability = this._pms.checkServiceAvailability(svc.key);
        const isAvailable = availability.available;

        const score = (isCircuitOpen || !isAvailable)
          ? similarity * 0.2
          : similarity;

        if (score > 0.2) {
          candidates.push({
            key: svc.key,
            provider: svc.provider,
            serviceType: svc.service,
            similarity: Math.round(similarity * 100) / 100,
            score: Math.round(score * 100) / 100,
            circuitOpen: isCircuitOpen,
            available: isAvailable
          });
        }
      } catch (e) {
        continue;
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  /**
   * 计算两个 CompiledCapability 的能力相似度（0-1）
   */
  _calculateSimilarity(source, target) {
    if (!source || !target) return 0;

    const sourceSchema = source.getSchema();
    const targetSchema = target.getSchema();

    const sourceSupported = new Set(
      Object.entries(sourceSchema)
        .filter(([, f]) => f.status === 'supported')
        .map(([k]) => k)
    );

    const targetSupported = new Set(
      Object.entries(targetSchema)
        .filter(([, f]) => f.status === 'supported')
        .map(([k]) => k)
    );

    if (sourceSupported.size === 0 && targetSupported.size === 0) return 1;

    let matchCount = 0;
    for (const key of sourceSupported) {
      if (targetSupported.has(key)) matchCount++;
    }

    const unionSize = new Set([...sourceSupported, ...targetSupported]).size;
    return unionSize > 0 ? matchCount / unionSize : 0;
  }

  /**
   * 判断错误是否可降级
   */
  isDegradable(error) {
    if (!error) return false;
    const degradableCodes = [
      'CIRCUIT_OPEN',
      'RATE_LIMIT_EXCEEDED',
      'PROVIDER_UNAVAILABLE',
      'PROVIDER_ERROR',
      'TIMEOUT_ERROR',
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED'
    ];
    return degradableCodes.includes(error.code);
  }
}

module.exports = { ProviderFallbackChain };
