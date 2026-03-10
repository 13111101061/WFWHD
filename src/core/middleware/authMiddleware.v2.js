/**
 * 认证中间件 v2.0 - 规范化架构
 *
 * 架构变更：
 * - 旧: UnifiedAuthMiddleware (God Class) - 混合认证、限流、监控、HTTP响应
 * - 新: AuthenticationService (Domain) + AuthHttpAdapter (Adapter)
 *
 * 使用方式：
 * const { authContainer } = require('./authMiddleware.v2');
 * app.use(authContainer.createMiddleware({ service: 'tts' }));
 */

const authModule = require('../../modules/auth');

// 初始化（延迟初始化，首次使用时自动初始化）
let initialized = false;

function ensureInitialized() {
  if (!initialized) {
    authModule.initialize({
      enableRateLimit: true,
      rateLimit: {
        requests: 100,
        window: 60000
      },
      maxEvents: 5000
    });
    initialized = true;
  }
  return authModule.getContainer();
}

/**
 * 创建认证中间件
 * @param {Object} options
 * @param {string} [options.service] - 服务名称
 * @param {boolean} [options.required=true] - 是否必须认证
 * @param {string[]} [options.permissions=[]] - 所需权限
 * @param {string} [options.rateLimitTier='default'] - 限流层级
 * @param {Object} [options.metadata={}] - 元数据
 */
function createMiddleware(options = {}) {
  ensureInitialized();
  return authModule.createMiddleware(options);
}

/**
 * 获取统计信息
 */
function getStats() {
  ensureInitialized();
  return authModule.getStats();
}

/**
 * 获取最近事件
 */
function getRecentEvents(limit = 50) {
  ensureInitialized();
  return authModule.getRecentEvents(limit);
}

/**
 * 生成新密钥
 */
function generateKey(options = {}) {
  ensureInitialized();
  return authModule.generateKey(options);
}

/**
 * 撤销密钥
 */
function revokeKey(apiKey, reason) {
  ensureInitialized();
  return authModule.revokeKey(apiKey, reason);
}

/**
 * 获取所有密钥
 */
function getAllKeys() {
  ensureInitialized();
  return authModule.getAllKeys();
}

/**
 * 获取实时指标
 */
function getMetrics() {
  ensureInitialized();
  return authModule.getMetrics();
}

// 向后兼容：导出与旧版本相同的接口
const unifiedAuth = {
  createMiddleware,
  getStats,
  getRecentEvents,
  generateKey,
  revokeKey,
  getAllKeys,
  getMetrics
};

// 默认中间件
const apiKeyMiddleware = createMiddleware({
  required: true,
  permissions: [],
  rateLimitTier: 'default'
});

module.exports = {
  // 新接口
  authModule,
  createMiddleware,

  // 向后兼容接口
  unifiedAuth,
  apiKeyMiddleware,

  // 管理方法
  getStats,
  getRecentEvents,
  generateKey,
  revokeKey,
  getAllKeys,
  getMetrics,

  // 便捷方法
  middleware: (options) => createMiddleware(options)
};