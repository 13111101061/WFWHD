const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const { VoiceWriteService } = require('../application/VoiceWriteService');
const { VoiceAdminQueryService } = require('../application/VoiceAdminQueryService');
const { unifiedAuth } = require('../../../core/middleware/apiKeyMiddleware');

const upload = multer({
  dest: path.join(os.tmpdir(), 'voice-uploads'),
  limits: { fileSize: 20 * 1024 * 1024 }
});

function mapErrorCodeToStatus(code) {
  switch (code) {
    case 'CONFIG_ERROR': return 500;
    case 'VALIDATION_ERROR': return 400;
    case 'RATE_LIMIT_EXCEEDED': return 429;
    case 'TIMEOUT_ERROR': return 504;
    case 'PROVIDER_ERROR': return 502;
    case 'API_ERROR': return 502;
    default: return 400;
  }
}

function createVoiceManageRoutes(voiceCatalog, voiceWriteService, voiceOnboardingService) {
  const router = express.Router();

  const adminQuery = new VoiceAdminQueryService({ voiceCatalog });

  let _voiceWriteService;
  function getVoiceWriteService() {
    if (!_voiceWriteService) {
      // 回退：voiceCatalog 无法直接用作单 registry 写入口，需外部注入 VoiceWriteService
      _voiceWriteService = voiceWriteService || new VoiceWriteService({ registry: voiceCatalog.registries[1] || voiceCatalog.registries[0] });
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

  // ==================== 音色入驻（上传 + 克隆 + 注册 + 测试音频） ====================

  if (voiceOnboardingService) {
    router.post('/register',
      upload.single('audioFile'),
      async (req, res) => {
        const result = await voiceOnboardingService.registerVoice(req);

        if (!result.success) {
          const statusCode = result.error === 'Form validation failed' ? 400
            : result.error === 'Provider not found' ? 404
            : 500;
          return res.status(statusCode).json(result);
        }

        if (result.data?.asyncMode) {
          return res.status(202).json(result);
        }

        res.status(201).json(result);
      }
    );

    /**
     * 查询音色克隆进度（面向资源：前端只传系统 voice.id）
     * GET /api/voices/:id/status
     *
     * 后端自动从存储反查 provider + taskId，前端不感知 Provider 标识符。
     */
    router.get('/:id/status', async (req, res) => {
      try {
        // voice.id 是系统 ID，lookup 后反查 taskId
        const stored = voiceCatalog.get(req.params.id);
        if (!stored) {
          return res.status(404).json({ success: false, error: `Voice not found: ${req.params.id}` });
        }

        const providerKey = stored.identity?.provider;
        const taskId = req.query.taskId || stored.runtime?.voiceId;

        if (!providerKey || !taskId) {
          return res.status(400).json({ success: false, error: 'Voice has no provider or taskId' });
        }

        const status = await voiceOnboardingService.checkCloneStatus(providerKey, taskId);

        // 异步克隆完成后自动激活
        if (status.status === 'completed' && stored.profile?.status !== 'active') {
          getVoiceWriteService().update(stored.identity.id, { profile: { status: 'active' } });
          await getVoiceWriteService().save();
          status.autoActivated = true;
        }

        res.json({
          success: true,
          data: status,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // ==================== 指令生成音色 ====================

    /**
     * 生成指令预览音频（只生成，不入库）
     * POST /api/voices/instruction/preview
     */
    router.post('/instruction/preview', async (req, res) => {
      try {
        const result = await voiceOnboardingService.generateInstructionPreview(req.body);
        if (!result.success) {
          const statusCode = mapErrorCodeToStatus(result.errorCode || result.code);
          return res.status(statusCode).json(result);
        }
        res.json(result);
      } catch (error) {
        const statusCode = mapErrorCodeToStatus(error.code);
        res.status(statusCode).json({
          success: false,
          error: error.message,
          errorCode: error.code
        });
      }
    });

    /**
     * 将指令音色正式注册入库
     * POST /api/voices/instruction/register
     */
    router.post('/instruction/register', async (req, res) => {
      try {
        const result = await voiceOnboardingService.registerInstructionVoice(req.body);
        if (!result.success) {
          const statusCode = mapErrorCodeToStatus(result.errorCode || result.code);
          return res.status(statusCode).json(result);
        }
        res.status(201).json(result);
      } catch (error) {
        const statusCode = mapErrorCodeToStatus(error.code);
        res.status(statusCode).json({
          success: false,
          error: error.message,
          errorCode: error.code
        });
      }
    });

    /**
     * UGC 音色删除（默认软删除：status → deleted）
     * DELETE /api/voices/:id
     * DELETE /api/voices/:id?force=true  物理删除
     */
    router.delete('/:id/ugc', async (req, res) => {
      try {
        const stored = voiceCatalog.get(req.params.id);
        if (!stored) {
          return res.status(404).json({ success: false, error: `Voice not found: ${req.params.id}` });
        }

        // 官方库不可删
        const isOfficial = stored.meta?.dataSource !== 'api';
        if (isOfficial) {
          return res.status(403).json({ success: false, error: 'Official voices cannot be deleted' });
        }

        if (req.query.force === 'true') {
          getVoiceWriteService().remove(req.params.id);
          await getVoiceWriteService().save();
          res.json({ success: true, deleted: true, id: req.params.id });
        } else {
          getVoiceWriteService().update(req.params.id, { status: 'deleted' });
          await getVoiceWriteService().save();
          res.json({ success: true, deleted: false, id: req.params.id, status: 'deleted' });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==================== 同步状态 ====================

    /**
     * 音色表同步状态
     * GET /api/voices/sync
     */
    router.get('/sync', (req, res) => {
      const statuses = voiceCatalog.registries.map(r => ({
        type: r.readOnly ? 'official' : 'user',
        ...r.getSyncStatus()
      }));
      res.json({
        success: true,
        data: { registries: statuses },
        timestamp: new Date().toISOString()
      });
    });
  }

  return router;
}

module.exports = { createVoiceManageRoutes };
