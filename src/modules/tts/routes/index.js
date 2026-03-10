/**
 * TTS统一路由
 *
 * 六边形架构下的HTTP路由入口
 * 所有请求通过 TtsHttpAdapter 转发给领域服务
 *
 * 使用方式:
 * const ttsRoutes = require('./modules/tts/routes');
 * app.use('/api/tts', authMiddleware, ttsRoutes);
 */

const express = require('express');
const router = express.Router();

// 服务容器
const serviceContainer = require('../../../config/ServiceContainer');

/**
 * 获取HTTP适配器
 */
function getHttpAdapter() {
  return serviceContainer.get('ttsHttpAdapter');
}

// ==================== 核心API ====================

/**
 * TTS合成
 * POST /api/tts/synthesize
 *
 * Body: {
 *   service: "aliyun_cosyvoice" | "tencent" | "volcengine_http" | ...,
 *   text: "要转换的文本",
 *   voice: "音色ID",
 *   systemId: "全局音色ID（可选）",
 *   options: { speed, pitch, volume, format, sample_rate }
 * }
 */
router.post('/synthesize', async (req, res) => {
  const adapter = getHttpAdapter();
  await adapter.synthesize(req, res);
});

/**
 * 批量合成
 * POST /api/tts/batch
 *
 * Body: {
 *   service: "aliyun_cosyvoice",
 *   texts: ["文本1", "文本2", ...],
 *   options: { voice, speed, ... }
 * }
 */
router.post('/batch', async (req, res) => {
  const adapter = getHttpAdapter();
  await adapter.batchSynthesize(req, res);
});

// ==================== 查询API ====================

/**
 * 获取音色列表
 * GET /api/tts/voices?service=aliyun_cosyvoice
 */
router.get('/voices', async (req, res) => {
  const adapter = getHttpAdapter();
  await adapter.getVoices(req, res);
});

/**
 * 获取服务提供商列表
 * GET /api/tts/providers
 */
router.get('/providers', async (req, res) => {
  const adapter = getHttpAdapter();
  await adapter.getProviders(req, res);
});

/**
 * 获取健康状态
 * GET /api/tts/health
 */
router.get('/health', async (req, res) => {
  const adapter = getHttpAdapter();
  await adapter.getHealthStatus(req, res);
});

/**
 * 获取统计信息
 * GET /api/tts/stats
 */
router.get('/stats', async (req, res) => {
  const adapter = getHttpAdapter();
  await adapter.getStats(req, res);
});

// ==================== 管理API ====================

/**
 * 重置统计
 * POST /api/tts/reset-stats
 */
router.post('/reset-stats', async (req, res) => {
  const adapter = getHttpAdapter();
  await adapter.resetStats(req, res);
});

/**
 * 清理缓存
 * POST /api/tts/clear-cache
 */
router.post('/clear-cache', async (req, res) => {
  const adapter = getHttpAdapter();
  await adapter.clearCache(req, res);
});

// ==================== 服务专用快捷路由 ====================

/**
 * 快捷路由生成器
 * POST /api/tts/aliyun/cosyvoice, /api/tts/tencent, etc.
 */
const createQuickRoute = (defaultService) => async (req, res) => {
  req.body.service = defaultService;
  const adapter = getHttpAdapter();
  await adapter.synthesize(req, res);
};

router.post('/aliyun/cosyvoice', createQuickRoute('aliyun_cosyvoice'));
router.post('/aliyun/qwen', createQuickRoute('aliyun_qwen_http'));
router.post('/tencent', createQuickRoute('tencent'));
router.post('/volcengine/http', createQuickRoute('volcengine_http'));
router.post('/volcengine/ws', createQuickRoute('volcengine_ws'));
router.post('/minimax', createQuickRoute('minimax'));

// ==================== 404处理 ====================

router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'TTS endpoint not found',
    message: `The endpoint ${req.method} ${req.originalUrl} does not exist`,
    availableEndpoints: [
      'POST /api/tts/synthesize - TTS合成',
      'POST /api/tts/batch - 批量合成',
      'GET /api/tts/voices - 音色列表',
      'GET /api/tts/providers - 提供商列表',
      'GET /api/tts/health - 健康状态',
      'GET /api/tts/stats - 统计信息',
      'POST /api/tts/reset-stats - 重置统计',
      'POST /api/tts/clear-cache - 清理缓存'
    ],
    timestamp: new Date().toISOString()
  });
});

module.exports = router;