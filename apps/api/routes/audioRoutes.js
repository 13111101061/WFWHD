const express = require('express');
const { audioStorageManager } = require('../../../src/shared/utils/audioStorage');
const { unifiedAuth } = require('../../../src/core/middleware/apiKeyMiddleware');

/**
 * 音频存储管理路由
 * 提供音频文件管理、统计、清理等功能
 */
const router = express.Router();

// 中间件：请求日志记录
const requestLogger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
};

/**
 * 获取音频存储统计信息
 * GET /api/audio/stats
 */
router.get('/stats',
  unifiedAuth.createMiddleware({ service: 'audio' }),
  requestLogger,
  async (req, res) => {
    try {
      const stats = await audioStorageManager.getStorageStats();
      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取音频统计失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get audio storage statistics',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 清理过期音频文件
 * POST /api/audio/cleanup
 * Body: { maxAge?: number } - 最大保留时间（毫秒）
 */
router.post('/cleanup',
  unifiedAuth.createMiddleware({ service: 'audio' }),
  requestLogger,
  async (req, res) => {
    try {
      const { maxAge } = req.body;
      const result = await audioStorageManager.cleanupExpiredFiles(maxAge);
      res.json({
        success: true,
        data: result,
        message: `Cleaned up ${result.cleaned} expired files`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('音频清理失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cleanup audio files',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 检查音频文件是否存在
 * GET /api/audio/exists/:filename
 */
router.get('/exists/:filename',
  unifiedAuth.createMiddleware({ service: 'audio' }),
  requestLogger,
  async (req, res) => {
    try {
      const { filename } = req.params;
      const { subDir = '' } = req.query;

      const exists = await audioStorageManager.fileExists(filename, subDir);
      res.json({
        success: true,
        data: {
          filename,
          subDir,
          exists
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('检查文件存在性失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check file existence',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 获取音频文件信息
 * GET /api/audio/info/:filename
 */
router.get('/info/:filename',
  unifiedAuth.createMiddleware({ service: 'audio' }),
  requestLogger,
  async (req, res) => {
    try {
      const { filename } = req.params;
      const { subDir = '' } = req.query;

      const fileInfo = await audioStorageManager.getFileInfo(filename, subDir);

      if (!fileInfo) {
        return res.status(404).json({
          success: false,
          error: 'File not found',
          message: `Audio file ${filename} not found`,
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        data: fileInfo,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取文件信息失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get file information',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 删除音频文件
 * DELETE /api/audio/:filename
 */
router.delete('/:filename',
  unifiedAuth.createMiddleware({ service: 'audio' }),
  requestLogger,
  async (req, res) => {
    try {
      const { filename } = req.params;
      const { subDir = '' } = req.query;

      const deleted = await audioStorageManager.deleteAudioFile(filename, subDir);

      if (deleted) {
        res.json({
          success: true,
          message: `Audio file ${filename} deleted successfully`,
          timestamp: new Date().toISOString()
        });
      } else {
        res.json({
          success: true,
          message: `Audio file ${filename} was not found or already deleted`,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('删除音频文件失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete audio file',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 生成安全的文件名
 * POST /api/audio/generate-filename
 * Body: { text?: string, extension?: string, options?: object }
 */
router.post('/generate-filename',
  unifiedAuth.createMiddleware({ service: 'audio' }),
  requestLogger,
  (req, res) => {
    try {
      const { text = 'audio', extension = 'mp3', options = {} } = req.body;

      const filename = audioStorageManager.generateSafeFilename(text, extension, options);

      res.json({
        success: true,
        data: {
          filename,
          text,
          extension,
          options
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('生成文件名失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate filename',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 音频存储配置信息
 * GET /api/audio/config
 */
router.get('/config',
  unifiedAuth.createMiddleware({ service: 'audio' }),
  requestLogger,
  (req, res) => {
    try {
      const config = {
        baseDir: audioStorageManager.baseDir,
        urlPrefix: audioStorageManager.options.urlPrefix,
        supportedFormats: audioStorageManager.options.supportedFormats,
        maxFilenameLength: audioStorageManager.options.maxFilenameLength,
        enableCleanup: audioStorageManager.options.enableCleanup,
        retentionPeriod: audioStorageManager.options.retentionPeriod
      };

      res.json({
        success: true,
        data: config,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取配置信息失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get audio storage configuration',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

// 404处理 - 未定义的音频路由
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Audio endpoint not found',
    message: `The requested audio endpoint ${req.method} ${req.originalUrl} is not available`,
    availableEndpoints: [
      'GET /api/audio/stats - 获取音频存储统计',
      'POST /api/audio/cleanup - 清理过期文件',
      'GET /api/audio/exists/:filename - 检查文件是否存在',
      'GET /api/audio/info/:filename - 获取文件信息',
      'DELETE /api/audio/:filename - 删除音频文件',
      'POST /api/audio/generate-filename - 生成安全文件名',
      'GET /api/audio/config - 获取配置信息'
    ],
    timestamp: new Date().toISOString()
  });
});

// 错误处理中间件
router.use((error, req, res, next) => {
  console.error(`[Audio Route Error] ${req.method} ${req.path}:`, error);

  res.status(error.status || 500).json({
    success: false,
    error: error.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
