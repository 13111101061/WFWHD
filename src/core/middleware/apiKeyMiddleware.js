/**
 * 统一认证中间件 - 向后兼容层
 *
 * 架构说明：
 * - 此文件作为向后兼容层，内部使用新的独立认证模块
 * - 新代码应直接使用: require('../../modules/auth')
 * - 迁移指南: docs/architecture/ADR-004-authentication-refactoring.md
 */

const authModule = require('../../modules/auth');

/**
 * 统一认证中间件 - 专为微服务节点设计
 * 替换原有的混乱认证系统
 *
 * @deprecated 请使用 authModule.createMiddleware() 代替
 */
class UnifiedAuthMiddleware {
  constructor(options = {}) {
    // 使用新的认证模块
    if (!authModule.isInitialized()) {
      authModule.initialize({
        enableRateLimit: options.enableRateLimit !== false,
        rateLimit: options.rateLimits?.default || { requests: 100, window: 60000 },
        maxEvents: options.maxEvents || 5000,
        enableMetrics: options.enableAudit !== false
      });
    }

    this.options = {
      enableRateLimit: options.enableRateLimit !== false,
      rateLimits: {
        default: { requests: 100, window: 60000 },
        premium: { requests: 1000, window: 60000 },
        admin: { requests: 10000, window: 60000 }
      },
      enableAudit: options.enableAudit !== false,
      ...options
    };

    console.log('[UnifiedAuth] Authentication middleware initialized (compatibility layer)');
  }

  /**
   * 创建认证中间件
   */
  createMiddleware(middlewareOptions = {}) {
    return authModule.createMiddleware(middlewareOptions);
  }

  /**
   * 管理方法 - 委托给新模块
   */
  getStats() {
    return authModule.getStats();
  }

  getMetrics() {
    return authModule.getMetrics();
  }

  getRecentEvents(limit = 50) {
    return authModule.getRecentEvents(limit);
  }

  generateKey(options = {}) {
    return authModule.generateKey(options);
  }

  revokeKey(apiKey, reason) {
    return authModule.revokeKey(apiKey, reason);
  }

  getAllKeys() {
    return authModule.getAllKeys();
  }
}

// 创建默认实例
const unifiedAuth = new UnifiedAuthMiddleware();

// 导出中间件函数，保持向后兼容
const apiKeyMiddleware = unifiedAuth.createMiddleware({
  required: true,
  permissions: [],
  rateLimitTier: 'default'
});

module.exports = {
  UnifiedAuthMiddleware,
  apiKeyMiddleware,
  unifiedAuth,
  // 便捷方法
  create: (options) => new UnifiedAuthMiddleware(options),
  middleware: (options) => unifiedAuth.createMiddleware(options)
};
