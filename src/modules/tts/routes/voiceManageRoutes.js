const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const { VoiceWriteService } = require('../application/VoiceWriteService');
const { VoiceAdminQueryService } = require('../application/VoiceAdminQueryService');
const { unifiedAuth } = require('../../../core/middleware/apiKeyMiddleware');
const { TtsErrorCodes, HTTP_STATUS_MAP, RETRYABLE_MAP } = require('../TtsErrorCodes');

const upload = multer({
  dest: path.join(os.tmpdir(), 'voice-uploads'),
  limits: { fileSize: 20 * 1024 * 1024 }
});

/**
 * 构造标准化错误响应，与主合成链路 TtsErrorCodes 约定一致：
 *   { success: false, code, message, retryable, ...extra }
 *
 * HTTP 状态码 / retryable 全部由 HTTP_STATUS_MAP / RETRYABLE_MAP 派生，
 * 调用方一般只需给 code + message；个别语义需覆盖状态码时传 status。
 */
function sendError(res, code, message, { status, ...extra } = {}) {
  const httpStatus = status || HTTP_STATUS_MAP[code] || 400;
  return res.status(httpStatus).json({
    success: false,
    code: code || TtsErrorCodes.INTERNAL_ERROR,
    message: message || code || 'Unknown error',
    retryable: RETRYABLE_MAP[code] === true,
    ...extra
  });
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
      sendError(res, TtsErrorCodes.INTERNAL_ERROR, error.message);
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
      return sendError(res, TtsErrorCodes.VOICE_NOT_FOUND, `Voice not found: ${req.params.id}`);
    }

    res.json({
      success: true,
      data: voice
    });
  });

  router.post('/', async (req, res) => {
    const result = getVoiceWriteService().create(req.body);

    if (!result.success) {
      // "Voice already exists" 语义为冲突 → 409，但仍归 VALIDATION_ERROR 码
      const status = result.error === 'Voice already exists' ? 409 : undefined;
      return sendError(res, TtsErrorCodes.VALIDATION_ERROR, result.error, { status, details: result.details });
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
      return sendError(res, TtsErrorCodes.VALIDATION_ERROR, 'voices must be an array');
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
      const code = result.error === 'Voice not found' ? TtsErrorCodes.VOICE_NOT_FOUND : TtsErrorCodes.VALIDATION_ERROR;
      return sendError(res, code, result.error, { details: result.details });
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
      return sendError(res, TtsErrorCodes.VOICE_NOT_FOUND, result.error);
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
      sendError(res, TtsErrorCodes.INTERNAL_ERROR, error.message);
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
      sendError(res, TtsErrorCodes.INTERNAL_ERROR, error.message);
    }
  });

  // ==================== 音色入驻（上传 + 克隆 + 注册 + 测试音频） ====================

  if (voiceOnboardingService) {
    router.post('/register',
      upload.single('audioFile'),
      async (req, res) => {
        const result = await voiceOnboardingService.registerVoice(req);

        if (!result.success) {
          return sendError(res, result.errorCode || TtsErrorCodes.INTERNAL_ERROR, result.error, { details: result.details });
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
          return sendError(res, TtsErrorCodes.VOICE_NOT_FOUND, `Voice not found: ${req.params.id}`);
        }

        const providerKey = stored.identity?.provider;
        const taskId = req.query.taskId || stored.runtime?.voiceId;

        if (!providerKey || !taskId) {
          return sendError(res, TtsErrorCodes.VALIDATION_ERROR, 'Voice has no provider or taskId');
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
        sendError(res, error.code || TtsErrorCodes.INTERNAL_ERROR, error.message);
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
          return sendError(res, result.errorCode || TtsErrorCodes.INTERNAL_ERROR, result.error, { details: result.details });
        }
        res.json(result);
      } catch (error) {
        sendError(res, error.code || TtsErrorCodes.INTERNAL_ERROR, error.message);
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
          return sendError(res, result.errorCode || TtsErrorCodes.INTERNAL_ERROR, result.error, { details: result.details });
        }
        res.status(201).json(result);
      } catch (error) {
        sendError(res, error.code || TtsErrorCodes.INTERNAL_ERROR, error.message);
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
          return sendError(res, TtsErrorCodes.VOICE_NOT_FOUND, `Voice not found: ${req.params.id}`);
        }

        // 官方库不可删
        const isOfficial = stored.meta?.dataSource !== 'api';
        if (isOfficial) {
          return sendError(res, TtsErrorCodes.VALIDATION_ERROR, 'Official voices cannot be deleted', { status: 403 });
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
        sendError(res, error.code || TtsErrorCodes.INTERNAL_ERROR, error.message);
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
