/**
 * AuthHttpAdapter - 认证HTTP适配器
 * Express专用中间件，将HTTP请求转换为领域服务调用
 *
 * 这是一个框架适配器，负责：
 * - 从HTTP请求提取认证信息
 * - 调用 AuthenticationService
 * - 格式化HTTP错误响应
 * - 设置请求上下文
 */

class AuthHttpAdapter {
  /**
   * @param {Object} authService - AuthenticationService 领域服务
   */
  constructor(authService) {
    this.authService = authService;
  }

  /**
   * 创建认证中间件
   * @param {Object} options
   * @param {string} [options.service] - 服务名称
   * @param {boolean} [options.required=true] - 是否必须认证
   * @param {string[]} [options.permissions=[]] - 所需权限
   * @param {string} [options.rateLimitTier='default'] - 限流层级
   * @param {Object} [options.metadata={}] - 元数据
   * @returns {Function} Express中间件
   */
  createMiddleware(options = {}) {
    const {
      service = null,
      required = true,
      permissions = [],
      rateLimitTier = 'default',
      metadata = {}
    } = options;

    return async (req, res, next) => {
      // 记录开始时间
      const startTime = Date.now();

      // 提取API密钥
      const apiKey = this._extractApiKey(req);

      // 提取服务名称
      const serviceName = service || this._extractServiceName(req);

      // 构建认证请求
      const authRequest = {
        apiKey,
        service: serviceName,
        requiredPermissions: permissions,
        rateLimitTier,
        context: {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          url: req.originalUrl,
          method: req.method,
          metadata: { ...metadata, startTime }
        }
      };

      // 如果没有密钥且非必须认证
      if (!apiKey && !required) {
        req.auth = {
          anonymous: true,
          requestId: this._generateRequestId(),
          permissions: ['anonymous']
        };
        return next();
      }

      // 调用领域服务
      const result = await this.authService.authenticate(authRequest);

      if (!result.success) {
        return this._sendError(res, result);
      }

      // 设置请求上下文
      req.auth = result.auth;
      req.requestId = result.requestId;

      // 设置响应头
      res.setHeader('X-Request-ID', result.requestId);

      next();
    };
  }

  /**
   * 从请求中提取API密钥
   */
  _extractApiKey(req) {
    // 1. X-API-Key 请求头（推荐）
    const headerKey = req.headers['x-api-key'];
    if (headerKey) return headerKey;

    // 2. Authorization Bearer（标准）
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // 3. X-Service-Key（兼容）
    if (req.headers['x-service-key']) {
      return req.headers['x-service-key'];
    }

    // 安全警告：禁止通过查询参数传递API密钥
    if (req.query?.apiKey) {
      console.warn('🚨 Security: API key in query params detected and rejected');
    }

    return null;
  }

  /**
   * 从请求路径提取服务名称
   */
  _extractServiceName(req) {
    if (!req?.path) return 'unknown';
    const pathSegments = req.path.split('/').filter(Boolean);
    return pathSegments[1] || 'unknown';
  }

  /**
   * 发送错误响应
   */
  _sendError(res, result) {
    const { error, requestId } = result;

    const response = {
      success: false,
      error: this._getErrorTitle(error.statusCode),
      message: error.message,
      requestId,
      timestamp: new Date().toISOString()
    };

    // 添加额外信息
    if (error.code) response.code = error.code;
    if (error.rateLimit) {
      response.rateLimit = {
        limit: error.rateLimit.limit,
        remaining: error.rateLimit.remaining,
        resetTime: new Date(error.rateLimit.resetTime).toISOString(),
        retryAfter: error.rateLimit.retryAfter
      };
    }

    res.status(error.statusCode).json(response);
  }

  /**
   * 获取错误标题
   */
  _getErrorTitle(statusCode) {
    switch (statusCode) {
      case 401: return 'Unauthorized';
      case 403: return 'Forbidden';
      case 429: return 'Too Many Requests';
      default: return 'Authentication Error';
    }
  }

  _generateRequestId() {
    const { randomUUID } = require('crypto');
    return randomUUID().replace(/-/g, '').substring(0, 16);
  }
}

module.exports = AuthHttpAdapter;