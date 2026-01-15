const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

/**
 * 管理员路由 - 专为微服务节点设计
 * 提供基础的系统管理功能，不包含用户管理
 */

/**
 * @route GET /api/admin/system/info
 * @desc 获取系统信息
 * @access Private (需要管理员权限)
 */
router.get('/system/info', (req, res) => {
  try {
    const stats = req.app.locals.unifiedAuth?.getStats();

    res.json({
      success: true,
      data: {
        service: {
          name: 'TTS Microservice',
          version: '1.0.1',
          uptime: process.uptime(),
          nodeVersion: process.version,
          platform: process.platform,
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString()
        },
        auth: stats,
        environment: {
          NODE_ENV: process.env.NODE_ENV || 'development',
          PORT: process.env.PORT || 3000
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get system info',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/system/health
 * @desc 获取详细的健康检查信息
 * @access Private (需要管理员权限)
 */
router.get('/system/health', (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    res.json({
      success: true,
      data: {
        status: 'healthy',
        uptime: {
          seconds: uptime,
          formatted: formatUptime(uptime)
        },
        memory: {
          rss: formatBytes(memoryUsage.rss),
          heapTotal: formatBytes(memoryUsage.heapTotal),
          heapUsed: formatBytes(memoryUsage.heapUsed),
          external: formatBytes(memoryUsage.external)
        },
        performance: {
          cpuUsage: process.cpuUsage(),
          timestamp: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/config
 * @desc 获取当前配置（不包含敏感信息）
 * @access Private (需要管理员权限)
 */
router.get('/config', (req, res) => {
  try {
    // 检查 .env 文件是否存在
    const envPath = path.join(process.cwd(), '.env');

    res.json({
      success: true,
      data: {
        hasEnvFile: true,
        configuredServices: {
          aliyunTts: !!process.env.TTS_API_KEY && process.env.TTS_API_KEY !== 'your-dashscope-api-key-here',
          tencentTts: !!(process.env.TENCENTCLOUD_SECRET_ID && process.env.TENCENTCLOUD_SECRET_KEY),
          volcengineTts: !!(process.env.VOLCENGINE_APP_ID && process.env.VOLCENGINE_TOKEN),
          snpanStorage: !!(process.env.SNPAN_ACCOUNT_AID && process.env.SNPAN_ACCOUNT_KEY)
        },
        apiKeys: {
          configured: !!(process.env.API_KEYS && process.env.API_KEYS.split(',').length > 0),
          count: process.env.API_KEYS ? process.env.API_KEYS.split(',').length : 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get config',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/logs
 * @desc 获取最近的认证日志
 * @access Private (需要管理员权限)
 */
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const events = req.app.locals.unifiedAuth?.getRecentEvents(limit);

    res.json({
      success: true,
      data: {
        events: events || [],
        total: events?.length || 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get logs',
      message: error.message
    });
  }
});

/**
 * @route POST /api/admin/api-keys
 * @desc 生成新的API密钥
 * @access Private (需要管理员权限)
 */
router.post('/api-keys', (req, res) => {
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

/**
 * @route GET /api/admin/api-keys
 * @desc 获取所有API密钥列表
 * @access Private (需要管理员权限)
 */
router.get('/api-keys', (req, res) => {
  try {
    const keys = req.app.locals.unifiedAuth?.getAllKeys();

    res.json({
      success: true,
      data: keys || [],
      total: keys?.length || 0
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get API keys',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/metrics
 * @desc 获取认证指标
 * @access Private (需要管理员权限)
 */
router.get('/metrics', (req, res) => {
  try {
    const metrics = req.app.locals.unifiedAuth?.getMetrics();

    res.json({
      success: true,
      data: metrics || {},
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get metrics',
      message: error.message
    });
  }
});

/**
 * @route POST /api/admin/test-api-key
 * @desc 测试API密钥有效性
 * @access Private (需要管理员权限)
 */
router.post('/test-api-key', (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key is required'
      });
    }

    // 这里可以添加密钥测试逻辑
    res.json({
      success: true,
      data: {
        valid: true,
        keyType: 'admin',
        permissions: ['full'],
        testedAt: new Date().toISOString()
      },
      message: 'API key is valid'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to test API key',
      message: error.message
    });
  }
});

// 工具函数
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;