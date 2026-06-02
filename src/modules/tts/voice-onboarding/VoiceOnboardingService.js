/**
 * VoiceOnboardingService - 音色入驻编排服务
 *
 * 完整链路：
 *   1. 校验上传文件 + 表单
 *   2. 调用 Provider 的音色注册 API → 拿到 providerVoiceId
 *   3. 创建 StoredVoice 入库（VoiceWriteService → VoiceRegistry）
 *   4. 生成测试音频（TtsSynthesisService → AudioStorage）
 *   5. 清理临时上传文件（finally 保底）
 *
 * 资源管理：
 *   - 临时上传文件在 finally 块强制清理（防磁盘碎片堆积）
 *   - 测试音频走 AudioStorage，由 retentionPeriod 自动清理
 *   - Provider 端残留由 Provider 自行管理，本服务不处理
 */

const fs = require('fs').promises;
const VoiceCloneRequest = require('./schema/VoiceCloneRequest');
const VoiceCloneFormSchema = require('./schema/VoiceCloneFormSchema');
const { ProviderManifest } = require('../providers/manifests/ProviderManifest');

class VoiceOnboardingService {
  /**
   * @param {Object} deps
   * @param {Object} deps.voiceWriteService - VoiceWriteService 实例
   * @param {Object} deps.voiceRegistrationRegistry - VoiceRegistrationRegistry 实例
   * @param {Object} deps.ttsSynthesisService - TtsSynthesisService 实例（用于生成测试音频）
   * @param {Object} deps.credentials - 凭证模块
   */
  constructor({ voiceWriteService, voiceRegistrationRegistry, ttsSynthesisService, credentials, voiceGenAdapter = null }) {
    this.voiceWriteService = voiceWriteService;
    this.registry = voiceRegistrationRegistry;
    this.synthesisService = ttsSynthesisService;
    this.credentials = credentials;
    this.voiceGenAdapter = voiceGenAdapter;
  }

