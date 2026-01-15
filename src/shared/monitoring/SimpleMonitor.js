/**
 * 简化监控器
 * 只保留真正有用的核心指标
 */

class SimpleMonitor {
  constructor() {
    this.startTime = Date.now();

    // 只统计最关键的指标
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0,
      lastHourRequests: 0,
      popularServices: new Map()
    };

    // 每小时重置一次
    this.hourlyReset = setInterval(() => {
      this.stats.lastHourRequests = 0;
    }, 60 * 60 * 1000);
  }

  /**
   * 记录请求
   */
  recordRequest(service, duration, success = true) {
    this.stats.totalRequests++;
    this.stats.lastHourRequests++;

    if (success) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
    }

    // 更新平均响应时间
    this.stats.avgResponseTime =
      (this.stats.avgResponseTime * (this.stats.totalRequests - 1) + duration) / this.stats.totalRequests;

    // 统计热门服务（只保留前3个）
    const count = this.stats.popularServices.get(service) || 0;
    this.stats.popularServices.set(service, count + 1);

    if (this.stats.popularServices.size > 3) {
      const sorted = Array.from(this.stats.popularServices.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      this.stats.popularServices = new Map(sorted);
    }
  }

  /**
   * 获取健康状态
   */
  getHealthStatus() {
    const uptime = Date.now() - this.startTime;
    const errorRate = this.stats.totalRequests > 0 ?
      (this.stats.failedRequests / this.stats.totalRequests * 100).toFixed(1) : 0;

    return {
      status: parseFloat(errorRate) < 10 ? 'healthy' : 'degraded',
      uptime: this.formatUptime(uptime),
      totalRequests: this.stats.totalRequests,
      errorRate: `${errorRate}%`,
      avgResponseTime: `${Math.round(this.stats.avgResponseTime)}ms`,
      lastHourRequests: this.stats.lastHourRequests,
      topServices: this.getTopServices()
    };
  }

  /**
   * 获取简化统计信息
   */
  getSimpleStats() {
    const uptime = Date.now() - this.startTime;
    const errorRate = this.stats.totalRequests > 0 ?
      (this.stats.failedRequests / this.stats.totalRequests * 100).toFixed(1) : 0;

    return {
      total: this.stats.totalRequests,
      successRate: `${(100 - parseFloat(errorRate)).toFixed(1)}%`,
      avgTime: `${Math.round(this.stats.avgResponseTime)}ms`,
      uptime: this.formatUptime(uptime),
      popular: this.getTopServices()
    };
  }

  /**
   * 检查是否健康
   */
  isHealthy() {
    const errorRate = this.stats.totalRequests > 0 ?
      this.stats.failedRequests / this.stats.totalRequests : 0;
    return errorRate < 0.1; // 错误率低于10%认为健康
  }

  /**
   * 重置统计
   */
  reset() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0,
      lastHourRequests: 0,
      popularServices: new Map()
    };
  }

  // 私有方法
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天${hours % 24}小时`;
    if (hours > 0) return `${hours}小时${minutes % 60}分钟`;
    if (minutes > 0) return `${minutes}分钟${seconds % 60}秒`;
    return `${seconds}秒`;
  }

  getTopServices() {
    return Array.from(this.stats.popularServices.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([service, count]) => ({ service, count }));
  }
}

module.exports = SimpleMonitor;