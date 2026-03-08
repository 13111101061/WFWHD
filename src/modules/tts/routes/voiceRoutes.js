const express = require('express');
const { voiceManager } = require('../core/VoiceManager');
const { unifiedAuth } = require('../../../core/middleware/apiKeyMiddleware');

const router = express.Router();

/**
 * 声音模型查询路由 (v2.0)
 * 使用 VoiceManager 统一管理音色配置
 */

// 中间件：请求日志记录
const requestLogger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
};

// 中间件：确保 VoiceManager 就绪
const ensureVoiceManagerReady = async (req, res, next) => {
  try {
    await voiceManager.waitForReady(5000);
    next();
  } catch (error) {
    res.status(503).json({
      success: false,
      error: 'VoiceManager not ready',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * 获取所有声音模型
 * GET /api/tts/voices/models
 */
router.get('/models',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  ensureVoiceManagerReady,
  async (req, res) => {
    try {
      const models = voiceManager.getAll();

      res.json({
        success: true,
        data: models,
        count: models.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取所有模型失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get models',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 获取分类数据（前端专用）
 * GET /api/tts/voices/categories
 * 支持内存缓存 + mtime驱动刷新 + ETag
 */

// 内存缓存（模块级别）
let categoriesCache = {
  data: null,
  etag: null,
  mtime: null,
  lastCheck: 0
};

router.get('/categories',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  async (req, res) => {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const crypto = require('crypto');
      const categoriesPath = path.join(__dirname, '..', 'config', 'voiceCategories.json');
      const now = Date.now();

      let didReadFile = false;
      let servedStaleCache = false;

      if (!categoriesCache.data) {
        try {
          const stats = await fs.stat(categoriesPath);
          const categoriesData = await fs.readFile(categoriesPath, 'utf8');
          const categories = JSON.parse(categoriesData);

          categoriesCache.data = categories;
          categoriesCache.mtime = stats.mtime.getTime();
          categoriesCache.etag = crypto
            .createHash('md5')
            .update(categoriesData)
            .digest('hex');
          categoriesCache.lastCheck = now;
          didReadFile = true;

          console.log('✅ 分类数据已加载到内存缓存');
        } catch (readError) {
          throw readError;
        }
      } else if (now - categoriesCache.lastCheck > 5000) {
        categoriesCache.lastCheck = now;

        const stats = await fs.stat(categoriesPath);
        const currentMtime = stats.mtime.getTime();

        if (currentMtime !== categoriesCache.mtime) {
          try {
            const categoriesData = await fs.readFile(categoriesPath, 'utf8');
            const categories = JSON.parse(categoriesData);

            categoriesCache.data = categories;
            categoriesCache.mtime = currentMtime;
            categoriesCache.etag = crypto
              .createHash('md5')
              .update(categoriesData)
              .digest('hex');
            didReadFile = true;

            console.log('✅ 分类数据已更新到内存缓存');
          } catch (readError) {
            servedStaleCache = true;
            console.error('⚠️  读取分类文件失败，使用缓存数据:', readError.message);
          }
        }
      }

      res.setHeader('ETag', categoriesCache.etag);
      res.setHeader('Last-Modified', new Date(categoriesCache.mtime).toUTCString());
      res.setHeader('Cache-Control', 'public, max-age=300');
      if (servedStaleCache) {
        res.setHeader('X-Cache', 'STALE');
      } else {
        res.setHeader('X-Cache', didReadFile ? 'MISS' : 'HIT');
      }

      if (req.headers['if-none-match'] === categoriesCache.etag) {
        return res.status(304).end();
      }

      res.json({
        success: true,
        data: categoriesCache.data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ 获取分类数据失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get categories',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 根据提供商获取模型
 * GET /api/tts/voices/providers/:provider
 */
router.get('/providers/:provider',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  ensureVoiceManagerReady,
  async (req, res) => {
    try {
      const { provider } = req.params;
      const { service } = req.query;

      const models = service
        ? voiceManager.getByProviderAndService(provider, service)
        : voiceManager.getByProvider(provider);

      res.json({
        success: true,
        data: {
          provider,
          models,
          count: models.length
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`获取提供商 ${req.params.provider} 模型失败:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to get provider models',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 根据标签获取模型
 * GET /api/tts/voices/tags/:tag
 */
router.get('/tags/:tag',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  ensureVoiceManagerReady,
  async (req, res) => {
    try {
      const { tag } = req.params;
      const models = voiceManager.getByTags([tag]);

      res.json({
        success: true,
        data: {
          tag,
          models,
          count: models.length
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`获取标签 ${req.params.tag} 模型失败:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to get tag models',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 搜索模型
 * GET /api/tts/voices/search?q=keyword
 */
router.get('/search',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  ensureVoiceManagerReady,
  async (req, res) => {
    try {
      const { q, provider, limit = 50 } = req.query;

      if (!q) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required',
          message: 'Please provide a search query using the "q" parameter',
          timestamp: new Date().toISOString()
        });
      }

      const models = voiceManager.search(q, {
        provider,
        limit: parseInt(limit)
      });

      res.json({
        success: true,
        data: {
          query: q,
          models,
          count: models.length
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('搜索模型失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search models',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 获取所有提供商列表
 * GET /api/tts/voices/providers
 */
router.get('/providers',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  ensureVoiceManagerReady,
  async (req, res) => {
    try {
      const providerStats = voiceManager.getProviderStats();
      const providers = Object.keys(providerStats);

      res.json({
        success: true,
        data: providers,
        stats: providerStats,
        count: providers.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取提供商列表失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get providers',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 获取所有标签列表
 * GET /api/tts/voices/tags
 */
router.get('/tags',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  ensureVoiceManagerReady,
  async (req, res) => {
    try {
      const tagStats = voiceManager.getTagStats();
      const tags = Object.keys(tagStats);

      res.json({
        success: true,
        data: tags,
        stats: tagStats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取标签列表失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get tags',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 获取单个模型详情
 * GET /api/tts/voices/models/:id
 */
router.get('/models/:id',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  ensureVoiceManagerReady,
  async (req, res) => {
    try {
      const { id } = req.params;
      const model = voiceManager.getById(id);

      if (!model) {
        return res.status(404).json({
          success: false,
          error: 'Model not found',
          message: `Model with ID '${id}' was not found`,
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        data: model,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`获取模型 ${req.params.id} 详情失败:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to get model details',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 获取注册中心统计信息
 * GET /api/tts/voices/stats
 */
router.get('/stats',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  ensureVoiceManagerReady,
  async (req, res) => {
    try {
      const stats = voiceManager.getStats();
      const health = voiceManager.getHealth();

      res.json({
        success: true,
        data: { ...stats, health },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取统计信息失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get stats',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 重新加载配置
 * POST /api/tts/voices/reload
 */
router.post('/reload',
  unifiedAuth.createMiddleware({
    service: 'tts',
    permissions: ['admin.access']
  }),
  requestLogger,
  async (req, res) => {
    try {
      const success = await voiceManager.reload();

      if (success) {
        res.json({
          success: true,
          message: 'Voice configuration reloaded successfully',
          stats: voiceManager.getStats(),
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Reload failed',
          message: voiceManager.lastError?.message || 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('重新加载配置失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reload',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 获取 VoiceManager 健康状态
 * GET /api/tts/voices/health
 */
router.get('/health',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  async (req, res) => {
    try {
      const health = voiceManager.getHealth();
      const stats = voiceManager.getStats();

      res.json({
        success: true,
        data: {
          health,
          stats
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取健康状态失败:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get health',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

// 404处理 - 未定义的语音路由
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Voice endpoint not found',
    message: `The requested voice endpoint ${req.method} ${req.originalUrl} is not available`,
    availableEndpoints: [
      'GET /api/tts/voices/models - 获取所有模型',
      'GET /api/tts/voices/providers/:provider - 根据提供商获取模型',
      'GET /api/tts/voices/tags/:tag - 根据标签获取模型',
      'GET /api/tts/voices/search?q=keyword - 搜索模型',
      'GET /api/tts/voices/providers - 获取所有提供商',
      'GET /api/tts/voices/tags - 获取所有标签',
      'GET /api/tts/voices/models/:id - 获取模型详情',
      'GET /api/tts/voices/stats - 获取统计信息',
      'GET /api/tts/voices/health - 获取健康状态',
      'POST /api/tts/voices/reload - 重新加载配置'
    ],
    timestamp: new Date().toISOString()
  });
});

// 错误处理中间件
router.use((error, req, res, next) => {
  console.error(`[Voice Route Error] ${req.method} ${req.path}:`, error);

  res.status(error.status || 500).json({
    success: false,
    error: error.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;