/**
 * TTS 统一路由 (新架构)
 *
 * 使用新的适配器架构和凭证模块
 */

const express = require('express');
const router = express.Router();

const { createProvider, getRegisteredProviders } = require('../../../src/modules/tts/adapters/providers');
const { voiceRegistry } = require('../../../src/modules/tts/core/VoiceRegistry');
const credentials = require('../../../src/modules/credentials');
const { unifiedAuth } = require('../../../src/core/middleware/apiKeyMiddleware');

// ==================== 中间件 ====================

const requestLogger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
};

// ==================== 主要接口 ====================

/**
 * POST /api/tts/synthesize
 * 统一语音合成接口
 */
router.post('/synthesize',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  async (req, res) => {
    try {
      const { text, service = 'aliyun_qwen_http', voice, model, speed, pitch, format, sampleRate } = req.body;

      // 参数校验
      if (!text) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: text'
        });
      }

      if (typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Text must be a non-empty string'
        });
      }

      if (text.length > 10000) {
        return res.status(400).json({
          success: false,
          error: 'Text length must not exceed 10000 characters'
        });
      }

      // 检查服务商凭证
      const providerKey = service.split('_')[0];
      if (!credentials.isConfigured(providerKey)) {
        return res.status(503).json({
          success: false,
          error: `Provider not configured: ${providerKey}`,
          hint: 'Please check API key configuration'
        });
      }

      // 获取音色配置
      let voiceConfig = null;
      if (voice) {
        voiceConfig = voiceRegistry.get(voice);
      }

      // 创建适配器
      const adapter = createProvider(service);

      // 合成选项
      const options = {
        voice: voiceConfig?.sourceId || voiceConfig?.ttsConfig?.voiceName || voice || 'Cherry',
        model: model || voiceConfig?.ttsConfig?.model,
        speed: speed || 1.0,
        pitch: pitch || 1.0,
        format: format || 'wav',
        sampleRate: sampleRate || voiceConfig?.ttsConfig?.sampleRate || 24000
      };

      // 执行合成
      const result = await adapter.synthesizeAndSave(text, options);

      res.json({
        success: true,
        data: {
          audioUrl: result.url,
          format: result.format,
          size: result.size,
          isRemote: result.isRemote,
          provider: service,
          voice: options.voice
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('TTS Error:', error.message);

      const statusCode = error.code === 'CONFIG_ERROR' ? 503 :
                         error.code === 'VALIDATION_ERROR' ? 400 : 500;

      res.status(statusCode).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }
  }
);

/**
 * GET /api/tts/voices
 * 获取音色列表
 */
router.get('/voices',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  (req, res) => {
    try {
      const { provider, service, gender, tags } = req.query;

      let voices = voiceRegistry.getAll();

      if (provider && service) {
        voices = voiceRegistry.getByProviderAndService(provider, service);
      } else if (provider) {
        voices = voiceRegistry.getByProvider(provider);
      }

      if (gender) {
        voices = voices.filter(v => v.gender === gender);
      }

      if (tags) {
        const tagList = tags.split(',').map(t => t.trim());
        voices = voices.filter(v =>
          v.tags && tagList.some(t => v.tags.includes(t))
        );
      }

      res.json({
        success: true,
        data: voices,
        count: voices.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * GET /api/tts/providers
 * 获取服务商状态
 */
router.get('/providers',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  (req, res) => {
    try {
      const providers = credentials.listProviders();

      res.json({
        success: true,
        data: providers,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * GET /api/tts/health
 * 健康检查
 */
router.get('/health',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  (req, res) => {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      providers: credentials.listConfigured()
    });
  }
);

/**
 * GET /api/tts/stats
 * 统计信息
 */
router.get('/stats',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  (req, res) => {
    try {
      const stats = voiceRegistry.getStats();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ==================== 服务专用快捷路由 ====================

const createServiceRoute = (serviceType) => {
  return [
    unifiedAuth.createMiddleware({ service: 'tts' }),
    requestLogger,
    async (req, res) => {
      try {
        const { text, voice, model, speed, pitch, format, sampleRate } = req.body;

        if (!text) {
          return res.status(400).json({
            success: false,
            error: 'Missing required parameter: text'
          });
        }

        const providerKey = serviceType.split('_')[0];
        if (!credentials.isConfigured(providerKey)) {
          return res.status(503).json({
            success: false,
            error: `Provider not configured: ${providerKey}`
          });
        }

        const adapter = createProvider(serviceType);
        const result = await adapter.synthesizeAndSave(text, {
          voice: voice || 'Cherry',
          model,
          speed: speed || 1.0,
          pitch: pitch || 1.0,
          format: format || 'wav',
          sampleRate
        });

        res.json({
          success: true,
          data: {
            audioUrl: result.url,
            format: result.format,
            isRemote: result.isRemote,
            provider: serviceType
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  ];
};

// 阿里云快捷路由
router.post('/aliyun/cosyvoice', ...createServiceRoute('aliyun_cosyvoice'));
router.post('/aliyun/qwen', ...createServiceRoute('aliyun_qwen_http'));

// 腾讯云快捷路由
router.post('/tencent', ...createServiceRoute('tencent'));

// 火山引擎快捷路由
router.post('/volcengine/http', ...createServiceRoute('volcengine_http'));

// MiniMax快捷路由
router.post('/minimax', ...createServiceRoute('minimax'));

// ==================== 404处理 ====================

router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'TTS endpoint not found',
    availableEndpoints: [
      'POST /api/tts/synthesize - 统一TTS合成',
      'GET /api/tts/voices - 获取音色列表',
      'GET /api/tts/providers - 获取服务商状态',
      'GET /api/tts/health - 健康检查',
      'GET /api/tts/stats - 统计信息',
      'POST /api/tts/aliyun/cosyvoice - 阿里云CosyVoice',
      'POST /api/tts/aliyun/qwen - 阿里云Qwen',
      'POST /api/tts/tencent - 腾讯云',
      'POST /api/tts/volcengine/http - 火山引擎',
      'POST /api/tts/minimax - MiniMax'
    ]
  });
});

module.exports = router;