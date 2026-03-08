/**
 * TTS 请求日志中间件
 * 统一记录 TTS 相关请求
 */

/**
 * 请求日志中间件
 * 记录请求方法、路径、IP、请求ID
 */
function requestLogger(req, res, next) {
  const timestamp = new Date().toISOString();
  const requestId = req.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // 将 requestId 附加到请求对象，便于后续使用
  req.requestId = requestId;
  
  // 记录请求开始
  console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip} - ID: ${requestId}`);
  
  // 记录请求体（开发环境且非敏感路径）
  if (process.env.NODE_ENV === 'development' && req.body) {
    const sanitizedBody = sanitizeRequestBody(req.body);
    console.log(`  Body:`, JSON.stringify(sanitizedBody, null, 2));
  }
  
  // 记录响应时间
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const statusEmoji = status < 400 ? '✅' : status < 500 ? '⚠️' : '❌';
    console.log(`  ${statusEmoji} Response: ${status} (${duration}ms)`);
  });
  
  next();
}

/**
 * 清理请求体中的敏感信息
 */
function sanitizeRequestBody(body) {
  if (!body || typeof body !== 'object') return body;
  
  const sanitized = { ...body };
  const sensitiveKeys = ['apiKey', 'api_key', 'secretKey', 'secret_key', 'token', 'password', 'authorization'];
  
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '***REDACTED***';
    }
  }
  
  return sanitized;
}

/**
 * 简洁的请求日志（生产环境使用）
 */
function simpleRequestLogger(req, res, next) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  req.requestId = requestId;
  
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms - ${requestId}`);
  });
  
  next();
}

module.exports = {
  requestLogger,
  simpleRequestLogger
};
