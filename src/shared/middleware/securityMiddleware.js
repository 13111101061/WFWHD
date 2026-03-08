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

    // 过长的文本（可能的DoS攻击）
    /.{1000,}/,

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

/**
 * 验证TTS请求参数
 */
const validateTtsParams = (req, res, next) => {
  const body = req.body;
  const errors = [];

  // 验证必填字段
  if (!body.text || typeof body.text !== 'string') {
    errors.push('text字段是必需的且必须是字符串');
  }

  if (body.text) {
    // 文本长度验证
    if (body.text.length === 0) {
      errors.push('文本内容不能为空');
    }

    if (body.text.length > 5000) {
      errors.push('文本长度不能超过5000字符');
    }

    // XSS防护
    const sanitizedText = sanitizeInput(body.text);
    if (sanitizedText !== body.text) {
      errors.push('文本包含不安全的HTML/脚本内容');
    }

    // 恶意内容检测
    const maliciousCheck = detectMaliciousContent(body.text);
    if (maliciousCheck.detected) {
      errors.push(`检测到恶意内容 (威胁级别: ${maliciousCheck.severity})`);
    }
  }

  // 验证可选参数
  if (body.service && typeof body.service !== 'string') {
    errors.push('service字段必须是字符串');
  }

  // voice 参数支持字符串或数字类型（不同提供商使用不同格式）
  // 阿里云、火山引擎、MiniMax 使用字符串
  // 腾讯云使用数字类型
  if (body.voice !== undefined && body.voice !== null) {
    const voiceType = typeof body.voice;
    if (voiceType !== 'string' && voiceType !== 'number') {
      errors.push('voice字段必须是字符串或数字类型');
    }
    // 如果是数字，验证是否为有效整数
    if (voiceType === 'number' && !Number.isInteger(body.voice)) {
      errors.push('voice字段为数字时必须是整数');
    }
  }

  if (body.speed !== undefined) {
    const speed = parseFloat(body.speed);
    if (isNaN(speed) || speed < 0.25 || speed > 4.0) {
      errors.push('speed必须在0.25-4.0之间');
    }
  }

  if (body.pitch !== undefined) {
    const pitch = parseFloat(body.pitch);
    if (isNaN(pitch) || pitch < 0.5 || pitch > 2.0) {
      errors.push('pitch必须在0.5-2.0之间');
    }
  }

  if (body.volume !== undefined) {
    const volume = parseInt(body.volume);
    if (isNaN(volume) || volume < 0 || volume > 10) {
      errors.push('volume必须在0-10之间');
    }
  }

  // 批量请求验证
  if (body.texts && Array.isArray(body.texts)) {
    if (body.texts.length === 0) {
      errors.push('批量文本数组不能为空');
    }

    if (body.texts.length > 100) {
      errors.push('批量请求最多支持100个文本');
    }

    // 验证每个文本
    body.texts.forEach((text, index) => {
      if (typeof text !== 'string') {
        errors.push(`批量文本[${index}]必须是字符串`);
      }

      if (text.length > 1000) {
        errors.push(`批量文本[${index}]长度不能超过1000字符`);
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
      error: 'Validation failed',
      details: errors,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }

  // 清理输入数据
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
  const body = JSON.stringify(req.body);

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