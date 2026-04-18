/**
 * TTS统一路由 (v3.1 - 整改版)
 *
 * 整改内容：
 * - 修复批量合成链路：分离校验逻辑，允许texts数组
 * - 修复volcengine_ws路由：添加对应provider注册
 * - 统一服务标识：路由、解析器、注册表完全一致
 * - 统一响应契约：所有查询接口输出结构稳定
 */

const express = require('express');
const serviceContainer = require('../../../src/config/ServiceContainer');
const { unifiedAuth } = require('../../../src/core/middleware/apiKeyMiddleware');
const { validateTtsParams, securityLogger } = require('../../../src/shared/middleware/securityMiddleware');
const { createUnifiedTtsMiddleware } = require('../../../src/shared/middleware/combinedMiddleware');

const router = express.Router();

// 延迟初始化标记
let adapterInitialized = false;

/**
 * 获取HTTP适配器（懒加载）
 */
async function getAdapter() {
  if (!adapterInitialized) {
    await serviceContainer.initialize();
    adapterInitialized = true;
  }
  return serviceContainer.get('ttsHttpAdapter');
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
      adapter.synthesisService.resetStats();

      res.json({
        success: true,
        message: 'Statistics reset successfully',
        timestamp: new Date().toISOString()
      });
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

// ==================== 服务专用路由（快捷访问） ====================

const createServiceRoute = (serviceName) => {
  return [
    unifiedAuth.createMiddleware({ service: 'tts' }),
    securityLogger,
    validateTtsParams,
    createUnifiedTtsMiddleware(),
    (req, res, next) => {
      req.body.service = serviceName;
      next();
    },
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

// 阿里云CosyVoice专用
router.post('/aliyun/cosyvoice', ...createServiceRoute('aliyun_cosyvoice'));

// 阿里云Qwen专用
router.post('/aliyun/qwen', ...createServiceRoute('aliyun_qwen_http'));

// 腾讯云TTS专用
router.post('/tencent', ...createServiceRoute('tencent'));

// 火山引擎HTTP专用
router.post('/volcengine/http', ...createServiceRoute('volcengine_http'));

// 火山引擎WebSocket专用 - 修复：使用volcengine_http适配器（同一Provider）
router.post('/volcengine/websocket', ...createServiceRoute('volcengine_http'));

// MiniMax专用
router.post('/minimax', ...createServiceRoute('minimax_tts'));

// MOSS-TTS专用
router.post('/moss', ...createServiceRoute('moss_tts'));

// ==================== 404处理 ====================

router.use('*', (req, res) => {
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
      'GET /api/tts/health - Health check',
      'GET /api/tts/stats - Statistics',
      'POST /api/tts/reset-stats - Reset stats',
      'POST /api/tts/clear-cache - Clear cache',
      'POST /api/tts/aliyun/cosyvoice',
      'POST /api/tts/aliyun/qwen',
      'POST /api/tts/tencent',
      'POST /api/tts/volcengine/http',
      'POST /api/tts/volcengine/websocket',
      'POST /api/tts/minimax',
      'POST /api/tts/moss'
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