  /**
   * 注册新音色（完整链路）
   * @param {Object} req - Express request (含 req.body + req.file)
   * @returns {Promise<{ success: boolean, data?: Object, error?: string, details?: any }>}
   */
  async registerVoice(req) {
    const request = VoiceCloneRequest.fromHttp(req);
    const uploadPath = request.audioFile.path;
    let testAudioUrl = null;

    try {
      // ==== Step 1: 校验 ====
      const svcConfig = ProviderManifest.getServiceConfig(
        `${request.providerKey}_${request.serviceType}`
      );
      if (!svcConfig || !svcConfig.supportsVoiceCloning) {
        return {
          success: false,
          error: `Provider "${request.providerKey}" does not support voice cloning`
        };
      }

      const cloningConfig = svcConfig.voiceCloningConfig;
      const validation = VoiceCloneFormSchema.validate(req.body, request.audioFile, cloningConfig);
      if (!validation.valid) {
        return { success: false, error: 'Form validation failed', details: validation.errors };
      }

      // ==== Step 2: 调用 Provider 注册 API ====
      const adapter = this.registry.get(request.providerKey);
      const creds = this.credentials.getCredentials(request.providerKey);

      const cloneResult = await adapter.registerVoice(
        request.audioFile,
        {
          displayName: request.displayName,
          description: request.description,
          gender: request.gender,
          tags: request.tags,
          languages: request.languages
        },
        creds
      );

      if (!cloneResult.isReady()) {
        // ==== Step 3a: 异步模式 —— 先入库（inactive），跳过测试音频 ====
        const form = {
          provider: request.providerKey,
          service: request.serviceType,
          sourceId: request.sourceId,
          displayName: request.displayName,
          gender: request.gender,
          languages: request.languages,
          tags: request.tags,
          description: request.description,
          providerVoiceId: cloneResult.providerVoiceId,
          model: cloneResult.model,
          status: 'inactive'
        };

        const createResult = this.voiceWriteService.create(form);
        if (!createResult.success) {
          return { success: false, error: createResult.error, details: createResult.details };
        }

        await this.voiceWriteService.save();

        const newVoice = createResult.data;

        return {
          success: true,
          data: {
            asyncMode: true,
            taskId: cloneResult.taskId,
            providerVoiceId: cloneResult.providerVoiceId,
            voice: {
              id: newVoice.identity.id,
              voiceCode: newVoice.identity.voiceCode,
              displayName: newVoice.profile.displayName,
              status: 'inactive'
            },
            cloneResult: cloneResult.toJSON(),
            message: 'Voice cloning in progress. Poll GET /api/voices/register/:voiceId/status until ACTIVE.'
          }
        };
      }

      // ==== Step 3b: 同步模式 —— 创建 StoredVoice 入库（active） ====
      const form = {
        provider: request.providerKey,
        service: request.serviceType,
        sourceId: request.sourceId,
        displayName: request.displayName,
        gender: request.gender,
        languages: request.languages,
        tags: request.tags,
        description: request.description,
        providerVoiceId: cloneResult.providerVoiceId,
        model: cloneResult.model
      };

      const createResult = this.voiceWriteService.create(form);
      if (!createResult.success) {
        return { success: false, error: createResult.error, details: createResult.details };
      }

      await this.voiceWriteService.save();

      const newVoice = createResult.data;

      // ==== Step 4: 生成测试音频（可选跳过） ====
      if (!request.skipTestSynthesis) {
        try {
          testAudioUrl = await this._synthesizeTest(
            request,
            newVoice,
            cloningConfig,
            svcConfig
          );
        } catch (e) {
          // 测试音频失败不阻塞注册流程
          console.warn('[VoiceOnboarding] Test synthesis failed (non-blocking):', e.message);
        }
      }

      return {
        success: true,
        data: {
          voice: {
            id: newVoice.identity.id,
            voiceCode: newVoice.identity.voiceCode,
            displayName: newVoice.profile.displayName,
            provider: newVoice.identity.provider,
            service: newVoice.identity.service,
            gender: newVoice.profile.gender,
            tags: newVoice.profile.tags,
            categories: newVoice.profile.categories || [],
            languages: newVoice.profile.languages,
            description: newVoice.profile.description,
            previewUrl: newVoice.profile.preview || null
          },
          testAudioUrl,
          cloneResult: cloneResult.toJSON()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Voice registration failed'
      };
    } finally {
      // ==== Step 5: 清理临时文件（finally 保底） ====
      if (uploadPath) {
        try {
          await fs.unlink(uploadPath);
        } catch (e) {
          console.warn(`[VoiceOnboarding] Failed to clean up temp file ${uploadPath}:`, e.message);
        }
      }
    }
  }

  /**
   * 查询音色克隆状态的通用方法
   * 前端或轮询任务可调用此方法获取异步克隆进度
   * @param {string} providerKey
   * @param {string} voiceId - 异步克隆返回的 voice_id / taskId
   * @returns {Promise<{ status: 'pending'|'completed'|'failed', providerVoiceId?: string, error?: string }>}
   */
  async checkCloneStatus(providerKey, voiceId) {
    const adapter = this.registry.get(providerKey);
    const creds = this.credentials.getCredentials(providerKey);
    return adapter.getCloneStatus(voiceId, creds);
  }

  /**
   * 生成测试音频
   * @private
   */
  async   /**
   * 获取某 provider 的指令生成配置
   * @private
   */
  _getGenerationConfig(providerKey) {
    const { ProviderManifest } = require('../providers/manifests/ProviderManifest');
    // voiceGenerationConfig 在 manifest 顶层，通过任意 service config 可访问
    const keys = ProviderManifest.getAllServiceKeys();
    for (const k of keys) {
      if (k.startsWith(`${providerKey}_`)) {
        const cfg = ProviderManifest.getServiceConfig(k);
        if (cfg?.voiceGenerationConfig) return cfg.voiceGenerationConfig;
      }
    }
    return null;
  }

  /**
   * 生成指令预览音频（只生成，不入库）
   * @param {Object} body - { providerKey, instruction, testText, samplingParams? }
   * @returns {Promise<Object>}
   */
  async generateInstructionPreview(body) {
    const { providerKey, instruction, testText, samplingParams = {} } = body;

    if (!this.voiceGenAdapter) {
      return { success: false, error: 'Voice generation adapter not configured' };
    }
    if (!providerKey || !instruction) {
      return { success: false, error: 'providerKey and instruction are required' };
    }

    const genConfig = this._getGenerationConfig(providerKey);
    const phrase = testText || (genConfig?.testPhrases?.[0]) || '这是一条测试语音。';
    const creds = this.credentials.getCredentials(providerKey);

    try {
      const result = await this.voiceGenAdapter.generatePreview(
        instruction, phrase, samplingParams, creds?.apiKey
      );

      return {
        success: true,
        data: {
          audioUrl: result.audioUrl,
          fileSize: result.fileSize,
          format: result.format,
          meta: {
            instruction,
            creditCost: result.creditCost
          }
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 注册指令生成音色（入库）
   * @param {Object} body - { providerKey, serviceType, displayName, gender, instruction, samplingParams?, tags?, description?, languages? }
   * @returns {Promise<Object>}
   */
  async registerInstructionVoice(body) {
    const {
      providerKey, serviceType = 'voicegen',
      displayName, gender,
      instruction, samplingParams = {},
      tags = [], description = '', languages = ['中文']
    } = body;

    if (!providerKey || !displayName || !gender || !instruction) {
      return { success: false, error: 'providerKey, displayName, gender, instruction are required' };
    }

    if (!['male', 'female', 'neutral'].includes(gender)) {
      return { success: false, error: 'gender must be male, female, or neutral' };
    }

    const sourceId = (displayName + '_' + Date.now().toString(36)).replace(/\s+/g, '_');

    const form = {
      provider: providerKey,
      service: serviceType,
      sourceId,
      sourceType: 'instruction',
      displayName,
      gender,
      languages,
      tags: Array.isArray(tags) ? tags : [],
      description,
      providerVoiceId: null,
      model: 'moss-voice-generator',
      providerOptions: {
        instruction,
        temperature: samplingParams.temperature ?? 1.5,
        topP: samplingParams.topP ?? 0.6,
        topK: samplingParams.topK ?? 50
      },
      status: 'active'
    };

    const result = this.voiceWriteService.create(form);
    if (!result.success) {
      return { success: false, error: result.error, details: result.details };
    }

    await this.voiceWriteService.save();

    const newVoice = result.data;
    return {
      success: true,
      data: {
        voice: {
          id: newVoice.identity.id,
          voiceCode: newVoice.identity.voiceCode,
          displayName: newVoice.profile.displayName,
          sourceType: newVoice.identity.sourceType,
          provider: newVoice.identity.provider,
          service: newVoice.identity.service,
          runtime: {
            voiceId: newVoice.runtime.voiceId,
            providerOptions: newVoice.runtime.providerOptions
          }
        }
      }
    };
  }

  /**
   * 生成测试音频
   * @private
   */
  async _synthesizeTest(request, newVoice, cloningConfig, svcConfig) {
    const systemId = newVoice.identity.id;
    const voiceCode = newVoice.identity.voiceCode;

    const phrases = cloningConfig?.testPhrases || [];
    const testPhrase = request.testText || phrases[0] || '这是一条测试语音。';

    const synthRequest = {
      systemId,
      voiceCode,
      text: testPhrase,
      service: svcConfig._canonicalKey || `${request.providerKey}_${request.serviceType}`,
      options: {}
    };

    const SynthesisRequest = require('../domain/SynthesisRequest');
    const sr = SynthesisRequest.fromJSON(synthRequest);
    const result = await this.synthesisService.synthesize(sr);

    return result.audioUrl || null;
  }
}

module.exports = VoiceOnboardingService;
