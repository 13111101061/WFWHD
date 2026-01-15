const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * 认证监控器 - 提供基础的监控和审计功能
 */
class AuthMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      maxEvents: options.maxEvents || 5000,
      enableRealTimeMetrics: options.enableRealTimeMetrics !== false,
      metricsInterval: options.metricsInterval || 30000
    };

    this.events = [];
    this.metrics = new Map();

    if (this.options.enableRealTimeMetrics) {
      this.startMetricsCollection();
    }
  }

  /**
   * 记录认证事件
   */
  recordEvent(eventType, data) {
    const event = {
      id: crypto.randomUUID(),
      type: eventType,
      timestamp: new Date(),
      data: {
        ...data,
        apiKey: data.apiKey ? this.hashApiKey(data.apiKey) : null,
        userAgent: data.userAgent?.substring(0, 100) || null
      }
    };

    this.events.unshift(event);
    if (this.events.length > this.options.maxEvents) {
      this.events = this.events.slice(0, this.options.maxEvents);
    }

    this.updateMetrics(event);
    this.emit(eventType, event);

    return event.id;
  }

  /**
   * 认证成功事件
   */
  recordAuthSuccess(data) {
    return this.recordEvent('auth:success', {
      ...data,
      outcome: 'success'
    });
  }

  /**
   * 认证失败事件
   */
  recordAuthFailure(data, reason, code = 'UNKNOWN') {
    return this.recordEvent('auth:failure', {
      ...data,
      outcome: 'failure',
      reason,
      code
    });
  }

  /**
   * 权限拒绝事件
   */
  recordAccessDenied(data, reason) {
    return this.recordEvent('auth:denied', {
      ...data,
      outcome: 'denied',
      reason
    });
  }

  /**
   * 更新指标
   */
  updateMetrics(event) {
    const minute = Math.floor(event.timestamp.getTime() / 60000);
    const minuteKey = `${minute}`;

    if (!this.metrics.has(minuteKey)) {
      this.metrics.set(minuteKey, {
        timestamp: new Date(minute * 60000),
        total: 0,
        success: 0,
        failure: 0,
        denied: 0,
        uniqueIps: new Set(),
        uniqueKeys: new Set()
      });
    }

    const minuteMetrics = this.metrics.get(minuteKey);
    minuteMetrics.total++;

    switch (event.type) {
      case 'auth:success':
        minuteMetrics.success++;
        break;
      case 'auth:failure':
        minuteMetrics.failure++;
        break;
      case 'auth:denied':
        minuteMetrics.denied++;
        break;
    }

    if (event.data.ip) {
      minuteMetrics.uniqueIps.add(event.data.ip);
    }
    if (event.data.apiKey) {
      minuteMetrics.uniqueKeys.add(event.data.apiKey);
    }
  }

  /**
   * 启动指标收集
   */
  startMetricsCollection() {
    setInterval(() => {
      const metrics = this.getRealTimeMetrics();
      this.emit('metrics', metrics);
    }, this.options.metricsInterval);
  }

  /**
   * 获取实时指标
   */
  getRealTimeMetrics() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const recentEvents = this.events.filter(e => e.timestamp > oneHourAgo);

    const summary = this.summarizeEvents(recentEvents);
    const currentMinute = this.getCurrentMinuteMetrics();

    return {
      timestamp: now,
      lastHour: summary,
      currentMinute,
      recentEventCount: recentEvents.length
    };
  }

  /**
   * 总结事件
   */
  summarizeEvents(events) {
    const summary = {
      total: events.length,
      success: 0,
      failure: 0,
      denied: 0,
      failureRate: 0
    };

    events.forEach(event => {
      switch (event.type) {
        case 'auth:success':
          summary.success++;
          break;
        case 'auth:failure':
          summary.failure++;
          break;
        case 'auth:denied':
          summary.denied++;
          break;
      }
    });

    const authEvents = summary.success + summary.failure + summary.denied;
    summary.failureRate = authEvents > 0 ? summary.failure / authEvents : 0;

    return summary;
  }

  /**
   * 获取当前分钟指标
   */
  getCurrentMinuteMetrics() {
    const currentMinute = Math.floor(Date.now() / 60000);
    const metrics = this.metrics.get(`${currentMinute}`);

    if (!metrics) {
      return {
        timestamp: new Date(),
        total: 0,
        success: 0,
        failure: 0,
        uniqueIps: 0,
        uniqueKeys: 0
      };
    }

    return {
      timestamp: metrics.timestamp,
      total: metrics.total,
      success: metrics.success,
      failure: metrics.failure,
      uniqueIps: metrics.uniqueIps.size,
      uniqueKeys: metrics.uniqueKeys.size
    };
  }

  /**
   * 获取最近事件
   */
  getRecentEvents(limit = 50) {
    return this.events.slice(0, limit);
  }

  /**
   * 工具方法
   */
  hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 12);
  }

  /**
   * 清理过期数据
   */
  cleanup() {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    this.events = this.events.filter(e => e.timestamp > oneWeekAgo);

    const oneHourAgo = Math.floor(Date.now() / 60000) - 60;
    for (const [key] of this.metrics) {
      if (parseInt(key) < oneHourAgo) {
        this.metrics.delete(key);
      }
    }
  }
}

module.exports = AuthMonitor;