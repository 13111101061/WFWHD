/**
 * MetricsCollector - 指标收集器
 * 收集和聚合服务指标
 */

class MetricsCollector {
  /**
   * @param {Object} options
   * @param {number} [options.maxHistory=1000] - 最大历史记录数
   */
  constructor(options = {}) {
    this.maxHistory = options.maxHistory || 1000;

    // 计数器
    this.counters = new Map();

    // 直方图（用于延迟等）
    this.histograms = new Map();

    // 时间序列数据
    this.timeSeries = new Map();

    // 最近事件
    this.recentEvents = [];
  }

  /**
   * 增加计数器
   * @param {string} name - 计数器名称
   * @param {number} [value=1] - 增加值
   * @param {Object} [labels] - 标签
   */
  increment(name, value = 1, labels = {}) {
    const key = this._makeKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  /**
   * 记录观测值（用于直方图）
   * @param {string} name - 指标名称
   * @param {number} value - 观测值
   * @param {Object} [labels] - 标签
   */
  observe(name, value, labels = {}) {
    const key = this._makeKey(name, labels);

    if (!this.histograms.has(key)) {
      this.histograms.set(key, {
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        values: []
      });
    }

    const histogram = this.histograms.get(key);
    histogram.count++;
    histogram.sum += value;
    histogram.min = Math.min(histogram.min, value);
    histogram.max = Math.max(histogram.max, value);
    histogram.values.push(value);

    // 限制历史大小
    if (histogram.values.length > this.maxHistory) {
      histogram.values.shift();
    }
  }

  /**
   * 记录时间序列数据点
   * @param {string} name - 指标名称
   * @param {number} value - 值
   */
  recordTimeSeries(name, value) {
    if (!this.timeSeries.has(name)) {
      this.timeSeries.set(name, []);
    }

    const series = this.timeSeries.get(name);
    series.push({
      timestamp: Date.now(),
      value
    });

    // 限制历史大小
    if (series.length > this.maxHistory) {
      series.shift();
    }
  }

  /**
   * 记录事件
   * @param {string} type - 事件类型
   * @param {Object} data - 事件数据
   */
  recordEvent(type, data = {}) {
    const event = {
      type,
      timestamp: Date.now(),
      ...data
    };

    this.recentEvents.push(event);

    // 限制历史大小
    if (this.recentEvents.length > this.maxHistory) {
      this.recentEvents.shift();
    }
  }

  /**
   * 计时辅助方法
   * @param {string} name - 指标名称
   * @param {Object} [labels] - 标签
   * @returns {Function} 调用以停止计时
   */
  startTimer(name, labels = {}) {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.observe(name, duration, labels);
      return duration;
    };
  }

  /**
   * 获取计数器值
   * @param {string} name
   * @param {Object} [labels]
   */
  getCounter(name, labels = {}) {
    const key = this._makeKey(name, labels);
    return this.counters.get(key) || 0;
  }

  /**
   * 获取直方图统计
   * @param {string} name
   * @param {Object} [labels]
   */
  getHistogram(name, labels = {}) {
    const key = this._makeKey(name, labels);
    const histogram = this.histograms.get(key);

    if (!histogram) {
      return null;
    }

    const values = histogram.values;
    const sorted = [...values].sort((a, b) => a - b);

    return {
      count: histogram.count,
      sum: histogram.sum,
      avg: histogram.count > 0 ? histogram.sum / histogram.count : 0,
      min: histogram.min === Infinity ? 0 : histogram.min,
      max: histogram.max === -Infinity ? 0 : histogram.max,
      p50: this._percentile(sorted, 50),
      p90: this._percentile(sorted, 90),
      p95: this._percentile(sorted, 95),
      p99: this._percentile(sorted, 99)
    };
  }

  /**
   * 获取时间序列数据
   * @param {string} name
   * @param {number} [since] - 起始时间戳
   */
  getTimeSeries(name, since = 0) {
    const series = this.timeSeries.get(name) || [];
    if (since > 0) {
      return series.filter(p => p.timestamp >= since);
    }
    return series;
  }

  /**
   * 获取最近事件
   * @param {string} [type] - 事件类型过滤
   * @param {number} [limit=50] - 最大数量
   */
  getRecentEvents(type, limit = 50) {
    let events = this.recentEvents;
    if (type) {
      events = events.filter(e => e.type === type);
    }
    return events.slice(-limit);
  }

  /**
   * 获取所有指标摘要
   */
  getSummary() {
    const counters = {};
    for (const [key, value] of this.counters) {
      counters[key] = value;
    }

    const histograms = {};
    for (const [key] of this.histograms) {
      histograms[key] = this.getHistogram(key.split(':')[0], this._parseLabels(key));
    }

    return {
      counters,
      histograms,
      timeSeriesCount: this.timeSeries.size,
      recentEventsCount: this.recentEvents.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 重置所有指标
   */
  reset() {
    this.counters.clear();
    this.histograms.clear();
    this.timeSeries.clear();
    this.recentEvents = [];
  }

  // ==================== 私有方法 ====================

  _makeKey(name, labels) {
    if (Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}:{${labelStr}}`;
  }

  _parseLabels(key) {
    const match = key.match(/\{(.+)\}$/);
    if (!match) return {};

    const labels = {};
    match[1].split(',').forEach(pair => {
      const [k, v] = pair.split('=');
      labels[k] = v;
    });
    return labels;
  }

  _percentile(sortedValues, p) {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }
}

module.exports = MetricsCollector;