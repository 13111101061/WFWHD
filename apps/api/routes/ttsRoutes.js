/**
 * TTS统一路由 (v3.2 - 动态注册版)
 *
 * 改进：
 * - 业务参数范围校验从中间件移至 CompiledCapability（服务商感知）
 * - 快捷路由从 manifest 动态注册，新增服务商无需手动加行
 * - 中间件只负责安全层（XSS/注入/结构校验）
 */

const express = require('express');
const serviceContainer = require('../../../src/config/ServiceContainer');
const { unifiedAuth } = require('../../../src/core/middleware/apiKeyMiddleware');
const { validateTtsParams, securityLogger, sanitizeInput, detectMaliciousContent } = require('../../../src/shared/middleware/securityMiddleware');
const { createUnifiedTtsMiddleware } = require('../../../src/shared/middleware/combinedMiddleware');
const { ProviderManifest } = require('../../../src/modules/tts/providers/manifests/ProviderManifest');

const router = express.Router();

// 延迟初始化 — 使用 Promise 缓存避免并发重复初始化
let initPromise = null;

async function getAdapter() {
  if (!initPromise) {
    initPromise = serviceContainer.initialize().then(() => serviceContainer.get('ttsHttpAdapter'));
  }
  return initPromise;
}

// 请求日志中间件
const requestLogger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
};

