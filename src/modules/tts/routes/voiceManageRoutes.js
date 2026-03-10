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
 */

const express = require('express');
const router = express.Router();

const { voiceRegistry } = require('../core/VoiceRegistry');

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
      voices = voices.filter(v => v.gender === gender);
    }

    // 按标签过滤
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
 * GET /api/voices/stats
 * 统计信息
 */
router.get('/stats/overview', (req, res) => {
  res.json({
    success: true,
    data: voiceRegistry.getStats()
  });
});

// ==================== 管理 ====================

/**
 * POST /api/voices
 * 添加音色
 */
router.post('/', (req, res) => {
  try {
    const voice = req.body;

    // 基础校验
    if (!voice.id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: id'
      });
    }
    if (!voice.provider) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: provider'
      });
    }

    // 检查重复
    if (voiceRegistry.get(voice.id)) {
      return res.status(409).json({
        success: false,
        error: `Voice already exists: ${voice.id}`
      });
    }

    const added = voiceRegistry.add(voice);

    res.status(201).json({
      success: true,
      data: added,
      message: `Voice added: ${voice.id}`
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/voices/batch
 * 批量添加
 */
router.post('/batch', (req, res) => {
  try {
    const { voices } = req.body;

    if (!Array.isArray(voices)) {
      return res.status(400).json({
        success: false,
        error: 'voices must be an array'
      });
    }

    const result = voiceRegistry.addBatch(voices);

    res.status(201).json({
      success: true,
      data: result,
      message: `Added ${result.count} voices`
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/voices/:id
 * 更新音色
 */
router.put('/:id', (req, res) => {
  try {
    const updates = req.body;
    delete updates.id; // 禁止修改id

    const updated = voiceRegistry.update(req.params.id, updates);

    res.json({
      success: true,
      data: updated,
      message: `Voice updated: ${req.params.id}`
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/voices/:id
 * 删除音色
 */
router.delete('/:id', (req, res) => {
  const removed = voiceRegistry.remove(req.params.id);

  if (!removed) {
    return res.status(404).json({
      success: false,
      error: `Voice not found: ${req.params.id}`
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
    await voiceRegistry.save();

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
    await voiceRegistry.reload();

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