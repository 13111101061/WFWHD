const ApiKeyService = require('../auth/ApiKeyService');
const AuthMonitor = require('../monitoring/AuthMonitor');
const { randomUUID } = require('crypto');

/**
 * 统一认证中间件 - 专为微服务节点设计
 * 替换原有的混乱认证系统
 */
class UnifiedAuthMiddleware {
  constructor(options = {}) {
    this.apiKeyService = new ApiKeyService();
    this.monitor = new AuthMonitor({
      enableRealTimeMetrics: true,
      maxEvents: 5000
    });

    this.options = {
      enableRateLimit: options.enableRateLimit !== false,
      rateLimits: {
        default: { requests: 100, window: 60000 }, // 1分钟100次
        premium: { requests: 1000, window: 60000 },
        admin: { requests: 10000, window: 60000 }
      },
      enableAudit: options.enableAudit !== false,
      ...options
    };

    this.rateLimitStore = new Map();

    // 监听认证事件
    this.monitor.on('auth:failure', (event) => {
      console.warn(`[AUTH] Authentication failed for IP ${event.data.ip}: ${event.data.reason}`);
    });

    // 启动定期清理任务（每5分钟清理一次过期的速率限制数据）
    this.startRateLimitCleanup();

    console.log('[UnifiedAuth] Authentication middleware initialized');
  }

  /**
   * 创建认证中间件
   */
  createMiddleware(middlewareOptions = {}) {
    const {
      service = null,
      required = true,
      permissions = [],
      rateLimitTier = 'default',
      metadata = {}
    } = middlewareOptions;

    return async (req, res, next) => {
      const requestId = this.generateRequestId();
      req.requestId = requestId;
      req.authMetadata = { ...metadata, startTime: Date.now() };

      try {
        // 提取API密钥
        const apiKey = this.extractApiKey(req);

        if (!apiKey) {
          if (required) {
            await this.monitor.recordAuthFailure({
              requestId,
              ip: req.ip,
              userAgent: req.headers['user-agent'],
              url: req.originalUrl,
              method: req.method
            }, 'Missing API key', 'MISSING_KEY');

            return this.unauthorized(res, requestId, 'Missing API key');
          } else {
            req.auth = {
              anonymous: true,
              requestId,
              permissions: ['anonymous']
            };
            return next();
          }
        }

        // 提取服务名称
        const serviceName = service || this.extractServiceName(req);

        // 验证API密钥
        const verificationResult = await this.apiKeyService.verifyKey(apiKey, serviceName);

        if (!verificationResult.valid) {
          await this.monitor.recordAuthFailure({
            requestId,
            apiKey,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            url: req.originalUrl,
            method: req.method,
            service: serviceName
          }, verificationResult.error, verificationResult.code);

          return this.unauthorized(res, requestId, verificationResult.error);
        }

        // 权限检查
        if (permissions.length > 0) {
          const hasPermission = this.checkPermissions(
            verificationResult.keyInfo.permissions,
            permissions
          );
          if (!hasPermission) {
            await this.monitor.recordAccessDenied({
              requestId,
              apiKey,
              ip: req.ip,
              service: serviceName,
              requiredPermissions: permissions,
              userPermissions: verificationResult.keyInfo.permissions
            }, 'Insufficient permissions');

            return this.forbidden(res, requestId, 'Insufficient permissions');
          }
        }

        // 速率限制检查
        if (this.options.enableRateLimit) {
          const rateLimitResult = await this.checkRateLimit(
            apiKey,
            rateLimitTier,
            this.options.rateLimits[rateLimitTier] || this.options.rateLimits.default
          );

          if (!rateLimitResult.allowed) {
            await this.monitor.recordAccessDenied({
              requestId,
              apiKey,
              ip: req.ip,
              service: serviceName,
              rateLimit: rateLimitResult
            }, 'Rate limit exceeded');

            return this.tooManyRequests(res, requestId, rateLimitResult);
          }
        }

        // 构建认证信息
        req.auth = {
          authenticated: true,
          anonymous: false,
          requestId,
          apiKey: this.monitor.hashApiKey(apiKey),
          keyInfo: verificationResult.keyInfo,
          service: serviceName,
          permissions: verificationResult.keyInfo.permissions,
          rateLimitTier,
          metadata: req.authMetadata
        };

        // 记录成功认证
        await this.monitor.recordAuthSuccess({
          requestId,
          apiKey,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          url: req.originalUrl,
          method: req.method,
          service: serviceName,
          keyType: verificationResult.keyInfo.type
        });

        // 添加响应头
        res.setHeader('X-Request-ID', requestId);

        next();
      } catch (error) {
        console.error(`[${requestId}] Authentication error:`, error);
        await this.monitor.recordAuthFailure({
          requestId,
          ip: req.ip,
          url: req.originalUrl,
          method: req.method,
          error: error.message
        }, 'Authentication service error', 'SERVICE_ERROR');

        this.internalError(res, requestId, 'Authentication service error');
      }
    };
  }

  /**
   * 提取服务名称
   */
  extractServiceName(req) {
    // 防御性编程：处理可能的空值
    if (!req || !req.path) {
      return 'unknown';
    }

    const pathSegments = req.path.split('/').filter(Boolean);
    return pathSegments[1] || 'unknown';
  }

