const express = require('express');
const cors = require('cors');
const { unifiedAuth } = require('../../src/core/middleware/apiKeyMiddleware');
const { presets } = require('../../src/shared/middleware/apiStatsMiddleware');
const config = require('../../src/shared/config/config');
const credentials = require('../../src/modules/credentials');
require('dotenv').config();

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

// TTS routes
app.use('/api/tts', require('./routes/ttsRoutes'));
// Voice models (音色管理)
app.use('/api/voices', require('../../src/modules/tts/routes/voiceManageRoutes'));
// Credentials (凭证管理)
app.use('/api/credentials', require('../../src/modules/credentials/routes/credentialsRoutes'));
// Audio storage
app.use('/api/audio', require('./routes/audioRoutes'));
// Monitoring
app.use('/api/monitoring', require('./routes/monitoringRoutes'));

// File storage (snpan)
app.use(
  '/api/snpan',
  unifiedAuth.createMiddleware({
    required: true,
    permissions: ['storage.access'],
    rateLimitTier: 'default',
    metadata: { service: 'snpan' }
  }),
  require('../../src/modules/snpan/routes/snpanRoutes')
);

// SMS routes (paused)
// app.use('/api/sms', unifiedAuth.createMiddleware({
//   required: true,
//   permissions: ['sms.access'],
//   rateLimitTier: 'default',
//   metadata: { service: 'sms' }
// }), require('../../src/modules/sms[Paused]/routes/smsRoutes'));

// Admin routes
app.use(
  '/api/admin',
  unifiedAuth.createMiddleware({
    required: true,
    permissions: ['admin.access'],
    rateLimitTier: 'admin',
    metadata: { service: 'admin' }
  }),
  require('../../src/modules/admin/routes/adminRoutes')
);

// Auth monitoring
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

// API key management
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
      const newKey = unifiedAuth.generateKey({
        services,
        permissions,
        description,
        expiresIn
      });

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


// Critical env validation in production
if (process.env.NODE_ENV === 'production') {
  const missing = ['SECRET_KEY'].filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// 404 handler
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

// Initialize services
async function initializeServices() {
  try {
    // 初始化 VoiceRegistry（必须先调用 initialize）
    const { voiceRegistry } = require('../../src/modules/tts/core/VoiceRegistry');
    await voiceRegistry.initialize();

    const stats = voiceRegistry.getStats();
    console.log(`✅ VoiceRegistry initialized: ${stats.totalVoices} voices, ${stats.providers} providers`);
  } catch (error) {
    console.error('❌ Service initialization failed:', error.message);
  }
}

// Start server
initializeServices().then(() => {
  app.listen(PORT, () => {
    console.log(`TTS microservice running on port ${PORT}`);
  console.log(`API base: http://localhost:${PORT}/api`);
  console.log(`Health: http://localhost:${PORT}/health`);

  if (process.env.API_KEYS) {
    const keyCount = process.env.API_KEYS.split(',').length;
    console.log(`API keys configured: ${keyCount}`);
  } else {
    console.log('Warning: API_KEYS not configured (set in .env)');
  }

  console.log('Auth system: unified API keys, monitoring/auditing, rate limiting, service-level permissions');
    console.log('Tip: test auth system with `node tests/test-new-auth.js`');
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
