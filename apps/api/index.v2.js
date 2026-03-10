/**
 * TTS Microservice - Main Entry Point (v2.1)
 *
 * Architecture:
 * - Auth Module: 独立的通用认证模块 (src/modules/auth)
 * - TTS Module: TTS业务模块 (src/modules/tts)
 * - Hexagonal Architecture for both
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// 独立认证模块 - 可被任何服务复用
const authModule = require('../../src/modules/auth');

// TTS业务模块
const { ttsFactory } = require('../../src/modules/tts/core/TtsFactory');
const serviceContainer = require('../../src/config/ServiceContainer');

// 其他中间件
const { presets } = require('../../src/shared/middleware/apiStatsMiddleware');
const config = require('../../src/shared/config/config');

require('dotenv').config();

// 验证配置
try {
  config.validateConfig();
} catch (error) {
  console.error('Configuration validation failed:', error.message);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware baseline
app.disable('x-powered-by');
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(presets.full());

// Static assets
const PUBLIC_DIR = path.join(__dirname, 'public');
const AUDIO_DIR =
  process.env.AUDIO_DIR || path.join(__dirname, '..', '..', 'src', 'storage', 'uploads', 'audio');
app.use(express.static(PUBLIC_DIR));
app.use('/audio', express.static(AUDIO_DIR));

// Health check (no auth)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: process.env.SERVICE_ID || 'tts-microservice',
    uptime: process.uptime(),
    version: '2.1.0'
  });
});

// Public info (no auth)
app.get('/api/public/info', (req, res) => {
  res.json({
    service: 'TTS Microservice',
    version: '2.1.0',
    architecture: 'hexagonal',
    modules: ['auth', 'tts'],
    timestamp: new Date().toISOString(),
    endpoints: [
      '/api/tts - TTS API',
      '/api/audio - Audio storage',
      '/api/monitoring - Monitoring',
      '/api/admin - Admin'
    ]
  });
});

// TTS routes (使用独立认证模块)
app.use('/api/tts', require('./routes/ttsRoutes'));
app.use('/api/voice-models', require('../../src/modules/tts/routes/voiceRoutes'));
app.use('/api/audio', require('./routes/audioRoutes'));
app.use('/api/monitoring', require('./routes/monitoringRoutes'));

// Snpan - 使用独立认证模块
app.use(
  '/api/snpan',
  authModule.createMiddleware({
    required: true,
    permissions: ['storage.access'],
    rateLimitTier: 'default',
    metadata: { service: 'snpan' }
  }),
  require('../../src/modules/snpan/routes/snpanRoutes')
);

// Admin routes
app.use(
  '/api/admin',
  authModule.createMiddleware({
    required: true,
    permissions: ['admin.access'],
    rateLimitTier: 'admin',
    metadata: { service: 'admin' }
  }),
  require('../../src/modules/admin/routes/adminRoutes')
);

// Auth monitoring endpoint
app.get(
  '/api/auth/stats',
  authModule.createMiddleware({
    required: true,
    permissions: ['monitoring.access'],
    rateLimitTier: 'admin',
    metadata: { service: 'monitoring' }
  }),
  (req, res) => {
    res.json({
      success: true,
      data: {
        auth: authModule.getStats(),
        metrics: authModule.getMetrics(),
        recentEvents: authModule.getRecentEvents(20)
      },
      timestamp: new Date().toISOString()
    });
  }
);

// API key management
app.post(
  '/api/auth/keys',
  authModule.createMiddleware({
    required: true,
    permissions: ['admin.access'],
    rateLimitTier: 'admin'
  }),
  (req, res) => {
    try {
      const { services, permissions, description, expiresIn } = req.body;
      const newKey = authModule.generateKey({
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
  authModule.createMiddleware({
    required: true,
    permissions: ['admin.access'],
    rateLimitTier: 'admin'
  }),
  (req, res) => {
    res.json({
      success: true,
      data: authModule.getAllKeys(),
      timestamp: new Date().toISOString()
    });
  }
);

// Static pages
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/demo', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'demo.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

// Critical env validation
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

// Initialize all services
async function initializeServices() {
  console.log('\n========================================');
  console.log('Initializing services...');
  console.log('========================================\n');

  // 1. Initialize Auth Module (独立模块，可被任何服务复用)
  authModule.initialize({
    rateLimit: {
      requests: 100,
      window: 60000
    },
    maxEvents: 5000,
    enableMetrics: true
  });
  console.log('✅ Auth Module initialized (standalone, reusable)');

  // 2. Initialize TTS Factory
  try {
    await ttsFactory.initialize();
    console.log('✅ TTS Factory initialized');
  } catch (error) {
    console.error('❌ TTS Factory initialization failed:', error.message);
  }

  // 3. Initialize Service Container (for hexagonal TTS)
  try {
    await serviceContainer.initialize();
    console.log('✅ Service Container initialized');
  } catch (error) {
    console.error('❌ Service Container initialization failed:', error.message);
  }

  console.log('\n========================================\n');
}

// Start server
initializeServices().then(() => {
  app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`TTS Microservice v2.1`);
    console.log(`========================================`);
    console.log(`Port: ${PORT}`);
    console.log(`Service URL: http://localhost:${PORT}`);
    console.log(`API base: http://localhost:${PORT}/api`);
    console.log(`Admin UI: http://localhost:${PORT}/admin`);
    console.log(`Demo page: http://localhost:${PORT}/demo`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`========================================`);

    if (process.env.API_KEYS) {
      const keyCount = process.env.API_KEYS.split(',').length;
      console.log(`API keys configured: ${keyCount}`);
    } else {
      console.log('⚠️  Warning: API_KEYS not configured');
    }

    console.log(`\n📦 Modules:`);
    console.log(`   - Auth: src/modules/auth (standalone, reusable)`);
    console.log(`   - TTS:  src/modules/tts (business module)`);
    console.log(`========================================\n`);
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;