// 批量请求专用验证中间件（不要求text字段，验证texts数组）
const validateBatchParams = (req, res, next) => {
  const body = req.body || {};
  const errors = [];

  // 批量请求验证
  if (!body.service || typeof body.service !== 'string') {
    errors.push('service字段是必需的且必须是字符串');
  }

  if (!body.texts || !Array.isArray(body.texts)) {
    errors.push('texts字段是必需的且必须是数组');
  }

  if (body.texts) {
    if (body.texts.length === 0) {
      errors.push('texts数组不能为空');
    }
    if (body.texts.length > 10) {
      errors.push('批量请求最多支持10个文本');
    }
    body.texts.forEach((text, index) => {
      if (typeof text !== 'string') {
        errors.push(`texts[${index}]必须是字符串`);
      } else if (text.length === 0) {
        errors.push(`texts[${index}]不能为空`);
      } else if (text.length > 5000) {
        errors.push(`texts[${index}]长度不能超过5000字符`);
      } else {
        if (sanitizeInput(text) !== text) {
          errors.push(`texts[${index}]包含不安全的HTML/脚本内容`);
        }
        const maliciousCheck = detectMaliciousContent(text);
        if (maliciousCheck.detected) {
          errors.push(`texts[${index}]检测到恶意内容 (威胁级别: ${maliciousCheck.severity})`);
        }
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

  if (body.texts) {
    req.body.texts = body.texts.map(text => sanitizeInput(text));
  }

  next();
};

// ==================== 核心合成端点 ====================

/**
 * 统一TTS合成接口
 * POST /api/tts/synthesize
 */
router.post('/synthesize',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  securityLogger,
  validateTtsParams,
  createUnifiedTtsMiddleware(),
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.synthesize(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 遗留兼容端点：POST /api/tts/
 * 与 /synthesize 完全相同，用于向后兼容
 */
router.post('/',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  securityLogger,
  validateTtsParams,
  createUnifiedTtsMiddleware(),
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.synthesize(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 批量合成
 * POST /api/tts/batch
 * 修复：使用专用验证中间件，不要求text字段
 */
router.post('/batch',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  securityLogger,
  validateBatchParams,
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.batchSynthesize(req, res);
    } catch (error) {
      next(error);
    }
  }
);

// ==================== 音色查询端点 ====================

/**
 * 获取音色列表
 * GET /api/tts/voices?service=xxx
 */
router.get('/voices',
  requestLogger,
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.getVoices(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 获取单个音色
 * GET /api/tts/voices/:id
 */
router.get('/voices/:id',
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.getVoiceById(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 获取音色详情
 * GET /api/tts/voices/:id/detail
 */
router.get('/voices/:id/detail',
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.getVoiceDetail(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 获取服务提供商列表
 * GET /api/tts/providers
 */
router.get('/providers',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.getProviders(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 获取服务能力
 * GET /api/tts/capabilities/:service
 */
router.get('/capabilities/:service',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.getCapabilities(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 获取筛选选项
 * GET /api/tts/filters
 */
router.get('/filters',
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.getFilterOptions(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 获取前端展示目录
 * GET /api/tts/catalog
 */
router.get('/catalog',
  requestLogger,
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.getFrontendCatalog(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 获取前端展示音色数据（精简版）
 * GET /api/tts/frontend
 */
router.get('/frontend',
  requestLogger,
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.getFrontendVoices(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 获取前端启动包（完整前端初始化数据）
 * GET /api/tts/bootstrap
 */
router.get('/bootstrap',
  requestLogger,
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.getFrontendBootstrap(req, res);
    } catch (error) {
      next(error);
    }
  }
);

// ==================== 运维管理端点 ====================

/**
 * 服务健康检查
 * GET /api/tts/health
 */
router.get('/health',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.getHealthStatus(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 服务统计信息
 * GET /api/tts/stats
 */
router.get('/stats',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.getStats(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 重置统计信息
 * POST /api/tts/reset-stats
 */
router.post('/reset-stats',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.resetStats(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 清理缓存
 * POST /api/tts/clear-cache
 */
router.post('/clear-cache',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.clearCache(req, res);
    } catch (error) {
      next(error);
    }
  }
);

// ==================== 服务专用路由（动态注册） ====================

const createServiceRoute = (serviceName) => {
  return [
    unifiedAuth.createMiddleware({ service: 'tts' }),
    securityLogger,
    (req, res, next) => {
      req.body.service = serviceName;
      next();
    },
    validateTtsParams,
    createUnifiedTtsMiddleware(),
    async (req, res, next) => {
      try {
        const adapter = await getAdapter();
        await adapter.synthesize(req, res);
      } catch (error) {
        next(error);
      }
    }
  ];
};

/**
 * 从 manifest 动态注册快捷路由
 * 规则：provider/service → /provider/service-path
 *       如 aliyun_cosyvoice → /aliyun/cosyvoice
 *       如 moss_tts → /moss
 *       别名也注册，
 *       如 cosyvoice → /cosyvoice
 */
function registerDynamicServiceRoutes() {
  ProviderManifest._ensureLoaded();
  const serviceKeys = ProviderManifest.getAllServiceKeys();

  const routeMap = new Map();

  for (const serviceKey of serviceKeys) {
    const cfg = ProviderManifest.getServiceConfig(serviceKey);
    if (!cfg || cfg.status === 'deprecated') continue;

    const parts = serviceKey.split('_');
    const providerKey = cfg.providerKey || parts[0];
    const serviceSuffix = parts.slice(1).join('_');

    const primaryPath = `/${providerKey}/${serviceSuffix}`;
    if (!routeMap.has(primaryPath)) {
      routeMap.set(primaryPath, serviceKey);
    }

    if (cfg.aliases && Array.isArray(cfg.aliases)) {
      for (const alias of cfg.aliases) {
        if (alias === serviceKey) continue;
        const aliasPath = `/${alias.replace(/_/g, '/')}`;
        if (!routeMap.has(aliasPath)) {
          routeMap.set(aliasPath, serviceKey);
        }
      }
    }
  }

  for (const [path, serviceKey] of routeMap) {
    router.post(path, ...createServiceRoute(serviceKey));
  }

  return routeMap;
}

const dynamicRoutes = registerDynamicServiceRoutes();

// ==================== 404处理 ====================

router.use('*', (req, res) => {
  const dynamicEndpoints = Array.from(dynamicRoutes.keys()).map(p => `POST ${p}`);

  res.status(404).json({
    success: false,
    error: 'TTS endpoint not found',
    message: `The requested TTS endpoint ${req.method} ${req.originalUrl} is not available`,
    availableEndpoints: [
      'POST /api/tts/synthesize - Unified TTS synthesis',
      'POST /api/tts - Legacy compatibility',
      'POST /api/tts/batch - Batch synthesis',
      'GET /api/tts/voices - Voice list',
      'GET /api/tts/voices/:id - Single voice',
      'GET /api/tts/voices/:id/detail - Voice detail',
      'GET /api/tts/providers - Provider list',
      'GET /api/tts/capabilities/:service - Capabilities',
      'GET /api/tts/filters - Filter options',
      'GET /api/tts/catalog - Frontend catalog',
      'GET /api/tts/frontend - Frontend voices',
      'GET /api/tts/bootstrap - Frontend bootstrap',
      'GET /api/tts/health - Health check',
      'GET /api/tts/stats - Statistics',
      'POST /api/tts/reset-stats - Reset stats',
      'POST /api/tts/clear-cache - Clear cache',
      ...dynamicEndpoints
    ],
    timestamp: new Date().toISOString()
  });
});

// ==================== 错误处理 ====================

router.use((error, req, res, next) => {
  console.error(`[TTS Route Error] ${req.method} ${req.path}:`, error);

  res.status(error.status || 500).json({
    success: false,
    error: error.message || 'Internal server error',
    code: error.code || 'INTERNAL_ERROR',
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
