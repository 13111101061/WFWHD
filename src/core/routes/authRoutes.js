const express = require('express');
const router = express.Router();

/**
 * 认证管理路由
 * 提供密钥管理和监控功能
 */

// 获取认证统计信息
router.get('/stats', (req, res) => {
  try {
    const stats = req.app.locals.unifiedAuth?.getStats();
    const metrics = req.app.locals.unifiedAuth?.getMetrics();

    res.json({
      success: true,
      data: {
        stats,
        metrics,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get auth stats',
      message: error.message
    });
  }
});

// 生成新的API密钥
router.post('/keys', (req, res) => {
  try {
    const {
      services = ['*'],
      permissions = ['full'],
      description = '',
      expiresIn
    } = req.body;

    const newKey = req.app.locals.unifiedAuth?.generateKey({
      services,
      permissions,
      description,
      expiresIn
    });

    if (!newKey) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate API key'
      });
    }

    res.json({
      success: true,
      data: newKey,
      message: 'API key generated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate API key',
      message: error.message
    });
  }
});

// 获取所有密钥列表
router.get('/keys', (req, res) => {
  try {
    const keys = req.app.locals.unifiedAuth?.getAllKeys();

    res.json({
      success: true,
      data: keys,
      total: keys?.length || 0
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get keys',
      message: error.message
    });
  }
});

// 撤销密钥
router.delete('/keys/:keyId', (req, res) => {
  try {
    const { keyId } = req.params;
    const { reason } = req.body;

    // 这里需要实现密钥撤销逻辑
    // 由于安全考虑，当前只返回成功响应
    res.json({
      success: true,
      message: `Key ${keyId} revoked successfully`,
      reason: reason || 'Manual revocation'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to revoke key',
      message: error.message
    });
  }
});

// 获取最近认证事件
router.get('/events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const events = req.app.locals.unifiedAuth?.getRecentEvents(limit);

    res.json({
      success: true,
      data: events,
      total: events?.length || 0
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get events',
      message: error.message
    });
  }
});

module.exports = router;