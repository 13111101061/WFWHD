require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { unifiedAuth } = require('../../src/core/middleware/apiKeyMiddleware');
const { presets } = require('../../src/shared/middleware/apiStatsMiddleware');
const config = require('../../src/shared/config/config');
const credentials = require('../../src/modules/credentials');

// 验证配置（在应用启动前检查关键配置）
try {
  config.validateConfig();
} catch (error) {
  console.error('Configuration validation failed:', error.message);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1); // 生产环境配置错误则退出
  }
}

// 显示凭证配置状态
console.log('[Startup] 凭证配置状态:');
credentials.listProviders().forEach(p => {
  console.log(`  ${p.name}: ${p.configured ? '✅' : '❌'}`);
});

const app = express();
const PORT = process.env.PORT || 3000;

// Expose unified auth for downstream use
app.locals.unifiedAuth = unifiedAuth;

// Middleware baseline
app.disable('x-powered-by');
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim());

// 开发环境使用宽松的 CORS 配置
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(presets.full());

// Serve SDK static files
app.use('/sdk', express.static(path.join(__dirname, '../../sdk')));


// Health check (no auth)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: process.env.SERVICE_ID || 'tts-microservice',
    uptime: process.uptime()
  });
});

// Public info (no auth)
app.get('/api/public/info', (req, res) => {
  res.json({
    service: 'TTS Microservice',
    version: '1.0.1',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/api/tts - unified TTS API',
      '/api/audio - audio storage API',
      '/api/monitoring - monitoring API',
      '/api/admin - admin API'
    ]
  });
});

// TTS routes — 全部路由在 ServiceContainer 初始化后挂载，确保单实例 VoiceRegistry
const serviceContainer = require('../../src/config/ServiceContainer');

// Route modules (lazy-require, not mounted yet)
const ttsRoutes = require('./routes/ttsRoutes');
const { createVoiceManageRoutes } = require('../../src/modules/tts/routes/voiceManageRoutes');
const credentialsRoutes = require('../../src/modules/credentials/routes/credentialsRoutes');
const audioRoutes = require('./routes/audioRoutes');
const monitoringRoutes = require('./routes/monitoringRoutes');
const snpanRoutes = require('../../src/modules/snpan/routes/snpanRoutes');
const adminRoutes = require('../../src/modules/admin/routes/adminRoutes');

// Mount all routes in the correct order after ServiceContainer is ready
function mountAllRoutes(voiceRegistry) {
  app.use('/api/tts', ttsRoutes);
  app.use('/api/voices', createVoiceManageRoutes(voiceRegistry));
  app.use('/api/credentials', credentialsRoutes);
  app.use('/api/audio', audioRoutes);
  app.use('/api/monitoring', monitoringRoutes);

  app.use(
    '/api/snpan',
    unifiedAuth.createMiddleware({
      required: true,
      permissions: ['storage.access'],
      rateLimitTier: 'default',
      metadata: { service: 'snpan' }
    }),
    snpanRoutes
  );

  // SMS routes (paused)
  // app.use('/api/sms', unifiedAuth.createMiddleware({
  //   required: true,
  //   permissions: ['sms.access'],
  //   rateLimitTier: 'default',
  //   metadata: { service: 'sms' }
  // }), require('../../src/modules/sms[Paused]/routes/smsRoutes'));

  app.use(
    '/api/admin',
    unifiedAuth.createMiddleware({
      required: true,
      permissions: ['admin.access'],
      rateLimitTier: 'admin',
      metadata: { service: 'admin' }
    }),
    adminRoutes
  );
}

// ==== Auth / key management (no ServiceContainer dependency) ====

app.get(
  '/api/auth/stats',
  unifiedAuth.createMiddleware({
    required: true,
    permissions: ['monitoring.access'],
    rateLimitTier: 'admin',
    metadata: { service: 'monitoring' }
  }),
  (req, res) => {
    res.json({
      success: true,
      data: {
        auth: unifiedAuth.getStats(),
        metrics: unifiedAuth.getMetrics(),
        recentEvents: unifiedAuth.getRecentEvents(20)
      },
      timestamp: new Date().toISOString()
    });
  }
);

app.post(
  '/api/auth/keys',
  unifiedAuth.createMiddleware({
    required: true,
    permissions: ['admin.access'],
    rateLimitTier: 'admin'
  }),
  (req, res) => {
    try {
      const { services, permissions, description, expiresIn } = req.body;
      const newKey = unifiedAuth.generateKey({ services, permissions, description, expiresIn });
      res.json({
        success: true,
        data: newKey,
        message: 'API key generated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to generate API key',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

app.get(
  '/api/auth/keys',
  unifiedAuth.createMiddleware({
    required: true,
    permissions: ['admin.access'],
    rateLimitTier: 'admin'
  }),
  (req, res) => {
    res.json({
      success: true,
      data: unifiedAuth.getAllKeys(),
      timestamp: new Date().toISOString()
    });
  }
);

// ==== Single startup entry: init → mount → 404/error → listen ====

// Critical env validation in production
if (process.env.NODE_ENV === 'production') {
  const missing = ['SECRET_KEY'].filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

async function start() {
  await serviceContainer.initialize();
  console.log('✅ ServiceContainer initialized');

  const voiceRegistry = serviceContainer.get('voiceRegistry');
  mountAllRoutes(voiceRegistry);

  // 404 handler — must be after ALL business routes
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'API endpoint not found',
      message: `Requested path ${req.originalUrl} does not exist`
    });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  });

  const stats = voiceRegistry.getStats();
  console.log(`✅ VoiceRegistry: ${stats.total} voices across ${Object.keys(stats.providers || {}).length} providers`);

  app.listen(PORT, () => {
    console.log(`TTS microservice running on port ${PORT}`);
    console.log(`API base: http://localhost:${PORT}/api`);
    console.log(`Health: http://localhost:${PORT}/health`);

    if (process.env.API_KEYS) {
      console.log(`API keys configured: ${process.env.API_KEYS.split(',').length}`);
    } else {
      console.log('Warning: API_KEYS not configured (set in .env)');
    }

    console.log('Auth system: unified API keys, monitoring/auditing, rate limiting, service-level permissions');
    console.log('Tip: test auth system with `node tests/test-new-auth.js`');
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
