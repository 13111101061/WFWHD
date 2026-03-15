/**
 * TTS 统一路由 (重构版)
 *
 * 职责：
 * - 接口接入
 * - 调用应用服务
 * - 返回结果
 *
 * 不再包含：
 * - provider 选择逻辑
 * - 默认值拼装
 * - 参数校验（已移至 service 层）
 */

const express = require('express');
const router = express.Router();

const { TtsSynthesisService } = require('../../../src/modules/tts/application/TtsSynthesisService');
const { TtsQueryService } = require('../../../src/modules/tts/application/TtsQueryService');
const { unifiedAuth } = require('../../../src/core/middleware/apiKeyMiddleware');

// ==================== 中间件 ====================

const requestLogger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
};

// ==================== 合成接口 ====================

/**
 * POST /api/tts/synthesize
 * 统一语音合成接口
 *
 * 请求体:
 * {
 *   text: string,           // 必填，要合成的文本
 *   service: string,        // 服务标识 (aliyun_qwen_http, tencent, volcengine, minimax 等)
 *   voiceId: string,        // 音色ID (可选，系统ID)
 *   options: {              // 可选
 *     speed: number,        // 语速
 *     pitch: number,        // 音调
 *     format: string,       // 音频格式
 *     sampleRate: number    // 采样率
 *   }
 * }
 */
router.post('/synthesize',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  async (req, res) => {
    const { text, service, voice, options } = req.body;

    // 兼容旧参数：voice -> voiceId
    const voiceId = voice || req.body.voiceId;

    // 调用合成服务
    const result = await TtsSynthesisService.synthesize({
      text,
      service,
      voiceId,
      options
    });

    // 根据结果返回
    const statusCode = TtsSynthesisService.getStatusCode(result);
    res.status(statusCode).json(result);
  }
);

/**
 * POST /api/tts
 * 兼容旧接口（重定向到 /synthesize）
 */
router.post('/',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  async (req, res) => {
    const { text, service, voice, model, speed, pitch, format, sampleRate } = req.body;

    // 转换为新格式
    const result = await TtsSynthesisService.synthesize({
      text,
      service,
      voiceId: voice,
      options: { model, speed, pitch, format, sampleRate }
    });

    const statusCode = TtsSynthesisService.getStatusCode(result);
    res.status(statusCode).json(result);
  }
);

// ==================== 查询接口 ====================

/**
 * GET /api/tts/voices
 * 获取音色列表（展示用）
 */
router.get('/voices',
  requestLogger,
  (req, res) => {
    const { provider, service, gender, tags, language } = req.query;

    const result = TtsQueryService.queryVoices({
      provider,
      service,
      gender,
      tags,
      language
    });

    res.json(result);
  }
);

/**
 * GET /api/tts/voices/:id
 * 获取单个音色详情（包含 profile/runtime 分层）
 */
router.get('/voices/:id',
  (req, res) => {
    const voice = TtsQueryService.getVoiceDetail(req.params.id);

    if (!voice) {
      return res.status(404).json({
        success: false,
        error: `Voice not found: ${req.params.id}`
      });
    }

    res.json({
      success: true,
      data: voice
    });
  }
);

/**
 * GET /api/tts/providers
 * 获取服务商列表
 */
router.get('/providers',
  requestLogger,
  (req, res) => {
    const result = TtsQueryService.getProviders();
    res.json(result);
  }
);

/**
 * GET /api/tts/capabilities/:service
 * 获取服务能力
 */
router.get('/capabilities/:service',
  (req, res) => {
    const result = TtsQueryService.getCapabilities(req.params.service);
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  }
);

/**
 * GET /api/tts/health
 * 健康检查
 */
router.get('/health',
  (req, res) => {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  }
);

/**
 * GET /api/tts/stats
 * 统计信息
 */
router.get('/stats',
  requestLogger,
  (req, res) => {
    const result = TtsQueryService.getStats();
    res.json(result);
  }
);

/**
 * GET /api/tts/filters
 * 获取筛选选项
 */
router.get('/filters',
  (req, res) => {
    const result = TtsQueryService.getFilterOptions();
    res.json(result);
  }
);

/**
 * GET /api/tts/catalog
 * Frontend one-shot catalog payload:
 * - voices (normalized display fields)
 * - filters/counts/index for client-side grouping
 * - providers metadata
 */
router.get('/catalog',
  requestLogger,
  (req, res) => {
    const result = TtsQueryService.getFrontendCatalog();
    res.json(result);
  }
);

// ==================== 快捷路由 ====================

/**
 * 快捷合成路由生成器
 */
const createQuickRoute = (serviceKey) => {
  return [
    unifiedAuth.createMiddleware({ service: 'tts' }),
    requestLogger,
    async (req, res) => {
      const { text, voice, speed, pitch, format, sampleRate } = req.body;

      const result = await TtsSynthesisService.quickSynthesize(
        serviceKey,
        text,
        { voice, speed, pitch, format, sampleRate }
      );

      const statusCode = TtsSynthesisService.getStatusCode(result);
      res.status(statusCode).json(result);
    }
  ];
};

// 阿里云快捷路由
router.post('/aliyun/cosyvoice', ...createQuickRoute('aliyun_cosyvoice'));
router.post('/aliyun/qwen', ...createQuickRoute('aliyun_qwen_http'));

// 腾讯云快捷路由
router.post('/tencent', ...createQuickRoute('tencent_tts'));

// 火山引擎快捷路由
router.post('/volcengine/http', ...createQuickRoute('volcengine_http'));

// MiniMax快捷路由
router.post('/minimax', ...createQuickRoute('minimax_tts'));

// MOSS快捷路由
router.post('/moss', ...createQuickRoute('moss_tts'));

// ==================== 404处理 ====================

router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'TTS endpoint not found',
    availableEndpoints: [
      'POST /api/tts/synthesize - 统一TTS合成',
      'POST /api/tts - 兼容旧接口',
      'GET /api/tts/voices - 获取音色列表',
      'GET /api/tts/voices/:id - 获取音色详情',
      'GET /api/tts/providers - 获取服务商列表',
      'GET /api/tts/capabilities/:service - 获取服务能力',
      'GET /api/tts/health - 健康检查',
      'GET /api/tts/stats - 统计信息',
      'GET /api/tts/filters - 获取筛选选项',
      // 快捷路由
      'POST /api/tts/aliyun/cosyvoice',
      'POST /api/tts/aliyun/qwen',
      'POST /api/tts/tencent',
      'POST /api/tts/volcengine/http',
      'POST /api/tts/minimax',
      'POST /api/tts/moss'
    ]
  });
});

module.exports = router;
