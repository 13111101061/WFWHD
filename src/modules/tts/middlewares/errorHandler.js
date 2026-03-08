/**
 * TTS 统一错误处理中间件
 * 统一处理所有 TTS 相关错误，返回标准格式响应
 */

const TtsException = require('../core/TtsException');

/**
 * 统一错误处理中间件
 * 必须放在所有路由之后
 */
function ttsErrorHandler(err, req, res, next) {
  const timestamp = new Date().toISOString();
  
  // 记录错误日志
  console.error(`[TTS Error] ${req.method} ${req.path}:`, {
    message: err.message,
    stack: err.stack?.split('\n').slice(0, 3).join('\n'),
    requestId: req.requestId || 'unknown'
  });

  // TTS 异常处理
  if (err instanceof TtsException) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      provider: err.provider || null,
      serviceType: err.serviceType || null,
      operation: err.operation || null,
      requestId: req.requestId || null,
      timestamp
    });
  }

  // 参数验证错误（express-validator）
  if (err.array && typeof err.array === 'function') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.array(),
      requestId: req.requestId || null,
      timestamp
    });
  }

  // JWT/认证错误
  if (err.name === 'UnauthorizedError' || err.message?.includes('jwt')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: err.message,
      requestId: req.requestId || null,
      timestamp
    });
  }

  // 默认 500 错误（不暴露内部细节）
  const isDev = process.env.NODE_ENV === 'development';
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: isDev ? err.message : undefined,
    requestId: req.requestId || null,
    timestamp
  });
}

/**
 * 404 处理中间件
 * 处理未匹配的路由
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    message: `Requested path ${req.originalUrl} does not exist`,
    requestId: req.requestId || null,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  ttsErrorHandler,
  notFoundHandler
};
