/**
 * 合并中间件 - 减少套娃层级
 * 将相关的功能合并到单个中间件中
 */

const crypto = require('crypto');
const { sanitizeInput, detectMaliciousContent, generateRequestFingerprint } = require('./securityMiddleware');

/**
 * 统一的TTS请求中间件
 * 合并：认证 + 日志 + 验证 + 安全检查
 */
const createUnifiedTtsMiddleware = (options = {}) => {
  const { maxSize = 512 * 1024, service = 'tts' } = options;

  return async (req, res, next) => {
    const startTime = Date.now();

    try {
      // 1. 生成请求ID和指纹
      req.requestId = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      req.securityFingerprint = generateRequestFingerprint(req);

      // 2. 快速验证（合并多个验证）
      const validationErrors = validateTtsRequestFast(req, maxSize);
      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          error: `参数错误: ${validationErrors.join(', ')}`,
          requestId: req.requestId
        });
      }

      // 3. 统一日志记录（一条日志包含所有信息）
      console.log(`[${req.requestId}] ${req.method} ${req.path} | IP: ${req.ip} | Service: ${req.body.service} | TextLength: ${req.body.text?.length || 0} | Fingerprint: ${req.securityFingerprint}`);

      // 4. 安全检查（只做必要的安全过滤）
      const securityCheck = performSecurityCheck(req.body);
      if (!securityCheck.passed) {
        console.warn(`🚨 [SECURITY] ${req.requestId} | IP: ${req.ip} | Issue: ${securityCheck.reason}`);
        return res.status(400).json({
          success: false,
          error: `安全检查失败: ${securityCheck.reason}`,
          requestId: req.requestId
        });
      }

      // 5. 清理输入数据
      req.body = sanitizeTtsData(req.body);

      // 6. 添加性能监控钩子
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

/**
 * 快速验证（合并多个验证逻辑）
 */
const validateTtsRequestFast = (req, maxSize) => {
  const errors = [];
  const body = req.body;

  // 基础验证
  if (!body.text || typeof body.text !== 'string') {
    errors.push('text字段是必需的且必须是字符串');
  }

  // 长度验证
  if (body.text) {
    if (body.text.length === 0) errors.push('文本内容不能为空');
    if (body.text.length > 5000) errors.push('文本长度不能超过5000字符');
  }

  // Content-Type验证
  const contentType = req.headers['content-type'];
  if (!contentType?.includes('application/json')) {
    errors.push('Content-Type必须是application/json');
  }

  // 请求大小验证
  const contentLength = req.headers['content-length'];
  if (contentLength && parseInt(contentLength) > maxSize) {
    errors.push(`请求体过大，最大${Math.round(maxSize / 1024)}KB`);
  }

  // 参数范围验证（简化版）
  if (body.speed !== undefined && (body.speed < 0.25 || body.speed > 4.0)) {
    errors.push('speed必须在0.25-4.0之间');
  }

  return errors;
};

/**
 * 简化的安全检查
 */
const performSecurityCheck = (body) => {
  if (!body.text) return { passed: true };

  // 只检查最危险的模式
  const dangerousPatterns = [
    /<script[^>]*>/i,
    /javascript:/i,
    /\.\.[\/\\]/,
    /(\b(curl|wget|powershell|cmd)\b)/i
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(body.text)) {
      return {
        passed: false,
        reason: `Detected dangerous content: ${pattern.source}`
      };
    }
  }

  return { passed: true };
};

/**
 * 简化的数据清理
 */
const sanitizeTtsData = (data) => {
  if (data.text) {
    // 只做最基本的HTML清理
    data.text = data.text
      .replace(/<[^>]*>/g, '') // 移除所有HTML标签
      .replace(/\s+/g, ' ')    // 合并空白字符
      .trim();
  }

  // 确保数值参数在合理范围内
  if (data.speed !== undefined) {
    data.speed = Math.max(0.25, Math.min(4.0, parseFloat(data.speed) || 1.0));
  }
  if (data.pitch !== undefined) {
    data.pitch = Math.max(0.5, Math.min(2.0, parseFloat(data.pitch) || 1.0));
  }
  if (data.volume !== undefined) {
    data.volume = Math.max(0, Math.min(10, parseInt(data.volume) || 5));
  }

  return data;
};

module.exports = {
  createUnifiedTtsMiddleware
};