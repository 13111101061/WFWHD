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
const { validateTtsParams, validateBatchParams, securityLogger } = require('../../../src/shared/middleware/securityMiddleware');
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

// 鉴权中间件快捷引用
const ttsAuth = unifiedAuth.createMiddleware({ service: 'tts' });

/**
 * 路由包装器：消除重复的 try/catch + getAdapter 样板
 * @param {string} handlerName - TtsHttpAdapter 方法名
 */
const wrap = (handlerName) => async (req, res, next) => {
  try {
    const adapter = await getAdapter();
    await adapter[handlerName](req, res);
  } catch (error) {
    next(error);
  }
};

// ==================== 核心合成端点 ====================

/**
 * 统一TTS合成接口
 * POST /api/tts/synthesize
 */
router.post('/synthesize',
  ttsAuth,
  securityLogger,
  validateTtsParams,
  createUnifiedTtsMiddleware(),
  wrap('synthesize')
);

/**
 * 遗留兼容端点：POST /api/tts/
 * 与 /synthesize 完全相同，用于向后兼容
 */
router.post('/',
  ttsAuth,
  securityLogger,
  validateTtsParams,
  createUnifiedTtsMiddleware(),
  wrap('synthesize')
);

/**
 * 批量合成
 * POST /api/tts/batch
 * 修复：使用专用验证中间件，不要求text字段
 */
router.post('/batch',
  ttsAuth,
  securityLogger,
  validateBatchParams,
  wrap('batchSynthesize')
);

// ==================== 音色查询端点 ====================

/**
 * 获取音色列表
 * GET /api/tts/voices?service=xxx
 * 注意：公开只读端点，不加 auth，便于前端音色页免登录访问
 */
router.get('/voices',
  requestLogger,
  wrap('getVoices')
);

/**
 * 获取单个音色
 * GET /api/tts/voices/:id
 * 注意：公开只读端点，不加 auth
 */
router.get('/voices/:id',
  wrap('getVoiceById')
);

/**
 * 获取音色详情
 * GET /api/tts/voices/:id/detail
 * 注意：公开只读端点，不加 auth
 */
router.get('/voices/:id/detail',
  wrap('getVoiceDetail')
);

/**
 * 获取服务提供商列表
 * GET /api/tts/providers
 */
router.get('/providers',
  ttsAuth,
  requestLogger,
  wrap('getProviders')
);

/**
 * 获取 Provider 调用指标
 * GET /api/tts/providers/metrics?service=xxx&window=1h
 */
router.get('/providers/metrics',
  ttsAuth,
  wrap('getProviderMetrics')
);

/**
 * 能力匹配查询
 * POST /api/tts/providers/match
 */
router.post('/providers/match',
  ttsAuth,
  wrap('matchProviders')
);

/**
 * 获取服务能力
 * GET /api/tts/capabilities/:service
 */
router.get('/capabilities/:service',
  ttsAuth,
  wrap('getCapabilities')
);

/**
 * 获取筛选选项
 * GET /api/tts/filters
 * @deprecated 使用 /api/tts/bootstrap 替代
 * 注意：deprecated 端点不加强 auth，避免破坏存量调用方
 */
router.get('/filters',
  (req, res, next) => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', 'Sat, 01 Nov 2026 00:00:00 GMT');
    res.setHeader('Link', '</api/tts/bootstrap>; rel="successor-version"');
    next();
  },
  wrap('getFilterOptions')
);

/**
 * 获取前端展示目录
 * GET /api/tts/catalog
 * @deprecated 使用 /api/tts/bootstrap 替代
 * 注意：deprecated 端点不加强 auth，避免破坏存量调用方
 */
router.get('/catalog',
  requestLogger,
  (req, res, next) => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', 'Sat, 01 Nov 2026 00:00:00 GMT');
    res.setHeader('Link', '</api/tts/bootstrap>; rel="successor-version", </api/tts/services/form-summary>; rel="related"');
    next();
  },
  wrap('getFrontendCatalog')
);

/**
 * 获取前端展示音色数据（精简版）
 * GET /api/tts/frontend
 * @deprecated 使用 /api/tts/bootstrap 替代
 * 注意：deprecated 端点不加强 auth，避免破坏存量调用方
 */
