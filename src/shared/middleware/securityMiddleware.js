/**
 * 安全验证中间件
 * 提供输入验证、XSS防护、恶意字符检测等安全功能
 */

const crypto = require('crypto');

/**
 * XSS防护 - 清理HTML/JavaScript攻击向量
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;

  // 移除危险的HTML标签和属性
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/onload=/gi, '')
    .replace(/onerror=/gi, '')
    .replace(/onclick=/gi, '')
    .replace(/onmouseover=/gi, '')
    .replace(/onfocus=/gi, '')
    .replace(/onblur=/gi, '')
    .replace(/onchange=/gi, '')
    .replace(/onsubmit=/gi, '')
    .replace(/<[^>]*>/g, '') // 移除所有HTML标签
    .trim();
};

/**
 * 检测恶意字符和攻击模式
 */
const detectMaliciousContent = (text) => {
  const maliciousPatterns = [
    // SQL注入模式（虽然不用数据库，但防御性编程）
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
    /['"]\s*(OR|AND)\s*['"]/gi,

    // 命令注入模式
    /(\b(curl|wget|nc|netcat|ssh|ftp|telnet|powershell|cmd)\b)/gi,
    /(\$\(.*\)|`.*`)/g,
    /[;&|`$(){}[\]\\]/,

    // 路径遍历
    /\.\.[\/\\]/g,

    // XSS模式
    /javascript:/gi,
    /vbscript:/gi,
    /<script[^>]*>/gi,
    /<iframe[^>]*>/gi,

    // 控制字符
    /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,

    // Unicode攻击
    /[\u202E\u200E\u200F\u206A\u206B\u206C\u206D]/g
  ];

  for (const pattern of maliciousPatterns) {
    if (pattern.test(text)) {
      return {
        detected: true,
        pattern: pattern.source,
        severity: getSeverity(pattern)
      };
    }
  }

  return { detected: false };
};

/**
 * 根据模式判断威胁级别
 */
const getSeverity = (pattern) => {
  if (pattern.source.includes('SELECT|INSERT|UPDATE|DELETE') ||
      pattern.source.includes('curl|wget|powershell|cmd')) {
    return 'HIGH';
  } else if (pattern.source.includes('javascript:|<script') ||
             pattern.source.includes('\.\.[\/\\]')) {
    return 'MEDIUM';
  } else {
    return 'LOW';
  }
};

const MAX_TEXT_LENGTH = 10000;
const MAX_BATCH_SIZE = 10;
const MAX_BATCH_TEXT_LENGTH = 5000;

/**
 * 验证TTS请求参数（安全层 + 结构层）
 *
 * 业务参数范围校验已移至 CompiledCapability.validate()，
 * 由 TtsSynthesisService 在解析 serviceKey 后按服务商实际范围校验。
 * 此中间件只负责：结构校验、类型校验、安全过滤。
 */
const validateTtsParams = (req, res, next) => {
  const body = req.body || {};
  const errors = [];

  if (!body.text || typeof body.text !== 'string') {
    errors.push('text字段是必需的且必须是字符串');
  }

  if (body.text) {
    if (body.text.trim().length === 0) {
      errors.push('文本内容不能为空');
    }

    if (body.text.length > MAX_TEXT_LENGTH) {
      errors.push(`文本长度不能超过${MAX_TEXT_LENGTH}字符`);
    }

    const sanitizedText = sanitizeInput(body.text);
    if (sanitizedText !== body.text) {
      errors.push('文本包含不安全的HTML/脚本内容');
    }
  }

  if (body.service && typeof body.service !== 'string') {
    errors.push('service字段必须是字符串');
  }

  if (body.voice !== undefined && body.voice !== null) {
    const voiceType = typeof body.voice;
    if (voiceType !== 'string' && voiceType !== 'number') {
      errors.push('voice字段必须是字符串或数字类型');
    }
    if (voiceType === 'number' && !Number.isInteger(body.voice)) {
      errors.push('voice字段为数字时必须是整数');
    }
  }

  if (body.texts && Array.isArray(body.texts)) {
    if (body.texts.length === 0) {
      errors.push('批量文本数组不能为空');
    }

    if (body.texts.length > MAX_BATCH_SIZE) {
      errors.push(`批量请求最多支持${MAX_BATCH_SIZE}个文本`);
    }

    body.texts.forEach((text, index) => {
      if (typeof text !== 'string') {
        errors.push(`批量文本[${index}]必须是字符串`);
      }
      if (text.length > MAX_BATCH_TEXT_LENGTH) {
        errors.push(`批量文本[${index}]长度不能超过${MAX_BATCH_TEXT_LENGTH}字符`);
      }
      const maliciousCheck = detectMaliciousContent(text);
      if (maliciousCheck.detected) {
        errors.push(`批量文本[${index}]包含恶意内容`);
      }
    });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: errors.join('; '),
      errors,
      retryable: false,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }

  if (body.text) {
    req.body.text = sanitizeInput(body.text);
  }

  if (body.texts) {
    req.body.texts = body.texts.map(text => sanitizeInput(text));
  }

  next();
};

/**
 * 请求体验证中间件
 */
const validateRequestBody = (maxSize = 1024 * 1024) => { // 默认1MB
  return (req, res, next) => {
    // 获取请求内容长度
    const contentLength = req.headers['content-length'];

    if (contentLength && parseInt(contentLength) > maxSize) {
      return res.status(413).json({
        success: false,
        error: 'Request entity too large',
        message: `请求体大小超过限制 (${Math.round(maxSize / 1024)}KB)`,
        timestamp: new Date().toISOString()
      });
    }

    // 验证Content-Type
    const contentType = req.headers['content-type'];
    if (req.method === 'POST' && !contentType?.includes('application/json')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid content type',
        message: 'Content-Type必须是application/json',
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

/**
 * 生成请求指纹用于安全日志
 */
const generateRequestFingerprint = (req) => {
  const data = {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: Date.now(),
    path: req.path,
    method: req.method
  };
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 16);
};

/**
 * 安全日志记录中间件
 */
const securityLogger = (req, res, next) => {
  const fingerprint = generateRequestFingerprint(req);
  req.securityFingerprint = fingerprint;

  // 记录可疑请求
  const suspiciousPatterns = [
    /\b(admin|test|debug|password|token)\b/gi,
    /<script/i,
    /javascript:/i,
    /\.\.[\/\\]/
  ];

  const url = req.originalUrl || req.url;
  const body = JSON.stringify(req.body || {});

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(url) || pattern.test(body)) {
      console.warn(`🚨 [SECURITY] 可疑请求检测到:`);
      console.warn(`   指纹: ${fingerprint}`);
      console.warn(`   IP: ${req.ip}`);
      console.warn(`   路径: ${req.method} ${url}`);
      console.warn(`   模式: ${pattern.source}`);
      break;
    }
  }

  next();
};

module.exports = {
  sanitizeInput,
  detectMaliciousContent,
  validateTtsParams,
  validateRequestBody,
  securityLogger,
  generateRequestFingerprint
};