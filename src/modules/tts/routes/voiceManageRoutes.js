/**
 * 音色管理路由
 *
 * RESTful API:
 * - GET    /api/voices          - 列表查询
 * - GET    /api/voices/:id      - 精确查询
 * - POST   /api/voices          - 添加音色
 * - PUT    /api/voices/:id      - 更新音色
 * - DELETE /api/voices/:id      - 删除音色
 * - POST   /api/voices/save     - 保存到文件
 * - POST   /api/voices/reload   - 重新加载
 *
 * 路由层职责：
 * - 入参接收
 * - 调用 VoiceWriteService
 * - 响应格式化
 */

const express = require('express');
const router = express.Router();

const { voiceRegistry } = require('../core/VoiceRegistry');
const { voiceWriteService } = require('../application/VoiceWriteService');
const { unifiedAuth } = require('../../../core/middleware/apiKeyMiddleware');

// Management endpoints must be authenticated.
router.use(unifiedAuth.createMiddleware({
  required: true,
  permissions: ['admin.access'],
  rateLimitTier: 'admin',
  metadata: { service: 'voice-management' }
}));

// ==================== 查询 ====================

/**
 * GET /api/voices
 * 查询音色列表
 * Query: provider, service, tags, gender
 */
router.get('/', async (req, res) => {
  try {
    const { provider, service, tags, gender } = req.query;

    let voices = voiceRegistry.getAll();

    // 按提供商过滤
    if (provider) {
      voices = voiceRegistry.getByProvider(provider);
    }

    // 按服务过滤
    if (provider && service) {
      voices = voiceRegistry.getByProviderAndService(provider, service);
    }

    // 按性别过滤
    if (gender) {
      voices = voices.filter(v => {
        const vGender = v.profile?.gender || v.gender;
        return vGender === gender;
      });
    }

    // 按标签过滤
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim());
      voices = voices.filter(v => {
        const vTags = v.profile?.tags || v.tags;
        return vTags && tagList.some(t => vTags.includes(t));
      });
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
 * GET /api/voices/:id
 * 精确查询
 */
router.get('/:id', (req, res) => {
  const voice = voiceRegistry.get(req.params.id);

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
});

/**
 * GET /api/voices/stats/overview
 * 统计信息
 */
router.get('/stats/overview', (req, res) => {
  res.json({
    success: true,
    data: voiceRegistry.getStats()
  });
});

/**
 * GET /api/voices/providers/status
 * 服务商状态
 */
router.get('/providers/status', (req, res) => {
  res.json({
    success: true,
    data: {
      enabled: voiceRegistry.getEnabledProviders(),
      disabled: voiceRegistry.getDisabledProviders(),
      all: voiceRegistry.getStats().providers
    }
  });
});

/**
 * GET /api/voices/providers/:provider/enabled
 * 检查服务商是否启用
 */
router.get('/providers/:provider/enabled', (req, res) => {
  const enabled = voiceRegistry.isProviderEnabled(req.params.provider);
  res.json({
    success: true,
    data: {
      provider: req.params.provider,
      enabled
    }
  });
});

// ==================== 写入（调用 VoiceWriteService） ====================

/**
 * POST /api/voices
 * 添加音色
 */
router.post('/', (req, res) => {
  const result = voiceWriteService.create(req.body);

  if (!result.success) {
    const statusCode = result.error === 'Voice already exists' ? 409 :
                       result.error.includes('validation') ? 400 : 400;
    return res.status(statusCode).json({
      success: false,
      error: result.error,
      details: result.details
    });
  }

  res.status(201).json({
    success: true,
    data: result.data,
    message: `Voice added: ${result.data.identity.id}`
  });
});

/**
 * POST /api/voices/batch
 * 批量添加（复用 create 的校验逻辑）
 */
router.post('/batch', (req, res) => {
  const { voices } = req.body;

  if (!Array.isArray(voices)) {
    return res.status(400).json({
      success: false,
      error: 'voices must be an array'
    });
  }

  const result = voiceWriteService.createBatch(voices);

  res.status(201).json({
    success: result.success,
    data: result.data,
    message: `Added ${result.data.added.length} voices, ${result.data.errors.length} failed`
  });
});

/**
 * PUT /api/voices/:id
 * 更新音色
 */
router.put('/:id', (req, res) => {
  const result = voiceWriteService.update(req.params.id, req.body);

  if (!result.success) {
    const statusCode = result.error === 'Voice not found' ? 404 :
                       result.error.includes('validation') ? 400 : 400;
    return res.status(statusCode).json({
      success: false,
      error: result.error,
      details: result.details
    });
  }

  res.json({
    success: true,
    data: result.data,
    message: `Voice updated: ${req.params.id}`
  });
});

/**
 * DELETE /api/voices/:id
 * 删除音色
 */
router.delete('/:id', (req, res) => {
  const result = voiceWriteService.remove(req.params.id);

  if (!result.success) {
    return res.status(404).json({
      success: false,
      error: result.error
    });
  }

  res.json({
    success: true,
    message: `Voice removed: ${req.params.id}`
  });
});

// ==================== 持久化 ====================

/**
 * POST /api/voices/save
 * 保存到文件
 */
router.post('/save', async (req, res) => {
  try {
    await voiceWriteService.save();

    res.json({
      success: true,
      message: `Saved ${voiceRegistry.voices.size} voices to file`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/voices/reload
 * 从文件重新加载
 */
router.post('/reload', async (req, res) => {
  try {
    await voiceWriteService.reload();

    res.json({
      success: true,
      message: `Reloaded ${voiceRegistry.voices.size} voices`,
      stats: voiceRegistry.getStats()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
