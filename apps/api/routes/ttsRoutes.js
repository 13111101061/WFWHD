const express = require('express');
const UnifiedTtsController = require('../../../src/modules/tts/UnifiedTtsController');
const { unifiedAuth } = require('../../../src/core/middleware/apiKeyMiddleware');
const { voiceModelRegistry } = require('../../../src/modules/tts/config/VoiceModelRegistry');
require('../../../src/modules/tts/config/voice-hot-reload');
const voiceRoutes = require('../../../src/modules/tts/routes/voiceRoutes');
const { createUnifiedTtsMiddleware } = require('../../../src/shared/middleware/combinedMiddleware');
const { validateTtsParams, securityLogger } = require('../../../src/shared/middleware/securityMiddleware');

/**
 * TTS统一路由
 * 提供简洁、统一的API接口，自动路由到相应的TTS服务
 */
const router = express.Router();

// 初始化模型注册中心
voiceModelRegistry.initialize().catch(error => {
  console.error('Failed to initialize voice model registry:', error);
});

// 创建TTS控制器实例
const ttsController = new UnifiedTtsController();

// 请求日志中间件
const requestLogger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
};

/**
 * 统一TTS合成接口
 * POST /api/tts/synthesize
 * Body: {
 *   service: "aliyun_cosyvoice" | "aliyun_qwen_http" | "tencent" | "volcengine_http" | "volcengine_ws" | "minimax",
 *   text: "要转换的文本",
 *   voice: "音色ID",
 *   speed: 1.0,
 *   pitch: 1.0,
 *   volume: 5,
 *   format: "mp3",
 *   sample_rate: 22050
 * }
 */
router.post('/synthesize',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  securityLogger,
  validateTtsParams,
  createUnifiedTtsMiddleware(),
  ttsController.synthesize.bind(ttsController)
);

/**
 * 获取音色列表接口
 * GET /api/tts/voices?service=aliyun_cosyvoice
 * 可选参数：service - 指定服务，不提供则返回所有服务的音色
 */
router.get('/voices',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  ttsController.getVoices.bind(ttsController)
);

router.use('/voices', voiceRoutes);

/**
 * 获取服务提供商列表
 * GET /api/tts/providers
 */
router.get('/providers',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  ttsController.getProviders.bind(ttsController)
);

/**
 * 服务健康检查
 * GET /api/tts/health
 */
router.get('/health',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  ttsController.getHealthStatus.bind(ttsController)
);

/**
 * 服务状态和统计信息
 * GET /api/tts/stats
 */
router.get('/stats',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  (req, res) => {
    try {
      const stats = ttsController.getStats();
      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get statistics',
        message: error.message,
        timestamp: new Date().toISOString()
      });
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
  (req, res) => {
    try {
      const result = ttsController.clearCache();
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to clear cache',
        message: error.message,
        timestamp: new Date().toISOString()
      });
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
  (req, res) => {
    try {
      const result = ttsController.resetStats();
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to reset statistics',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 批量文本转语音接口
 * POST /api/tts/batch
 * Body: {
 *   service: "aliyun_cosyvoice",
 *   texts: ["文本1", "文本2", "文本3"],
 *   options: { voice: "xxx", speed: 1.0 }
 * }
 */
router.post('/batch',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  securityLogger,
  validateTtsParams,
  createUnifiedTtsMiddleware(),
  ttsController.batchSynthesize.bind(ttsController)
);

/**
 * 服务专用路由 - 为特定服务提供快捷访问
 */

// 服务专用路由 - 使用统一中间件，自动设置服务类型
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
    ttsController.synthesize.bind(ttsController)
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

// 404处理 - 未定义的TTS路由
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'TTS endpoint not found',
    message: `The requested TTS endpoint ${req.method} ${req.originalUrl} is not available`,
    availableEndpoints: [
      'POST /api/tts/synthesize - 统一TTS合成接口',
      'GET /api/tts/voices - 获取音色列表',
      'GET /api/tts/providers - 获取服务提供商列表',
      'GET /api/tts/health - 服务健康检查',
      'GET /api/tts/stats - 服务统计信息',
      'POST /api/tts/clear-cache - 清理缓存',
      'POST /api/tts/reset-stats - 重置统计信息',
      'POST /api/tts/batch - 批量文本转语音',
      'POST /api/tts/aliyun/cosyvoice - 阿里云CosyVoice',
      'POST /api/tts/aliyun/qwen - 阿里云Qwen',
      'POST /api/tts/tencent - 腾讯云TTS',
      'POST /api/tts/volcengine/http - 火山引擎HTTP',
      'POST /api/tts/volcengine/websocket - 火山引擎WebSocket',
      'POST /api/tts/minimax - MiniMax TTS'
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
