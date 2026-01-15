const express = require('express');
const router = express.Router();
const UnifiedTtsController = require('../UnifiedTtsController');

/**
 * Legacy TTS Routes - DEPRECATED
 *
 * 这些路由已弃用，仅作为向后兼容的代理。
 * 所有请求现在通过 UnifiedController 处理，确保：
 * - 统一的参数校验
 * - 一致的缓存处理
 * - 熔断器和限流保护
 *
 * 请使用新的统一入口: POST /api/tts/synthesize
 */

// 记录弃用警告
function logDeprecationWarning(endpoint) {
  console.warn(`[DEPRECATED] ${endpoint} is deprecated. Please use POST /api/tts/synthesize instead.`);
}

// 创建 UnifiedController 实例
const controller = new UnifiedTtsController();

/**
 * Legacy POST / endpoint - 代理到 UnifiedController
 *
 * 这个端点已弃用。所有业务逻辑已移至 UnifiedController。
 * 此路由仅保留用于向后兼容。
 */
router.post('/', async (req, res) => {
  logDeprecationWarning('POST /api/tts/unified');

  try {
    // 直接代理到 UnifiedController.synthesize
    await controller.synthesize(req, res);
  } catch (error) {
    console.error('Legacy route proxy error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
});

/**
 * Legacy GET /voices endpoint - 代理到 UnifiedController
 *
 * 这个端点已弃用。所有业务逻辑已移至 UnifiedController。
 * 此路由仅保留用于向后兼容。
 */
router.get('/voices', async (req, res) => {
  logDeprecationWarning('GET /api/tts/unified/voices');

  try {
    // 直接代理到 UnifiedController.getVoices
    await controller.getVoices(req, res);
  } catch (error) {
    console.error('Legacy route proxy error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
});

module.exports = router;
