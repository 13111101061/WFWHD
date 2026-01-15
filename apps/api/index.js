const express = require('express');
const cors = require('cors');
const path = require('path');
const { unifiedAuth } = require('../../src/core/middleware/apiKeyMiddleware');
const { presets } = require('../../src/shared/middleware/apiStatsMiddleware');
const config = require('../../src/shared/config/config');
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

const app = express();
const PORT = process.env.PORT || 3000;

// Expose unified auth for downstream use
app.locals.unifiedAuth = unifiedAuth;

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
// Voice models
app.use('/api/voice-models', require('../../src/modules/tts/routes/voiceRoutes'));
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

// Start server
app.listen(PORT, () => {
  console.log(`TTS microservice node running on port ${PORT}`);
  console.log(`Service URL: http://localhost:${PORT}`);
  console.log(`API base: http://localhost:${PORT}/api`);
  console.log(`Admin UI: http://localhost:${PORT}/admin`);
  console.log(`Demo page: http://localhost:${PORT}/demo`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Public info: http://localhost:${PORT}/api/public/info`);

  if (process.env.API_KEYS) {
    const keyCount = process.env.API_KEYS.split(',').length;
    console.log(`API keys configured: ${keyCount}`);
  } else {
    console.log('Warning: API_KEYS not configured (set in .env)');
  }

  console.log('Auth system: unified API keys, monitoring/auditing, rate limiting, service-level permissions');
  console.log('Tip: test auth system with `node tests/test-new-auth.js`');
});

module.exports = app;
