const express = require('express');
const { VoiceWriteService } = require('../application/VoiceWriteService');
const { VoiceAdminQueryService } = require('../application/VoiceAdminQueryService');
const { unifiedAuth } = require('../../../core/middleware/apiKeyMiddleware');

function createVoiceManageRoutes(voiceRegistry) {
  const router = express.Router();

  const adminQuery = new VoiceAdminQueryService({ voiceRegistry });

  let _voiceWriteService;
  function getVoiceWriteService() {
    if (!_voiceWriteService) {
      _voiceWriteService = new VoiceWriteService({ registry: voiceRegistry });
    }
    return _voiceWriteService;
  }

  router.use(unifiedAuth.createMiddleware({
    required: true,
    permissions: ['admin.access'],
    rateLimitTier: 'admin',
    metadata: { service: 'voice-management' }
  }));

  router.get('/', async (req, res) => {
    try {
      const voices = adminQuery.list(req.query);

      res.json({
        success: true,
        data: voices,
        count: voices.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.get('/stats/overview', (req, res) => {
    res.json({
      success: true,
      data: adminQuery.getStats()
    });
  });

  router.get('/providers/status', (req, res) => {
    res.json({
      success: true,
      data: adminQuery.getProvidersStatus()
    });
  });

  router.get('/providers/:provider/enabled', (req, res) => {
    const enabled = adminQuery.isProviderEnabled(req.params.provider);
    res.json({
      success: true,
      data: {
        provider: req.params.provider,
        enabled
      }
    });
  });

  router.get('/:id', (req, res) => {
    const voice = adminQuery.getById(req.params.id);

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

  router.post('/', async (req, res) => {
    const result = getVoiceWriteService().create(req.body);

    if (!result.success) {
      const statusCode = result.error === 'Voice already exists' ? 409 : 400;
      return res.status(statusCode).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }

    try {
      await getVoiceWriteService().save();
      res.status(201).json({
        success: true,
        data: result.data,
        persisted: true,
        message: `Voice added and persisted: ${result.data.identity.id}`
      });
    } catch (e) {
      res.status(201).json({
        success: true,
        data: result.data,
        persisted: false,
        message: `Voice added in memory: ${result.data.identity.id}. Save failed: ${e.message}`
      });
    }
  });

  router.post('/batch', (req, res) => {
    const { voices } = req.body;

    if (!Array.isArray(voices)) {
      return res.status(400).json({
        success: false,
        error: 'voices must be an array'
      });
    }

    const result = getVoiceWriteService().createBatch(voices);

    res.status(201).json({
      success: result.success,
      data: result.data,
      message: `Added ${result.data.added.length} voices, ${result.data.errors.length} failed`
    });
  });

  router.put('/:id', async (req, res) => {
    const result = getVoiceWriteService().update(req.params.id, req.body);

    if (!result.success) {
      const statusCode = result.error === 'Voice not found' ? 404 : 400;
      return res.status(statusCode).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }

    try {
      await getVoiceWriteService().save();
      res.json({
        success: true,
        data: result.data,
        persisted: true,
        message: `Voice updated and persisted: ${req.params.id}`
      });
    } catch (e) {
      res.json({
        success: true,
        data: result.data,
        persisted: false,
        message: `Voice updated in memory: ${req.params.id}. Save failed: ${e.message}`
      });
    }
  });

  router.delete('/:id', async (req, res) => {
    const result = getVoiceWriteService().remove(req.params.id);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    try {
      await getVoiceWriteService().save();
      res.json({
        success: true,
        persisted: true,
        message: `Voice removed and persisted: ${req.params.id}`
      });
    } catch (e) {
      res.json({
        success: true,
        persisted: false,
        message: `Voice removed from memory: ${req.params.id}. Save failed: ${e.message}`
      });
    }
  });

  router.post('/save', async (req, res) => {
    try {
      await getVoiceWriteService().save();

      res.json({
        success: true,
        message: `Saved ${adminQuery.getTotal()} voices to file`
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.post('/reload', async (req, res) => {
    try {
      await getVoiceWriteService().reload();

      const stats = adminQuery.getStats();

      res.json({
        success: true,
        message: `Reloaded ${stats.total} voices`,
        stats
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = { createVoiceManageRoutes };
