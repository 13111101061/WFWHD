/**
 * ProviderMetricsCollector - Provider 调用指标收集器
 *
 * 职责：
 * - 记录每次合成调用的结构化指标（延迟、成功率、错误码）
 * - 支持 Redis 持久化（sorted set + 聚合 hash）
 * - Redis 不可用时回退到内存模式
 * - 提供滑动窗口查询（p50/p95/p99 延迟、成功率、错误分布）
 */

class ProviderMetricsCollector {
  constructor({ redis = null, windowSeconds = 86400 } = {}) {
    this._redis = redis;
    this._windowSeconds = windowSeconds;
    this._memoryStore = new Map();
    this._useRedis = !!redis;
  }

  /**
   * 记录一次合成调用
   */
  async record(metric) {
    const record = {
      requestId: metric.requestId || null,
      providerKey: metric.providerKey,
      serviceKey: metric.serviceKey,
      credentialAccountId: metric.credentialAccountId || null,
      latencyMs: metric.latencyMs,
      success: metric.success,
      errorCode: metric.errorCode || null,
      errorMessage: metric.errorMessage || null,
      inputTextLength: metric.inputTextLength || 0,
      outputFormat: metric.outputFormat || null,
      outputSampleRate: metric.outputSampleRate || null,
      timestamp: metric.timestamp || new Date().toISOString()
    };

    if (this._useRedis) {
      await this._recordToRedis(record);
    } else {
      this._recordToMemory(record);
    }
  }

  async _recordToRedis(metric) {
    try {
      const key = `provider_metrics:${metric.serviceKey}`;
      const score = Date.now();

      await this._redis.zAdd(key, score, JSON.stringify(metric));
      await this._redis.expire(key, 7 * 24 * 3600);

      await this._updateAggregates(metric);
    } catch (e) {
      this._recordToMemory(metric);
    }
  }

  async _updateAggregates(metric) {
    try {
      const aggKey = `provider_agg:${metric.serviceKey}`;
      const hourKey = new Date().toISOString().slice(0, 13);

      await this._redis.hIncrBy(`${aggKey}:${hourKey}`, 'total', 1);
      if (metric.success) {
        await this._redis.hIncrBy(`${aggKey}:${hourKey}`, 'success', 1);
      } else {
        await this._redis.hIncrBy(`${aggKey}:${hourKey}`, 'error', 1);
      }
      await this._redis.hIncrBy(`${aggKey}:${hourKey}`, 'totalLatency', metric.latencyMs);
      await this._redis.expire(`${aggKey}:${hourKey}`, 7 * 24 * 3600);
    } catch (e) {
      // 聚合失败不影响主记录
    }
  }

  _recordToMemory(metric) {
    const key = metric.serviceKey;
    if (!this._memoryStore.has(key)) {
      this._memoryStore.set(key, []);
    }
    const records = this._memoryStore.get(key);
    metric._ts = Date.now();
    records.push(metric);

    const cutoff = Date.now() - this._windowSeconds * 1000;
    const filtered = records.filter(r => {
      const ts = r._ts || new Date(r.timestamp).getTime();
      return ts > cutoff;
    });
    this._memoryStore.set(key, filtered);
  }

  /**
   * 查询某 provider 的指标摘要
   */
  async getMetrics(serviceKey, windowMs = 3600000) {
    let records;

    if (this._useRedis) {
      records = await this._getFromRedis(serviceKey, windowMs);
    } else {
      records = this._getFromMemory(serviceKey, windowMs);
    }

    if (records.length === 0) {
      return {
        serviceKey,
        totalCalls: 0,
        windowMinutes: Math.round(windowMs / 60000)
      };
    }

    const latencies = records.map(r => r.latencyMs).sort((a, b) => a - b);
    const successCount = records.filter(r => r.success).length;

    return {
      serviceKey,
      totalCalls: records.length,
      successRate: (successCount / records.length * 100).toFixed(1) + '%',
      latency: {
        p50: latencies[Math.floor(latencies.length * 0.5)],
        p95: latencies[Math.floor(latencies.length * 0.95)],
        p99: latencies[Math.floor(latencies.length * 0.99)],
        avg: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
        min: latencies[0],
        max: latencies[latencies.length - 1]
      },
      errors: this._groupErrors(records.filter(r => !r.success)),
      windowMinutes: Math.round(windowMs / 60000)
    };
  }

  async _getFromRedis(serviceKey, windowMs) {
    try {
      const key = `provider_metrics:${serviceKey}`;
      const since = Date.now() - windowMs;
      const records = await this._redis.zRangeByScore(key, since, Date.now());
      return records.map(r => JSON.parse(r));
    } catch (e) {
      return this._getFromMemory(serviceKey, windowMs);
    }
  }

  _getFromMemory(serviceKey, windowMs) {
    const records = this._memoryStore.get(serviceKey) || [];
    const cutoff = Date.now() - windowMs;
    return records.filter(r => new Date(r.timestamp).getTime() > cutoff);
  }

  _groupErrors(errorRecords) {
    const grouped = {};
    for (const r of errorRecords) {
      const code = r.errorCode || 'UNKNOWN';
      grouped[code] = (grouped[code] || 0) + 1;
    }
    return grouped;
  }

  /**
   * 获取所有服务的指标摘要
   */
  async getAllMetrics(windowMs = 3600000) {
    const serviceKeys = this._useRedis
      ? await this._getAllServiceKeysFromRedis()
      : Array.from(this._memoryStore.keys());

    const results = {};
    for (const key of serviceKeys) {
      results[key] = await this.getMetrics(key, windowMs);
    }
    return results;
  }

  async _getAllServiceKeysFromRedis() {
    try {
      const keys = await this._redis.keys('provider_metrics:*');
      return keys.map(k => k.replace('provider_metrics:', ''));
    } catch (e) {
      return Array.from(this._memoryStore.keys());
    }
  }

  /**
   * 清理过期数据
   */
  async cleanup() {
    if (this._useRedis) {
      // Redis 靠 TTL 自动清理
      return;
    }

    const cutoff = Date.now() - this._windowSeconds * 1000;
    for (const [key, records] of this._memoryStore.entries()) {
      const filtered = records.filter(r => {
        const ts = r._ts || new Date(r.timestamp).getTime();
        return ts > cutoff;
      });
      if (filtered.length === 0) {
        this._memoryStore.delete(key);
      } else {
        this._memoryStore.set(key, filtered);
      }
    }
  }
}

module.exports = { ProviderMetricsCollector };
