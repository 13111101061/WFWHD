/**
 * Auth Module - 独立认证模块
 *
 * 这是一个完全独立的基础设施模块，可被任何微服务复用。
 * 不依赖任何业务逻辑，只提供认证、授权、限流、监控等通用能力。
 *
 * 使用方式：
 * ```javascript
 * const authModule = require('./modules/auth');
 *
 * // 初始化
 * authModule.initialize({
 *   rateLimit: { requests: 100, window: 60000 },
 *   keys: process.env.API_KEYS?.split(',')
 * });
 *
 * // 创建中间件
 * app.use(authModule.createMiddleware({ service: 'my-service' }));
 * ```
 *
 * 架构设计：
 * - Ports: 定义接口（IApiKeyRepository, IAuthMonitor）
 * - Domain: 纯业务逻辑（AuthenticationService）
 * - Adapters: 具体实现（ApiKeyRepository, AuthHttpAdapter）
 * - Container: 依赖注入容器（AuthContainer）
 */

const AuthContainer = require('./adapters/AuthContainer');

// 单例容器
let _container = null;
let _initialized = false;

/**
 * 初始化认证模块
 * @param {Object} options
 * @param {Object} [options.rateLimit] - 限流配置
 * @param {number} [options.rateLimit.requests=100] - 请求数限制
 * @param {number} [options.rateLimit.window=60000] - 时间窗口(ms)
 * @param {string[]} [options.keys] - 预配置的API密钥
 * @param {number} [options.maxEvents=5000] - 最大事件记录数
 * @param {boolean} [options.enableMetrics=true] - 启用指标收集
 */
function initialize(options = {}) {
  if (_initialized) {
    console.warn('[AuthModule] Already initialized, skipping...');
    return _container;
  }

  _container = new AuthContainer();
  _container.initialize({
    enableRateLimit: options.rateLimit !== false,
    rateLimit: options.rateLimit || { requests: 100, window: 60000 },
    maxEvents: options.maxEvents || 5000,
    enableRealTimeMetrics: options.enableMetrics !== false
  });

  _initialized = true;
  console.log('[AuthModule] Initialized successfully');

  return _container;
}

/**
 * 获取容器实例
 * @returns {AuthContainer}
 */
function getContainer() {
  if (!_initialized) {
    throw new Error('[AuthModule] Not initialized. Call initialize() first.');
  }
  return _container;
}

/**
 * 创建认证中间件
 * @param {Object} options
 * @param {string} [options.service] - 服务名称
 * @param {boolean} [options.required=true] - 是否必须认证
 * @param {string[]} [options.permissions=[]] - 所需权限
 * @param {string} [options.rateLimitTier='default'] - 限流层级
 * @returns {Function} Express中间件
 */
function createMiddleware(options = {}) {
  return getContainer().createMiddleware(options);
}

/**
 * 验证API密钥（无HTTP上下文）
 * @param {string} apiKey
 * @param {string} [service]
 * @returns {Promise<Object>}
 */
async function verifyKey(apiKey, service) {
  return getContainer().get('keyRepository').verifyKey(apiKey, service);
}

/**
 * 生成新API密钥
 * @param {Object} options
 * @returns {{ key: string, keyInfo: Object }}
 */
function generateKey(options = {}) {
  return getContainer().generateKey(options);
}

/**
 * 撤销API密钥
 * @param {string} apiKey
 * @param {string} reason
 * @returns {boolean}
 */
function revokeKey(apiKey, reason) {
  return getContainer().revokeKey(apiKey, reason);
}

/**
 * 获取所有密钥
 * @returns {Object[]}
 */
function getAllKeys() {
  return getContainer().getAllKeys();
}

/**
 * 获取认证统计
 * @returns {Object}
 */
function getStats() {
  return getContainer().getStats();
}

/**
 * 获取实时指标
 * @returns {Object}
 */
function getMetrics() {
  return getContainer().get('monitor').getRealTimeMetrics();
}

/**
 * 获取最近事件
 * @param {number} [limit=50]
 * @returns {Object[]}
 */
function getRecentEvents(limit = 50) {
  return getContainer().getRecentEvents(limit);
}

/**
 * 检查是否已初始化
 * @returns {boolean}
 */
function isInitialized() {
  return _initialized;
}

/**
 * 重置模块（用于测试）
 */
function reset() {
  if (_container) {
    _container.reset();
  }
  _container = null;
  _initialized = false;
}

// 导出模块接口
module.exports = {
  // 核心方法
  initialize,
  createMiddleware,

  // 密钥管理
  verifyKey,
  generateKey,
  revokeKey,
  getAllKeys,

  // 监控
  getStats,
  getMetrics,
  getRecentEvents,

  // 状态
  isInitialized,
  reset,
  getContainer,

  // 类型导出（用于扩展）
  AuthContainer,
  AuthenticationService: require('./domain/AuthenticationService'),
  IApiKeyRepository: require('./ports/IApiKeyRepository'),
  IAuthMonitor: require('./ports/IAuthMonitor')
};