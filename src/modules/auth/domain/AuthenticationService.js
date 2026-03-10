/**
 * AuthenticationService - 认证领域服务
 * 纯业务逻辑，无框架依赖，无HTTP依赖
 *
 * 这是一个完全独立的服务，可被任何需要认证的系统使用。
 */

const { randomUUID } = require('crypto');

class AuthenticationService {
  /**
   * @param {Object} deps - 依赖注入
   * @param {Object} deps.keyRepository - IApiKeyRepository 实现
   * @param {Object} deps.monitor - IAuthMonitor 实现
   * @param {Object} [deps.rateLimiter] - RateLimiter 实现（可选）
   */
  constructor({ keyRepository, monitor, rateLimiter }) {
    if (!keyRepository) {
      throw new Error('AuthenticationService requires keyRepository');
    }
    if (!monitor) {
      throw new Error('AuthenticationService requires monitor');
    }

    this.keyRepository = keyRepository;
    this.monitor = monitor;
    this.rateLimiter = rateLimiter;
  }

  /**
   * 认证请求
   * @param {Object} request - 认证请求
   * @param {string} request.apiKey - API密钥
   * @param {string} [request.service] - 服务名称
   * @param {string[]} [request.requiredPermissions] - 所需权限
   * @param {string} [request.rateLimitTier] - 限流层级
   * @param {Object} [request.context] - 上下文信息（IP、UserAgent等）
   * @returns {Promise<Object>} 认证结果
   */
  async authenticate(request) {
    const {
      apiKey,
      service,
      requiredPermissions = [],
      rateLimitTier = 'default',
      context = {}
    } = request;

    const requestId = this._generateRequestId();

    // 1. 检查密钥是否存在
    if (!apiKey) {
      this.monitor.recordAuthFailure(context, 'Missing API key', 'MISSING_KEY');
      return this._createFailureResult(requestId, 'MISSING_KEY', 'Missing API key', 401);
    }

    // 2. 验证API密钥
    const verification = await this.keyRepository.verifyKey(apiKey, service);

    if (!verification.valid) {
      this.monitor.recordAuthFailure(
        { ...context, apiKey },
        verification.error,
        verification.code
      );
      return this._createFailureResult(requestId, verification.code, verification.error, 401);
    }

    // 3. 检查权限
    if (requiredPermissions.length > 0) {
      const hasPermission = this._checkPermissions(
        verification.keyInfo.permissions,
        requiredPermissions
      );

      if (!hasPermission) {
        this.monitor.recordAccessDenied(
          { ...context, apiKey, requiredPermissions },
          'Insufficient permissions'
        );
        return this._createFailureResult(requestId, 'INSUFFICIENT_PERMISSIONS', 'Insufficient permissions', 403);
      }
    }

    // 4. 检查限流（如果配置了限流器）
    if (this.rateLimiter) {
      const rateLimitKey = `${this.monitor.hashApiKey(apiKey)}:${rateLimitTier}`;
      const rateLimitResult = this.rateLimiter.check(rateLimitKey);

      if (!rateLimitResult.allowed) {
        this.monitor.recordAccessDenied(
          { ...context, apiKey, rateLimit: rateLimitResult },
          'Rate limit exceeded'
        );
        return this._createRateLimitResult(requestId, rateLimitResult);
      }
    }

    // 5. 记录成功
    this.monitor.recordAuthSuccess({
      ...context,
      apiKey,
      service,
      keyType: verification.keyInfo.type
    });

    // 6. 返回成功结果
    return {
      success: true,
      requestId,
      auth: {
        authenticated: true,
        requestId,
        keyId: verification.keyInfo.id,
        keyType: verification.keyInfo.type,
        permissions: verification.keyInfo.permissions,
        services: verification.keyInfo.services,
        service,
        rateLimitTier
      }
    };
  }

  /**
   * 生成新API密钥
   * @param {Object} options
   * @returns {Object}
   */
  generateKey(options) {
    return this.keyRepository.generateKey(options);
  }

  /**
   * 撤销API密钥
   * @param {string} apiKey
   * @param {string} reason
   * @returns {boolean}
   */
  revokeKey(apiKey, reason) {
    return this.keyRepository.revokeKey(apiKey, reason);
  }

  /**
   * 获取所有密钥
   * @returns {Object[]}
   */
  getAllKeys() {
    return this.keyRepository.getAllKeys();
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    return {
      keys: this.keyRepository.getStats(),
      monitor: this.monitor.getRealTimeMetrics()
    };
  }

  /**
   * 获取最近事件
   * @param {number} limit
   * @returns {Object[]}
   */
  getRecentEvents(limit = 50) {
    return this.monitor.getRecentEvents(limit);
  }

  // ==================== 私有方法 ====================

  _checkPermissions(userPermissions, requiredPermissions) {
    // 管理员权限
    if (userPermissions.includes('full') || userPermissions.includes('admin')) {
      return true;
    }

    // 检查每个必需权限
    return requiredPermissions.every(permission =>
      userPermissions.includes(permission)
    );
  }

  _generateRequestId() {
    return randomUUID().replace(/-/g, '').substring(0, 16);
  }

  _createFailureResult(requestId, code, message, statusCode) {
    return {
      success: false,
      requestId,
      error: {
        code,
        message,
        statusCode
      }
    };
  }

  _createRateLimitResult(requestId, rateLimitInfo) {
    return {
      success: false,
      requestId,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded',
        statusCode: 429,
        rateLimit: {
          limit: rateLimitInfo.limit,
          remaining: rateLimitInfo.remaining,
          resetTime: rateLimitInfo.resetTime,
          retryAfter: rateLimitInfo.retryAfter
        }
      }
    };
  }
}

module.exports = AuthenticationService;