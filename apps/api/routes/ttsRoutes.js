const express = require('express');
const router = express.Router();

const { TtsSynthesisService } = require('../../../src/modules/tts/application/TtsSynthesisService');
const { TtsQueryService } = require('../../../src/modules/tts/application/TtsQueryService');
const { unifiedAuth } = require('../../../src/core/middleware/apiKeyMiddleware');

const requestLogger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
};

router.post(
  '/synthesize',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  async (req, res) => {
    const result = await TtsSynthesisService.synthesize(req.body || {});
    const statusCode = TtsSynthesisService.getStatusCode(result);
    res.status(statusCode).json(result);
  }
);

// Legacy endpoint compatibility: same body, same service pipeline.
router.post(
  '/',
  unifiedAuth.createMiddleware({ service: 'tts' }),
  requestLogger,
  async (req, res) => {
    const result = await TtsSynthesisService.synthesize(req.body || {});
    const statusCode = TtsSynthesisService.getStatusCode(result);
    res.status(statusCode).json(result);
  }
);

router.get('/voices', requestLogger, (req, res) => {
  const { provider, service, gender, tags, language } = req.query;
  const result = TtsQueryService.queryVoices({
    provider,
    service,
    gender,
    tags,
    language
  });
  res.json(result);
});

router.get('/voices/:id', (req, res) => {
  const voice = TtsQueryService.getVoiceDetail(req.params.id);

  if (!voice) {
    return res.status(404).json({
      success: false,
      error: `Voice not found: ${req.params.id}`
    });
  }

  res.json({
    success: true,
    data: voice
  });
});

router.get('/providers', requestLogger, (req, res) => {
  const result = TtsQueryService.getProviders();
  res.json(result);
});

router.get('/capabilities/:service', (req, res) => {
  const result = TtsQueryService.getCapabilities(req.params.service);
  const statusCode = result.success ? 200 : 404;
  res.status(statusCode).json(result);
});

router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

router.get('/stats', requestLogger, (req, res) => {
  const result = TtsQueryService.getStats();
  res.json(result);
});

router.get('/filters', (req, res) => {
  const result = TtsQueryService.getFilterOptions();
  res.json(result);
});

router.get('/catalog', requestLogger, (req, res) => {
  const result = TtsQueryService.getFrontendCatalog();
  res.json(result);
});

router.get('/frontend', requestLogger, (req, res) => {
  const result = TtsQueryService.getFrontendVoices();
  res.json(result);
});

router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'TTS endpoint not found',
    availableEndpoints: [
      'POST /api/tts/synthesize - unified TTS synthesis',
      'POST /api/tts - legacy compatibility',
      'GET /api/tts/voices - voice list',
      'GET /api/tts/voices/:id - voice detail',
      'GET /api/tts/providers - provider list',
      'GET /api/tts/capabilities/:service - service capabilities',
      'GET /api/tts/health - health check',
      'GET /api/tts/stats - statistics',
      'GET /api/tts/filters - filter options'
    ]
  });
});

module.exports = router;
