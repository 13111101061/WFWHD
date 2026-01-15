const express = require('express');
const { unifiedMetrics } = require('../../../src/shared/monitoring/UnifiedMetricsCollector');
const { unifiedAuth } = require('../../../src/core/middleware/apiKeyMiddleware');

/**
 * 统一监控路由
 * 替代所有分散的统计接口，提供标准化的监控数据
 */
const router = express.Router();

// 中间件：请求日志记录
const requestLogger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
};

// 记录监控请求本身的指标
const recordMonitoringRequest = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    unifiedMetrics.recordApiRequest({
      endpoint: req.path,
      method: req.method,
      responseTime,
      statusCode: res.statusCode,
      error: res.statusCode >= 400
    });
  });

  next();
};

/**
 * 获取实时指标
 * GET /api/monitoring/realtime
 */
router.get('/realtime',
  unifiedAuth.createMiddleware({ service: 'monitoring' }),
  requestLogger,
  recordMonitoringRequest,
  (req, res) => {
    try {
      const metrics = unifiedMetrics.getRealtimeMetrics();
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取实时指标失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get realtime metrics',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 获取每日指标
 * GET /api/monitoring/daily?days=7
 */
router.get('/daily',
  unifiedAuth.createMiddleware({ service: 'monitoring' }),
  requestLogger,
  recordMonitoringRequest,
  (req, res) => {
    try {
      const { days = 7 } = req.query;
      const metrics = unifiedMetrics.getDailyMetrics(parseInt(days));
      res.json({
        success: true,
        data: metrics,
        days: parseInt(days),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取每日指标失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get daily metrics',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 获取服务指标
 * GET /api/monitoring/services
 */
router.get('/services',
  unifiedAuth.createMiddleware({ service: 'monitoring' }),
  requestLogger,
  recordMonitoringRequest,
  (req, res) => {
    try {
      const metrics = unifiedMetrics.getServiceMetrics();
      res.json({
        success: true,
        data: metrics,
        serviceCount: Object.keys(metrics).length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取服务指标失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get service metrics',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 获取汇总指标
 * GET /api/monitoring/summary
 */
router.get('/summary',
  unifiedAuth.createMiddleware({ service: 'monitoring' }),
  requestLogger,
  recordMonitoringRequest,
  (req, res) => {
    try {
      const metrics = unifiedMetrics.getSummaryMetrics();
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取汇总指标失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get summary metrics',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 获取完整监控报告
 * GET /api/monitoring/report
 */
router.get('/report',
  unifiedAuth.createMiddleware({ service: 'monitoring' }),
  requestLogger,
  recordMonitoringRequest,
  (req, res) => {
    try {
      const report = unifiedMetrics.getFullReport();
      res.json({
        success: true,
        data: report,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取监控报告失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get monitoring report',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 记录手动事件
 * POST /api/monitoring/events
 * Body: { type: string, category: string, data?: object }
 */
router.post('/events',
  unifiedAuth.createMiddleware({ service: 'monitoring' }),
  requestLogger,
  recordMonitoringRequest,
  (req, res) => {
    try {
      const { type, category, data = {} } = req.body;

      if (!type || !category) {
        return res.status(400).json({
          success: false,
          error: 'Type and category are required',
          timestamp: new Date().toISOString()
        });
      }

      // 根据类别记录到相应的指标
      switch (category) {
        case 'auth':
          unifiedMetrics.recordAuthEvent(type, data);
          break;
        case 'tts':
          unifiedMetrics.recordTtsEvent(type, data);
          break;
        case 'storage':
          unifiedMetrics.recordStorageEvent(type, data);
          break;
        default:
          unifiedMetrics.recordApiRequest({ ...data, eventType: type });
      }

      res.json({
        success: true,
        message: 'Event recorded successfully',
        event: { type, category, data },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('记录事件失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to record event',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 重置指标
 * POST /api/monitoring/reset
 */
router.post('/reset',
  unifiedAuth.createMiddleware({ service: 'monitoring' }),
  requestLogger,
  recordMonitoringRequest,
  (req, res) => {
    try {
      const { category } = req.query;

      if (category) {
        // 重置特定类别的指标（如果需要实现）
        return res.status(400).json({
          success: false,
          error: 'Category-specific reset not implemented',
          message: 'Use reset without category to reset all metrics',
          timestamp: new Date().toISOString()
        });
      } else {
        // 重置所有指标
        unifiedMetrics.reset();
        res.json({
          success: true,
          message: 'All metrics have been reset',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('重置指标失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset metrics',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 获取监控配置信息
 * GET /api/monitoring/config
 */
router.get('/config',
  unifiedAuth.createMiddleware({ service: 'monitoring' }),
  requestLogger,
  recordMonitoringRequest,
  (req, res) => {
    try {
      const report = unifiedMetrics.getFullReport();
      res.json({
        success: true,
        data: report.config,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取监控配置失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get monitoring config',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 健康检查
 * GET /api/monitoring/health
 */
router.get('/health',
  (req, res) => {
    try {
      const report = unifiedMetrics.getFullReport();
      const uptime = process.uptime();

      res.json({
        success: true,
        data: {
          status: 'healthy',
          uptime: Math.round(uptime),
          metricsAvailable: Object.keys(report.realtime).length > 0,
          lastUpdate: new Date(report.realtime.timestamp).toISOString(),
          collectorStatus: 'active'
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Health check failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

// 404处理 - 未定义的监控路由
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Monitoring endpoint not found',
    message: `The requested monitoring endpoint ${req.method} ${req.originalUrl} is not available`,
    availableEndpoints: [
      'GET /api/monitoring/realtime - 获取实时指标',
      'GET /api/monitoring/daily - 获取每日指标',
      'GET /api/monitoring/services - 获取服务指标',
      'GET /api/monitoring/summary - 获取汇总指标',
      'GET /api/monitoring/report - 获取完整报告',
      'POST /api/monitoring/events - 记录手动事件',
      'POST /api/monitoring/reset - 重置指标',
      'GET /api/monitoring/config - 获取配置信息',
      'GET /api/monitoring/health - 健康检查'
    ],
    timestamp: new Date().toISOString()
  });
});

// 错误处理中间件
router.use((error, req, res, next) => {
  console.error(`[Monitoring Route Error] ${req.method} ${req.path}:`, error);

  res.status(error.status || 500).json({
    success: false,
    error: error.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
