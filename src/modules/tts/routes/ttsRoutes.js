/**
 * TTS 统一合成路由
 *
 * POST /api/tts - 多服务商语音合成
 * GET /api/tts/voices - 获取可用音色
 */

const express = require('express');
const router = express.Router();

const { createProvider } = require('../adapters/providers');
const { voiceRegistry } = require('../core/VoiceRegistry');
const credentials = require('../../credentials');

/**
 * POST /api/tts
 * 语音合成接口
 *
 * 请求体:
 * {
 *   text: string,        // 必填，要合成的文本
 *   service: string,     // 服务商标识: aliyun_qwen_http, aliyun_cosyvoice, tencent, volcengine, minimax
 *   voice: string,       // 音色ID
 *   model: string,       // 模型 (可选)
 *   speed: number,       // 语速 0.5-2.0 (可选)
 *   pitch: number,       // 音调 0.5-1.5 (可选)
 *   format: string,      // 音频格式 mp3/wav (可选)
 *   sampleRate: number   // 采样率 (可选)
 * }
 */
router.post('/', async (req, res) => {
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
    const providerKey = service.split('_')[0]; // aliyun_qwen_http -> aliyun
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

    // 根据错误类型返回状态码
    const statusCode = error.code === 'CONFIG_ERROR' ? 503 :
                       error.code === 'VALIDATION_ERROR' ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      error: error.message,
      code: error.code
    });
  }
});

/**
 * GET /api/tts/voices
 * 获取可用音色列表
 *
 * Query:
 * - provider: 服务商过滤
 * - service: 服务过滤
 * - gender: 性别过滤
 * - tags: 标签过滤 (逗号分隔)
 */
router.get('/voices', (req, res) => {
  try {
    const { provider, service, gender, tags } = req.query;

    let voices = voiceRegistry.getAll();

    // 过滤
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
});

/**
 * GET /api/tts/providers
 * 获取服务商状态
 */
router.get('/providers', (req, res) => {
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
});

/**
 * GET /api/tts/stats
 * 获取统计信息
 */
router.get('/stats', (req, res) => {
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
});

module.exports = router;