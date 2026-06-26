/**
 * VoiceOnboardingService - 音色入驻编排服务
 *
 * 完整链路：
 *   1. 校验上传文件 + 表单
 *   2. 调用 Provider 的音色创建 API → 拿到 providerVoiceId（或异步 taskId）
 *   3. 创建 StoredVoice 入库（VoiceWriteService → VoiceRegistry）
 *   4. 生成测试音频（TtsSynthesisService → AudioStorage）
 *   5. 清理临时上传文件（finally 保底）
 *
 * 设计要点（重构后）：
 *   - 克隆 / 指令生成两条链路统一走 VoiceCreationRegistry 的能力路由
 *     （forClone / forInstruction），不再分别持有 RegistrationRegistry 与
 *     裸 voiceGenAdapters map。
 *   - Provider 配置（克隆约束 / 指令生成 samplingDefaults / model）的唯一读取
 *     入口是 registry，本服务不再直接遍历 ProviderManifest。
 *   - 传给 Adapter 的是完整 credentials 对象（由 Adapter._apiKey 解析），
 *     与合成链路 BaseTtsAdapter._getCredentials 的契约一致。
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
   * @param {Object} deps.voiceCreationRegistry - VoiceCreationRegistry 实例（能力路由 + 配置读取）
   * @param {Object} deps.ttsSynthesisService - TtsSynthesisService 实例（用于生成测试音频）
   * @param {Object} deps.credentials - 凭证模块
   * @param {Object} [deps.enricher] - VoiceCreationEnricher 实例（可选）
   */
  constructor({ voiceWriteService, voiceCreationRegistry, ttsSynthesisService, credentials, enricher = null }) {
    this.voiceWriteService = voiceWriteService;
    this.registry = voiceCreationRegistry;
    this.synthesisService = ttsSynthesisService;
    this.credentials = credentials;
    this.enricher = enricher;
  }

  /**
   * 注册新音色（克隆链路完整流程）
   * @param {Object} req - Express request (含 req.body + req.file)
   * @returns {Promise<{ success: boolean, data?: Object, error?: string, errorCode?: string, details?: any }>}
   */
  async registerVoice(req) {
    const request = VoiceCloneRequest.fromHttp(req);
    const uploadPath = request.audioFile.path;
    let testAudioUrl = null;

    try {
      // ==== Step 1: 能力路由 + 校验 ====
      if (!this.registry.supportsClone(request.providerKey)) {
        return {
          success: false,
          error: `Provider "${request.providerKey}" does not support voice cloning`,
          errorCode: 'CAPABILITY_NOT_SUPPORTED'
        };
      }

      const cloningConfig = this.registry.getCloningConfig(request.providerKey);
      const validation = VoiceCloneFormSchema.validate(req.body, request.audioFile, cloningConfig);
      if (!validation.valid) {
        return { success: false, error: 'Form validation failed', errorCode: 'VALIDATION_ERROR', details: validation.errors };
      }

      // ==== Step 2: 调用 Provider 创建 API（forClone 已做能力校验） ====
      const adapter = this.registry.forClone(request.providerKey);
      const creds = this.credentials.getCredentials(request.providerKey);

      const cloneResult = await adapter.cloneVoice(
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
        const form = this._buildCloneForm(request.providerKey, cloneResult, {
          ...req.body,
          status: 'inactive',
          sourceId: request.sourceId,
          serviceType: request.serviceType,
          displayName: request.displayName,
          gender: request.gender,
          languages: request.languages,
          tags: request.tags,
          description: request.description
        });

        const createResult = this.voiceWriteService.create(form);
        if (!createResult.success) {
          return { success: false, error: createResult.error, errorCode: 'VALIDATION_ERROR', details: createResult.details };
        }

        await this.voiceWriteService.save();

        const newVoice = createResult.data;

        if (this.enricher) this.enricher.triggerAfterCreate(newVoice);

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
            message: 'Voice cloning in progress. Poll GET /api/voices/:id/status until ACTIVE.'
          }
        };
      }

      // ==== Step 3b: 同步模式 —— 创建 StoredVoice 入库（active） ====
      const form = this._buildCloneForm(request.providerKey, cloneResult, {
        ...req.body,
        sourceId: request.sourceId,
        serviceType: request.serviceType,
        displayName: request.displayName,
        gender: request.gender,
        languages: request.languages,
        tags: request.tags,
        description: request.description
      });

      const createResult = this.voiceWriteService.create(form);
      if (!createResult.success) {
        return { success: false, error: createResult.error, errorCode: 'VALIDATION_ERROR', details: createResult.details };
      }

      await this.voiceWriteService.save();

      const newVoice = createResult.data;

      if (this.enricher) this.enricher.triggerAfterCreate(newVoice);

      // ==== Step 4: 生成测试音频（可选跳过） ====
      if (!request.skipTestSynthesis) {
        try {
          testAudioUrl = await this._synthesizeTest(
            request,
            newVoice,
            cloningConfig
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
        error: error.message || 'Voice registration failed',
        ...(error.code ? { errorCode: error.code } : {})
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
   * 查询音色克隆状态（异步轮询入口）
   * @param {string} providerKey
   * @param {string} voiceId - 异步克隆返回的 voice_id / taskId
   * @returns {Promise<{ status: 'pending'|'completed'|'failed', providerVoiceId?: string, error?: string }>}
   */
  async checkCloneStatus(providerKey, voiceId) {
    const adapter = this.registry.forClone(providerKey);
    const creds = this.credentials.getCredentials(providerKey);
    return adapter.getCloneStatus(voiceId, creds);
  }

  /**
   * 生成指令预览音频（只生成，不入库）
   * @param {Object} body - { providerKey, instruction, testText, samplingParams? }
   * @returns {Promise<Object>}
   */
  async generateInstructionPreview(body) {
    const { providerKey, instruction, testText, samplingParams = {} } = body;

    if (!this.registry.supportsInstruction(providerKey)) {
      return {
        success: false,
        error: `Provider "${providerKey}" does not support instruction-based generation`,
        errorCode: 'CAPABILITY_NOT_SUPPORTED'
      };
    }

    const genConfig = this.registry.getGenerationConfig(providerKey) || {};
    const phrase = testText || (genConfig.testPhrases?.[0]) || '这是一条测试语音。';
    const samplingDefaults = genConfig.samplingDefaults || {};

    // 默认值（manifest）< 用户输入，与表单注册路径保持一致
    const mergedSampling = {
      temperature: samplingParams.temperature ?? samplingDefaults.temperature,
      topP: samplingParams.topP ?? samplingDefaults.topP,
      topK: samplingParams.topK ?? samplingDefaults.topK
    };

    try {
      const adapter = this.registry.forInstruction(providerKey);
      const creds = this.credentials.getCredentials(providerKey);

      const result = await adapter.generatePreview(instruction, phrase, mergedSampling, creds);

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
      return {
        success: false,
        error: error.message,
        ...(error.code ? { errorCode: error.code } : {})
      };
    }
  }

  /**
   * 注册指令生成音色（入库）
   * @param {Object} body - { providerKey, serviceType?, displayName, gender, instruction, samplingParams?, tags?, description?, languages? }
   * @returns {Promise<Object>}
   */
  async registerInstructionVoice(body) {
    const {
      providerKey,
      displayName, gender,
      instruction
    } = body;

    if (!providerKey || !displayName || !gender || !instruction) {
      return { success: false, error: 'providerKey, displayName, gender, instruction are required', errorCode: 'VALIDATION_ERROR' };
    }

    if (!['male', 'female', 'neutral'].includes(gender)) {
      return { success: false, error: 'gender must be male, female, or neutral', errorCode: 'VALIDATION_ERROR' };
    }

    if (!this.registry.supportsInstruction(providerKey)) {
      return {
        success: false,
        error: `Provider "${providerKey}" does not support instruction-based generation`,
        errorCode: 'CAPABILITY_NOT_SUPPORTED'
      };
    }

    const form = this._buildInstructionForm(providerKey, body);

    try {
      const result = this.voiceWriteService.create(form);
      if (!result.success) {
        return { success: false, error: result.error, errorCode: 'VALIDATION_ERROR', details: result.details };
      }

      await this.voiceWriteService.save();

      const newVoice = result.data;

      if (this.enricher) this.enricher.triggerAfterCreate(newVoice);

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
    } catch (error) {
      return {
        success: false,
        error: error.message,
        ...(error.code ? { errorCode: error.code } : {})
      };
    }
  }

  // ==================== 表单构造（单一来源：registry / enricher） ====================

  /**
   * 构造克隆入库表单
   * @private
   */
  _buildCloneForm(providerKey, cloneResult, rawBody = {}) {
    if (this.enricher) {
      return this.enricher.enrichCloneForm(providerKey, cloneResult, rawBody);
    }
    return {
      provider: providerKey,
      service: rawBody.serviceType || rawBody.service || 'tts',
      sourceId: rawBody.sourceId || rawBody.displayName || '',
      displayName: rawBody.displayName || '',
      gender: rawBody.gender || 'neutral',
      languages: Array.isArray(rawBody.languages) ? rawBody.languages : ['zh-CN'],
      tags: Array.isArray(rawBody.tags) ? rawBody.tags : [],
      description: rawBody.description || '',
      providerVoiceId: cloneResult.providerVoiceId || null,
      model: cloneResult.model || null,
      status: rawBody.status || (cloneResult.isReady() ? 'active' : 'inactive')
    };
  }

  /**
   * 构造指令生成入库表单
   * model / samplingDefaults 全部来自 manifest（registry），无硬编码。
   * @private
   */
  _buildInstructionForm(providerKey, body = {}) {
    if (this.enricher) {
      return this.enricher.enrichInstructionForm(providerKey, body);
    }

    const genConfig = this.registry.getGenerationConfig(providerKey) || {};
    const model = genConfig.model || 'moss-voice-generator';
    const samplingDefaults = genConfig.samplingDefaults || {};
    const samplingParams = body.samplingParams || {};

    const displayName = body.displayName || '';
    const sourceId = (displayName + '_' + Date.now().toString(36)).replace(/\s+/g, '_');

    return {
      provider: providerKey,
      service: 'voicegen',
      sourceId,
      sourceType: 'instruction',
      displayName,
      gender: body.gender || 'neutral',
      languages: Array.isArray(body.languages) ? body.languages : ['zh-CN'],
      tags: Array.isArray(body.tags) ? body.tags : [],
      description: body.description || '',
      providerVoiceId: null,
      model,
      providerOptions: {
        instruction: body.instruction || '',
        temperature: samplingParams.temperature ?? samplingDefaults.temperature,
        topP: samplingParams.topP ?? samplingDefaults.topP,
        topK: samplingParams.topK ?? samplingDefaults.topK
      },
      status: 'active'
    };
  }

  // ==================== 测试音频生成 ====================

  /**
   * 生成测试音频
   * @private
   */
  async _synthesizeTest(request, newVoice, cloningConfig) {
    const systemId = newVoice.identity.id;
    const voiceCode = newVoice.identity.voiceCode;

    const phrases = cloningConfig?.testPhrases || [];
    const testPhrase = request.testText || phrases[0] || '这是一条测试语音。';

    // 合成路由需要 canonical serviceKey，由 ProviderManifest 解析（合成链路自身职责）
    const canonicalKey = this._resolveCanonicalKey(request.providerKey, request.serviceType);

    const synthRequest = {
      systemId,
      voiceCode,
      text: testPhrase,
      service: canonicalKey,
      options: {}
    };

    const SynthesisRequest = require('../domain/SynthesisRequest');
    const sr = SynthesisRequest.fromJSON(synthRequest);
    const result = await this.synthesisService.synthesize(sr);

    return result.audioUrl || null;
  }

  /**
   * 解析合成的 canonical serviceKey
   * 优先用 manifest 注入的 _canonicalKey，回退到 provider_service 拼接。
   * @private
   */
  _resolveCanonicalKey(providerKey, serviceType) {
    const serviceKey = `${providerKey}_${serviceType}`;
    const svcConfig = ProviderManifest.getServiceConfig(serviceKey);
    return svcConfig?._canonicalKey || serviceKey;
  }
}

module.exports = VoiceOnboardingService;