router.get('/frontend',
  requestLogger,
  (req, res, next) => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', 'Sat, 01 Nov 2026 00:00:00 GMT');
    res.setHeader('Link', '</api/tts/bootstrap>; rel="successor-version"');
    next();
  },
  wrap('getFrontendVoices')
);

/**
 * 获取前端启动包（完整前端初始化数据）
 * GET /api/tts/bootstrap
 */
router.get('/bootstrap',
  ttsAuth,
  requestLogger,
  wrap('getFrontendBootstrap')
);

// ==================== 表单一体化端点 ====================

/**
 * 获取全部服务的紧凑能力摘要
 * GET /api/tts/services/form-summary
 * 注意：必须在 /services/:service/form 之前注册，否则 form-summary 会被当作 :service 参数匹配
 */
router.get('/services/form-summary',
  ttsAuth,
  requestLogger,
  wrap('getAllServicesFormSummary')
);

/**
 * 获取服务合成表单数据（前端一体化接口）
 * GET /api/tts/services/:service/form
 *
 * 一次请求返回渲染合成表单所需的全部数据：
 * 服务商信息 + 紧凑能力 + 可用音色 + 调用模板
 */
router.get('/services/:service/form',
  ttsAuth,
  requestLogger,
  wrap('getServiceForm')
);

// ==================== 排队系统端点 ====================

/**
 * 获取队列快照
 * GET /api/tts/queue
 */
router.get('/queue',
  ttsAuth,
  requestLogger,
  wrap('getQueueSnapshot')
);

/**
 * 获取任务队列状态
 * GET /api/tts/queue/:requestId
 */
router.get('/queue/:requestId',
  ttsAuth,
  wrap('getQueueStatus')
);

/**
 * 取消排队任务
 * DELETE /api/tts/queue/:requestId
 */
router.delete('/queue/:requestId',
  ttsAuth,
  wrap('cancelQueueTask')
);

// ==================== 运维管理端点 ====================

/**
 * 服务健康检查
 * GET /api/tts/health
 */
router.get('/health',
  ttsAuth,
  requestLogger,
  wrap('getHealthStatus')
);

/**
 * 服务统计信息
 * GET /api/tts/stats
 */
router.get('/stats',
  ttsAuth,
  requestLogger,
  wrap('getStats')
);

/**
 * 重置统计信息
 * POST /api/tts/reset-stats
 */
router.post('/reset-stats',
  ttsAuth,
  requestLogger,
  wrap('resetStats')
);

/**
 * 清理缓存
 * POST /api/tts/clear-cache
 */
router.post('/clear-cache',
  ttsAuth,
  requestLogger,
  wrap('clearCache')
);

// ==================== 服务专用路由（动态注册） ====================

const createServiceRoute = (serviceName) => {
  return [
    unifiedAuth.createMiddleware({ service: 'tts', serviceScope: `tts:${serviceName}` }),
    securityLogger,
    (req, res, next) => {
      req.body = req.body || {};
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
    code: 'UNKNOWN_SERVICE',
    message: `The requested TTS endpoint ${req.method} ${req.originalUrl} is not available`,
    retryable: false,
    availableEndpoints: [
      'POST /api/tts/synthesize - Unified TTS synthesis',
      'POST /api/tts - Legacy compatibility',
      'POST /api/tts/batch - Batch synthesis',
      'GET /api/tts/voices - Voice list',
      'GET /api/tts/voices/:id - Single voice',
      'GET /api/tts/voices/:id/detail - Voice detail',
      'GET /api/tts/providers - Provider list',
      'GET /api/tts/capabilities/:service - Capabilities',
      'GET /api/tts/services/form-summary - All services compact capability summary',
      'GET /api/tts/services/:service/form - Service synthesis form data',
      'GET /api/tts/filters - Filter options (deprecated)',
      'GET /api/tts/catalog - Frontend catalog (deprecated)',
      'GET /api/tts/frontend - Frontend voices (deprecated)',
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
    code: error.code || 'INTERNAL_ERROR',
    message: error.message || 'Internal server error',
    retryable: false,
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
