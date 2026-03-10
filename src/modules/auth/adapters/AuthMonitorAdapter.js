/**
 * AuthMonitorAdapter - 认证监控适配器
 * 实现 IAuthMonitor 接口
 * 默认使用内存存储事件日志
 */

const IAuthMonitor = require('../ports/IAuthMonitor');
const EventEmitter = require('events');
const crypto = require('crypto');

class AuthMonitorAdapter extends IAuthMonitor {
  constructor(options = {}) {
    super();

    // 使用EventEmitter提供事件功能
    this.events = new EventEmitter();
    this.eventLog = [];
    this.metrics = new Map();

    this.options = {
      maxEvents: options.maxEvents || 5000,
      enableRealTimeMetrics: options.enableRealTimeMetrics !== false,
      metricsInterval: options.metricsInterval || 30000
    };

    if (this.options.enableRealTimeMetrics) {
      this._startMetricsCollection();
    }
  }

  recordAuthSuccess(data) {
    return this._recordEvent('auth:success', {
      ...data,
      outcome: 'success'
    });
  }

  recordAuthFailure(data, reason, code = 'UNKNOWN') {
    return this._recordEvent('auth:failure', {
      ...data,
      outcome: 'failure',
      reason,
      code
    });
  }

  recordAccessDenied(data, reason) {
    return this._recordEvent('auth:denied', {
      ...data,
      outcome: 'denied',
      reason
    });
  }

  getRecentEvents(limit = 50) {
    return this.eventLog.slice(0, limit);
  }

  getRealTimeMetrics() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const recentEvents = this.eventLog.filter(e => e.timestamp > oneHourAgo);

    const summary = {
      total: recentEvents.length,
      success: 0,
      failure: 0,
      denied: 0,
      failureRate: 0
    };

    recentEvents.forEach(event => {
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

    return {
      timestamp: now,
      lastHour: summary,
      currentMinute: this._getCurrentMinuteMetrics(),
      recentEventCount: recentEvents.length
    };
  }

  hashApiKey(apiKey) {
    if (!apiKey) return null;
    return crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 12);
  }

  /**
   * 订阅事件
   */
  on(event, listener) {
    this.events.on(event, listener);
    return this;
  }

  /**
   * 取消订阅
   */
  off(event, listener) {
    this.events.off(event, listener);
    return this;
  }

  // ==================== 私有方法 ====================

  _recordEvent(eventType, data) {
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

    // 添加到日志
    this.eventLog.unshift(event);
    if (this.eventLog.length > this.options.maxEvents) {
      this.eventLog = this.eventLog.slice(0, this.options.maxEvents);
    }

    // 更新指标
    this._updateMetrics(event);

    // 发送事件
    this.events.emit(eventType, event);

    return event.id;
  }

  _updateMetrics(event) {
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

  _getCurrentMinuteMetrics() {
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

  _startMetricsCollection() {
    this.metricsTimer = setInterval(() => {
      const metrics = this.getRealTimeMetrics();
      this.events.emit('metrics', metrics);
    }, this.options.metricsInterval);

    if (this.metricsTimer.unref) {
      this.metricsTimer.unref();
    }
  }

  /**
   * 停止指标收集
   */
  stop() {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }
}

module.exports = AuthMonitorAdapter;