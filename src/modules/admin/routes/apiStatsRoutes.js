const express = require('express');
const { getStatsService } = require('../../../shared/middleware/apiStatsMiddleware');
const router = express.Router();

/**
 * 获取总体统计信息
 * GET /api/admin/stats/overall
 */
router.get('/overall', async (req, res) => {
  try {
    const statsService = getStatsService();
    if (!statsService) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'API统计服务未初始化'
      });
    }

    const stats = await statsService.getOverallStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取总体统计失败:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取统计信息失败'
    });
  }
});

/**
 * 获取每日统计信息
 * GET /api/admin/stats/daily?days=30
 */
router.get('/daily', async (req, res) => {
  try {
    const statsService = getStatsService();
    if (!statsService) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'API统计服务未初始化'
      });
    }

    const days = parseInt(req.query.days) || 30;
    if (days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '天数参数必须在1-365之间'
      });
    }

    const stats = await statsService.getDailyStats(days);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取每日统计失败:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取每日统计失败'
    });
  }
});



/**
 * 获取热门端点
 * GET /api/admin/stats/endpoints?limit=10
 */
router.get('/endpoints', async (req, res) => {
  try {
    const statsService = getStatsService();
    if (!statsService) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'API统计服务未初始化'
      });
    }

    const limit = parseInt(req.query.limit) || 10;
    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '限制数量必须在1-100之间'
      });
    }

    const endpoints = await statsService.getTopEndpoints(limit);
    
    res.json({
      success: true,
      data: endpoints
    });
  } catch (error) {
    console.error('获取热门端点失败:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取热门端点失败'
    });
  }
});

/**
 * 获取统计摘要
 * GET /api/admin/stats/summary
 */
router.get('/summary', async (req, res) => {
  try {
    const statsService = getStatsService();
    if (!statsService) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'API统计服务未初始化'
      });
    }

    const [overallStats, dailyStats, topEndpoints] = await Promise.all([
      statsService.getOverallStats(),
      statsService.getDailyStats(7), // 最近7天
      statsService.getTopEndpoints(5) // 前5个热门端点
    ]);
    
    // 计算今日统计
    const today = new Date().toISOString().split('T')[0];
    const todayStats = dailyStats.dates[today] || { totalCalls: 0, errors: 0 };
    
    const summary = {
      totalCalls: overallStats.totalCalls || 0,
      todayCalls: todayStats.totalCalls,
      totalEndpoints: Object.keys(overallStats.endpoints || {}).length,
      topEndpoints: topEndpoints,
      lastUpdated: overallStats.lastUpdated
    };
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('获取统计摘要失败:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取统计摘要失败'
    });
  }
});

/**
 * 清理旧数据
 * DELETE /api/admin/stats/cleanup
 */
router.delete('/cleanup', async (req, res) => {
  try {
    const statsService = getStatsService();
    if (!statsService) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'API统计服务未初始化'
      });
    }

    const { daysToKeep = 90 } = req.body;
    
    if (daysToKeep < 1 || daysToKeep > 365) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '保留天数必须在1-365之间'
      });
    }

    await statsService.cleanupOldData(daysToKeep);
    
    res.json({
      success: true,
      message: `已清理${daysToKeep}天前的数据`
    });
  } catch (error) {
    console.error('清理数据失败:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '清理数据失败'
    });
  }
});

/**
 * 重置统计数据
 * DELETE /api/admin/stats/reset
 */
router.delete('/reset', async (req, res) => {
  try {
    const statsService = getStatsService();
    if (!statsService) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'API统计服务未初始化'
      });
    }

    await statsService.resetStats();
    
    res.json({
      success: true,
      message: '已重置所有统计数据'
    });
  } catch (error) {
    console.error('重置统计数据失败:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '重置统计数据失败'
    });
  }
});

/**
 * 导出统计数据
 * GET /api/admin/stats/export?format=json&type=all
 */
router.get('/export', async (req, res) => {
  try {
    const statsService = getStatsService();
    if (!statsService) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'API统计服务未初始化'
      });
    }

    const { format = 'json', type = 'all' } = req.query;
    
    if (format !== 'json') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '目前仅支持JSON格式导出'
      });
    }

    let exportData = {};
    
    if (type === 'all' || type === 'overall') {
      exportData.overall = await statsService.getOverallStats();
    }
    
    if (type === 'all' || type === 'daily') {
      exportData.daily = await statsService.getDailyStats(365); // 最近一年
    }
    

    
    // 添加导出元信息
    exportData.exportInfo = {
      exportTime: new Date().toISOString(),
      exportType: type,
      format: format
    };
    
    // 设置下载头
    const filename = `api_stats_${type}_${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    
    res.json(exportData);
  } catch (error) {
    console.error('导出统计数据失败:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '导出统计数据失败'
    });
  }
});

module.exports = router;