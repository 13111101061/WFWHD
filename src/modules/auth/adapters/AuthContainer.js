/**
 * AuthContainer - 认证服务容器
 * 管理认证相关组件的创建和依赖注入
 *
 * 这是一个独立的服务容器，不依赖任何业务模块。
 */

const AuthenticationService = require('../domain/AuthenticationService');
const ApiKeyRepository = require('./ApiKeyRepository');
const AuthMonitorAdapter = require('./AuthMonitorAdapter');
const AuthHttpAdapter = require('./AuthHttpAdapter');

// 动态导入 RateLimiter（如果可用）
let RateLimiter = null;
try {
  RateLimiter = require('../../../infrastructure/resilience/RateLimiter');
} catch (e) {
  // RateLimiter 不可用时使用内置简单实现
}

class AuthContainer {
  constructor() {
    this._initialized = false;
    this._services = new Map();
  }

  /**
   * 初始化所有服务
   * @param {Object} options
   * @param {boolean} [options.enableRateLimit=true]
   * @param {Object} [options.rateLimit]
   * @param {string[]} [options.keys] - 预配置的API密钥
   * @param {number} [options.maxEvents=5000]
   * @param {boolean} [options.enableRealTimeMetrics=true]
   */
  initialize(options = {}) {
    if (this._initialized) return this;

    console.log('[AuthContainer] Initializing...');

    // 1. 创建仓储
    const keyRepository = new ApiKeyRepository();
    keyRepository.initializeDefaultKeys(options.keys);
    this._services.set('keyRepository', keyRepository);

    // 2. 创建监控器
    const monitor = new AuthMonitorAdapter({
      maxEvents: options.maxEvents || 5000,
      enableRealTimeMetrics: options.enableRealTimeMetrics !== false
    });
    this._services.set('monitor', monitor);

    // 3. 创建限流器（可选）
    let rateLimiter = null;
    if (options.enableRateLimit !== false) {
      if (RateLimiter) {
        rateLimiter = new RateLimiter({
          name: 'auth',
          maxRequests: options.rateLimit?.requests || 100,
          windowMs: options.rateLimit?.window || 60000
        });
        rateLimiter.startCleanup();
      } else {
        // 使用内置简单限流器
        rateLimiter = this._createSimpleRateLimiter(options.rateLimit);
      }
      this._services.set('rateLimiter', rateLimiter);
    }

    // 4. 创建领域服务
    const authService = new AuthenticationService({
      keyRepository,
      monitor,
      rateLimiter
    });
    this._services.set('authService', authService);

    // 5. 创建HTTP适配器
    const httpAdapter = new AuthHttpAdapter(authService);
    this._services.set('httpAdapter', httpAdapter);

    this._initialized = true;
    console.log('[AuthContainer] Initialized successfully');

    return this;
  }

  /**
   * 获取服务
   */
  get(name) {
    if (!this._initialized) {
      throw new Error('AuthContainer not initialized. Call initialize() first.');
    }
    return this._services.get(name);
  }

  /**
   * 获取认证服务
   */
  getAuthService() {
    return this.get('authService');
  }

  /**
   * 获取HTTP适配器
   */
  getHttpAdapter() {
    return this.get('httpAdapter');
  }

  /**
   * 创建中间件
   */
  createMiddleware(options = {}) {
    return this.getHttpAdapter().createMiddleware(options);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return this.getAuthService().getStats();
  }

  /**
   * 获取最近事件
   */
  getRecentEvents(limit = 50) {
    return this.getAuthService().getRecentEvents(limit);
  }

  /**
   * 生成新密钥
   */
  generateKey(options = {}) {
    return this.getAuthService().generateKey(options);
  }

  /**
   * 撤销密钥
   */
  revokeKey(apiKey, reason) {
    return this.getAuthService().revokeKey(apiKey, reason);
  }

  /**
   * 获取所有密钥
   */
  getAllKeys() {
    return this.getAuthService().getAllKeys();
  }

  /**
   * 检查是否已初始化
   */
  isInitialized() {
    return this._initialized;
  }

  /**
   * 重置容器
   */
  reset() {
    const monitor = this._services.get('monitor');
    if (monitor?.stop) monitor.stop();

    const rateLimiter = this._services.get('rateLimiter');
    if (rateLimiter?.stopCleanup) rateLimiter.stopCleanup();

    this._services.clear();
    this._initialized = false;
  }

  /**
   * 创建简单限流器（备用实现）
   */
  _createSimpleRateLimiter(config = {}) {
    const maxRequests = config.requests || 100;
    const windowMs = config.window || 60000;
    const store = new Map();

    return {
      check(key) {
        const now = Date.now();
        const windowStart = now - windowMs;

        if (!store.has(key)) {
          store.set(key, []);
        }

        const requests = store.get(key);

        // 清理过期请求
        while (requests.length > 0 && requests[0] < windowStart) {
          requests.shift();
        }

        if (requests.length >= maxRequests) {
          return {
            allowed: false,
            limit: maxRequests,
            remaining: 0,
            resetTime: now + windowMs,
            retryAfter: Math.ceil(windowMs / 1000)
          };
        }

        requests.push(now);
        return {
          allowed: true,
          limit: maxRequests,
          remaining: maxRequests - requests.length,
          resetTime: now + windowMs
        };
      },
      startCleanup() {
        this._cleanupTimer = setInterval(() => {
          const now = Date.now();
          for (const [key, requests] of store) {
            if (requests.length === 0 || requests[requests.length - 1] < now - windowMs) {
              store.delete(key);
            }
          }
        }, 300000);
        if (this._cleanupTimer.unref) this._cleanupTimer.unref();
      },
      stopCleanup() {
        if (this._cleanupTimer) {
          clearInterval(this._cleanupTimer);
          this._cleanupTimer = null;
        }
      }
    };
  }
}

module.exports = AuthContainer;