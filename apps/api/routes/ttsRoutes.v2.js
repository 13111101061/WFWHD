/**
 * TTS统一路由 (v2.0 - Hexagonal Architecture)
 * 使用HTTP适配器模式，业务逻辑与Express解耦
 *
 * 架构变更：
 * - 旧: Routes -> Controller (req/res) -> ServiceManager -> Factory
 * - 新: Routes -> HttpAdapter -> SynthesisService (domain) -> ProviderAdapter
 */

const express = require('express');
const serviceContainer = require('../../../src/config/ServiceContainer');
const { unifiedAuth } = require('../../../src/core/middleware/apiKeyMiddleware');
const { voiceManager } = require('../../../src/modules/tts/core/VoiceManager');
const voiceRoutes = require('../../../src/modules/tts/routes/voiceRoutes');
const { createUnifiedTtsMiddleware } = require('../../../src/shared/middleware/combinedMiddleware');
const { validateTtsParams, securityLogger } = require('../../../src/shared/middleware/securityMiddleware');

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

// 初始化 VoiceManager
voiceManager.initialize().catch(error => {
  console.error('Failed to initialize VoiceManager:', error);
});

// 请求日志中间件
const requestLogger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
};

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
 * 获取音色列表接口
 * GET /api/tts/voices?service=aliyun_cosyvoice
 */
router.get('/voices',
  unifiedAuth.createMiddleware({ service: 'tts' }),
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

router.use('/voices', voiceRoutes);

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
 * 服务状态和统计信息
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
 * 清理缓存接口
 * POST /api/tts/clear-cache
 */
router.post('/clear-cache',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  async (req, res, next) => {
    try {
      const { clearAllCache } = require('../../../shared/utils/audioCache');
      const clearedCount = clearAllCache();

      res.json({
        success: true,
        clearedItems: clearedCount,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 重置统计信息接口
 * POST /api/tts/reset-stats
 */
router.post('/reset-stats',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      adapter.synthesisService.ttsProvider.clearCache();

      res.json({
        success: true,
        message: 'Statistics cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 批量文本转语音接口
 * POST /api/tts/batch
 */
router.post('/batch',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  securityLogger,
  validateTtsParams,
  createUnifiedTtsMiddleware(),
  async (req, res, next) => {
    try {
      const adapter = await getAdapter();
      await adapter.batchSynthesize(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 服务专用路由 - 为特定服务提供快捷访问
 */
const createServiceRoute = (serviceName, serviceType) => {
  return [
    unifiedAuth.createMiddleware({ service: 'tts' }),
    securityLogger,
    validateTtsParams,
    createUnifiedTtsMiddleware(),
    (req, res, next) => {
      req.body.service = serviceType;
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

// 阿里云CosyVoice专用路由
router.post('/aliyun/cosyvoice', ...createServiceRoute('aliyun_cosyvoice', 'aliyun_cosyvoice'));

// 阿里云Qwen专用路由
router.post('/aliyun/qwen', ...createServiceRoute('aliyun_qwen', 'aliyun_qwen_http'));

// 腾讯云TTS专用路由
router.post('/tencent', ...createServiceRoute('tencent', 'tencent'));

// 火山引擎HTTP专用路由
router.post('/volcengine/http', ...createServiceRoute('volcengine_http', 'volcengine_http'));

// 火山引擎WebSocket专用路由
router.post('/volcengine/websocket', ...createServiceRoute('volcengine_ws', 'volcengine_ws'));

// MiniMax专用路由
router.post('/minimax', ...createServiceRoute('minimax', 'minimax'));

// 404处理
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'TTS endpoint not found',
    message: `The requested TTS endpoint ${req.method} ${req.originalUrl} is not available`,
    availableEndpoints: [
      'POST /api/tts/synthesize - Unified TTS synthesis',
      'GET /api/tts/voices - Get voice list',
      'GET /api/tts/providers - Get provider list',
      'GET /api/tts/health - Health check',
      'GET /api/tts/stats - Statistics',
      'POST /api/tts/batch - Batch synthesis'
    ],
    timestamp: new Date().toISOString()
  });
});

// 错误处理中间件
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