/**
 * 合并中间件 - 减少套娃层级
 * 将相关的功能合并到单个中间件中
 */

const crypto = require('crypto');
const { generateRequestFingerprint } = require('./securityMiddleware');

/**
 * 统一的TTS请求中间件
 *
 * 只负责：请求ID生成、日志、Content-Type/大小检查、性能计时。
 * 安全过滤由上游 validateTtsParams (sanitizeInput) 完成，此处不做重复清理。
 * 业务参数范围校验已移至 CompiledCapability，由 TtsSynthesisService 按服务商实际范围校验。
 */
const createUnifiedTtsMiddleware = (options = {}) => {
  const { maxSize = 512 * 1024, service = 'tts' } = options;

  return async (req, res, next) => {
    const startTime = Date.now();

    try {
      // 1. 生成请求ID和指纹
      req.requestId = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      req.securityFingerprint = generateRequestFingerprint(req);

      // 2. Content-Type 检查
      const contentType = req.headers['content-type'];
      if (req.method === 'POST' && !contentType?.includes('application/json')) {
        return res.status(400).json({
          success: false,
          error: 'Content-Type必须是application/json',
          requestId: req.requestId
        });
      }

      // 3. 请求体大小检查
      const contentLength = req.headers['content-length'];
      if (contentLength && parseInt(contentLength) > maxSize) {
        return res.status(413).json({
          success: false,
          error: `请求体过大，最大${Math.round(maxSize / 1024)}KB`,
          requestId: req.requestId
        });
      }

      // 4. 统一日志记录
      console.log(`[${req.requestId}] ${req.method} ${req.path} | IP: ${req.ip} | Service: ${req.body.service} | TextLength: ${req.body.text?.length || 0} | Fingerprint: ${req.securityFingerprint}`);

      // 5. 性能监控钩子
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        console.log(`[${req.requestId}] Completed | Status: ${res.statusCode} | Duration: ${duration}ms`);
      });

      next();

    } catch (error) {
      console.error(`[${req.requestId}] Middleware error:`, error.message);
      res.status(500).json({
        success: false,
        error: '服务器内部错误',
        requestId: req.requestId
      });
    }
  };
};

module.exports = {
  createUnifiedTtsMiddleware
};
