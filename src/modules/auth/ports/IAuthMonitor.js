/**
 * IAuthMonitor - 认证监控接口
 * 端口：定义认证事件监控的抽象接口
 *
 * 实现此接口可以支持不同的监控后端：
 * - 内存事件日志（默认）
 * - Prometheus
 * - Datadog
 * - 自定义监控系统
 */

/**
 * @typedef {Object} AuthEvent
 * @property {string} id - 事件ID
 * @property {string} type - 事件类型 (auth:success, auth:failure, auth:denied)
 * @property {Date} timestamp - 时间戳
 * @property {Object} data - 事件数据
 */

class IAuthMonitor {
  /**
   * 记录认证成功
   * @param {Object} data
   * @returns {string} 事件ID
   */
  recordAuthSuccess(data) {
    throw new Error('IAuthMonitor.recordAuthSuccess must be implemented');
  }

  /**
   * 记录认证失败
   * @param {Object} data
   * @param {string} reason
   * @param {string} code
   * @returns {string} 事件ID
   */
  recordAuthFailure(data, reason, code) {
    throw new Error('IAuthMonitor.recordAuthFailure must be implemented');
  }

  /**
   * 记录访问拒绝
   * @param {Object} data
   * @param {string} reason
   * @returns {string} 事件ID
   */
  recordAccessDenied(data, reason) {
    throw new Error('IAuthMonitor.recordAccessDenied must be implemented');
  }

  /**
   * 获取最近事件
   * @param {number} limit
   * @returns {AuthEvent[]}
   */
  getRecentEvents(limit) {
    throw new Error('IAuthMonitor.getRecentEvents must be implemented');
  }

  /**
   * 获取实时指标
   * @returns {Object}
   */
  getRealTimeMetrics() {
    throw new Error('IAuthMonitor.getRealTimeMetrics must be implemented');
  }

  /**
   * 哈希API密钥（用于日志脱敏）
   * @param {string} apiKey
   * @returns {string}
   */
  hashApiKey(apiKey) {
    throw new Error('IAuthMonitor.hashApiKey must be implemented');
  }
}

module.exports = IAuthMonitor;