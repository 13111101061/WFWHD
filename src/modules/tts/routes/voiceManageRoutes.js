const express = require('express');
const { VoiceWriteService } = require('../application/VoiceWriteService');
const { unifiedAuth } = require('../../../core/middleware/apiKeyMiddleware');

function createVoiceManageRoutes(voiceRegistry) {
  const router = express.Router();

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
      const { provider, service, tags, gender } = req.query;

      let voices = voiceRegistry.getAll();

      if (provider) {
        voices = voiceRegistry.getByProvider(provider);
      }

      if (provider && service) {
        voices = voiceRegistry.getByProviderAndService(provider, service);
      }

      if (gender) {
        voices = voices.filter(v => {
          const vGender = v.profile?.gender || v.gender;
          return vGender === gender;
        });
      }

      if (tags) {
        const tagList = tags.split(',').map(t => t.trim());
        voices = voices.filter(v => {
          const vTags = v.profile?.tags || v.tags;
          return vTags && tagList.some(t => vTags.includes(t));
        });
      }

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
      data: voiceRegistry.getStats()
    });
  });

  router.get('/providers/status', (req, res) => {
    res.json({
      success: true,
      data: {
        enabled: voiceRegistry.getEnabledProviders(),
        disabled: voiceRegistry.getDisabledProviders(),
        all: voiceRegistry.getStats().providers
      }
    });
  });

  router.get('/providers/:provider/enabled', (req, res) => {
    const enabled = voiceRegistry.isProviderEnabled(req.params.provider);
    res.json({
      success: true,
      data: {
        provider: req.params.provider,
        enabled
      }
    });
  });

  router.get('/:id', (req, res) => {
    const voice = voiceRegistry.get(req.params.id);

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

  router.post('/', (req, res) => {
    const result = getVoiceWriteService().create(req.body);

    if (!result.success) {
      const statusCode = result.error === 'Voice already exists' ? 409 : 400;
      return res.status(statusCode).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }

    res.status(201).json({
      success: true,
      data: result.data,
      message: `Voice added: ${result.data.identity.id}`
    });
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

  router.put('/:id', (req, res) => {
    const result = getVoiceWriteService().update(req.params.id, req.body);

    if (!result.success) {
      const statusCode = result.error === 'Voice not found' ? 404 : 400;
      return res.status(statusCode).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }

    res.json({
      success: true,
      data: result.data,
      message: `Voice updated: ${req.params.id}`
    });
  });

  router.delete('/:id', (req, res) => {
    const result = getVoiceWriteService().remove(req.params.id);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: `Voice removed: ${req.params.id}`
    });
  });

  router.post('/save', async (req, res) => {
    try {
      await getVoiceWriteService().save();

      res.json({
        success: true,
        message: `Saved ${voiceRegistry.getStats().total} voices to file`
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

      const stats = voiceRegistry.getStats();

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