  /**
   * 提取API密钥
   * 安全警告：不允许通过查询参数传递API密钥
   * 风险：API密钥可能被记录在服务器日志、浏览器历史记录、代理服务器日志中
   */
  extractApiKey(req) {
    // 1. 请求头 (推荐方式)
    const headerKey = req.headers['x-api-key'];
    if (headerKey) return headerKey;

    // 2. Authorization Bearer (标准方式)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // 3. 自定义头部 (兼容方式)
    if (req.headers['x-service-key']) return req.headers['x-service-key'];

    // 安全提示：禁止通过查询参数传递API密钥
    if (req.query.apiKey) {
      // 记录安全警告
      console.warn('🚨 安全警告: 检测到通过查询参数传递API密钥的尝试，此功能已被禁用以防止密钥泄露');

      // 在开发环境下可以返回更详细的错误信息
      if (process.env.NODE_ENV === 'development') {
        throw new Error('出于安全考虑，不允许通过查询参数传递API密钥。请使用请求头或Authorization Bearer方式。');
      }
    }

    return null;
  }

  /**
   * 权限检查
   */
  checkPermissions(userPermissions, requiredPermissions) {
    // 管理员权限
    if (userPermissions.includes('full') || userPermissions.includes('admin')) {
      return true;
    }

    // 检查每个必需权限
    return requiredPermissions.every(permission =>
      userPermissions.includes(permission)
    );
  }

  /**
   * 速率限制检查
   */
  async checkRateLimit(apiKey, tier, config) {
    const now = Date.now();
    const key = `${this.monitor.hashApiKey(apiKey)}:${tier}`;
    const windowStart = now - config.window;

    let rateLimitData = this.rateLimitStore.get(key);
    if (!rateLimitData) {
      rateLimitData = { requests: [], resetTime: now + config.window };
      this.rateLimitStore.set(key, rateLimitData);
    }

    // 清理过期的请求记录
    rateLimitData.requests = rateLimitData.requests.filter(time => time > windowStart);

    // 检查是否超过限制
    if (rateLimitData.requests.length >= config.requests) {
      return {
        allowed: false,
        limit: config.requests,
        remaining: 0,
        resetTime: rateLimitData.resetTime,
        retryAfter: Math.ceil((rateLimitData.resetTime - now) / 1000)
      };
    }

    // 记录当前请求
    rateLimitData.requests.push(now);

    return {
      allowed: true,
      limit: config.requests,
      remaining: config.requests - rateLimitData.requests.length,
      resetTime: rateLimitData.resetTime
    };
  }

  /**
   * 工具方法
   */
  generateRequestId() {
    return randomUUID().replace(/-/g, '').substring(0, 16);
  }

  /**
   * 错误响应方法
   */
  unauthorized(res, requestId, message) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message,
      requestId,
      timestamp: new Date().toISOString()
    });
  }

  forbidden(res, requestId, message) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message,
      requestId,
      timestamp: new Date().toISOString()
    });
  }

  tooManyRequests(res, requestId, rateLimitInfo) {
    res.status(429).json({
      success: false,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
      requestId,
      rateLimit: {
        limit: rateLimitInfo.limit,
        remaining: rateLimitInfo.remaining,
        resetTime: new Date(rateLimitInfo.resetTime).toISOString(),
        retryAfter: rateLimitInfo.retryAfter
      },
      timestamp: new Date().toISOString()
    });
  }

  internalError(res, requestId, message) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message,
      requestId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 管理方法
   */
  getStats() {
    return {
      apiKeys: this.apiKeyService.getKeyStats(),
      rateLimit: {
        activeClients: this.rateLimitStore.size,
        totalRequests: Array.from(this.rateLimitStore.values())
          .reduce((sum, data) => sum + data.requests.length, 0)
      },
      monitor: {
        totalEvents: this.monitor.events.length
      }
    };
  }

  getMetrics() {
    return this.monitor.getRealTimeMetrics();
  }

  getRecentEvents(limit = 50) {
    return this.monitor.getRecentEvents(limit);
  }

  generateKey(options = {}) {
    return this.apiKeyService.generateKey(options);
  }

  revokeKey(apiKey, reason) {
    return this.apiKeyService.revokeKey(apiKey, reason);
  }

  /**
   * 启动速率限制数据的定期清理
   * 防止内存泄漏，清理过期的速率限制条目
   * @private
   */
  startRateLimitCleanup() {
    // 每5分钟清理一次（300000毫秒）
    const cleanupInterval = 300000;

    this.cleanupTimer = setInterval(() => {
      try {
        const now = Date.now();
        let cleanedCount = 0;

        // 遍历所有速率限制条目
        for (const [key, data] of this.rateLimitStore.entries()) {
          // 如果 resetTime 已经过期，删除该条目
          if (data.resetTime < now) {
            this.rateLimitStore.delete(key);
            cleanedCount++;
          }
        }

        if (cleanedCount > 0) {
          console.log(`[UnifiedAuth] Cleaned up ${cleanedCount} expired rate limit entries`);
        }
      } catch (error) {
        console.error('[UnifiedAuth] Error during rate limit cleanup:', error);
      }
    }, cleanupInterval);

    // 确保定时器不会阻止进程退出
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }

    console.log(`[UnifiedAuth] Rate limit cleanup task started (interval: ${cleanupInterval/1000}s)`);
  }

  /**
   * 停止清理任务（用于优雅关闭）
   */
  stopRateLimitCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('[UnifiedAuth] Rate limit cleanup task stopped');
    }
  }

  getAllKeys() {
    return this.apiKeyService.getAllKeys();
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
