/**
 * VoiceCreationEnricher — 音色创建适配层
 *
 * 职责：
 *   1. 补齐表单缺失字段（tags/languages/description/categories 默认值）
 *   2. 从 manifest 读取 provider 特定配置（model/voiceGenerationConfig）
 *   3. 留扩展钩子 onBeforeCreate / onAfterCreate（后期前端限制接入点）
 *
 * 当前策略：
 *   - tags → []（前端未传时空着，后续前端强制必填）
 *   - categories → []（后期加自动分类规则）
 *   - model → 从 manifest.voiceGenerationConfig.model 读取（不再写死）
 */

const { ProviderManifest } = require('../providers/manifests/ProviderManifest');

class VoiceCreationEnricher {
  /**
   * @param {Object} [options]
   * @param {Function} [options.onBeforeCreate] - 创建前钩子 (form) → form
   * @param {Function} [options.onAfterCreate]  - 创建后钩子 (storedVoice) → void
   */
  constructor(options = {}) {
    this._onBeforeCreate = options.onBeforeCreate || null;
    this._onAfterCreate = options.onAfterCreate || null;
  }

  /**
   * 补齐克隆表单
   * @param {string} providerKey  - e.g. 'mimo', 'moss'
   * @param {Object} cloneResult  - VoiceCloneResult 实例
   * @param {Object} rawBody      - req.body（或 VoiceCloneRequest）
   * @returns {Object} 可直接传给 VoiceWriteService.create() 的 form
   */
  enrichCloneForm(providerKey, cloneResult, rawBody = {}) {
    const displayName = rawBody.displayName || '';
    const sourceId = rawBody.sourceId || displayName;
    const serviceType = rawBody.serviceType || rawBody.service || 'tts';

    const form = {
      provider: providerKey,
      service: serviceType,
      sourceId,
      displayName,
      gender: rawBody.gender || 'neutral',
      languages: Array.isArray(rawBody.languages) ? rawBody.languages : (rawBody.languages ? [rawBody.languages] : ['zh-CN']),
      tags: Array.isArray(rawBody.tags) ? rawBody.tags : [],
      description: rawBody.description || '',
      providerVoiceId: cloneResult.providerVoiceId || null,
      model: cloneResult.model || null,
      status: rawBody.status || (cloneResult.isReady() ? 'active' : 'inactive')
    };

    return this._applyBeforeHook(form);
  }

  /**
   * 补齐指令音色表单
   * @param {string} providerKey   - e.g. 'mimo', 'moss'
   * @param {Object} body          - req.body
   * @returns {Object} 可直接传给 VoiceWriteService.create() 的 form
   */
  enrichInstructionForm(providerKey, body = {}) {
    const genConfig = this._getGenerationConfig(providerKey);
    const model = genConfig?.model || 'moss-voice-generator';

    const displayName = body.displayName || '';
    const instruction = body.instruction || '';
    const samplingParams = body.samplingParams || {};

    const sourceId = (displayName + '_' + Date.now().toString(36)).replace(/\s+/g, '_');

    const form = {
      provider: providerKey,
      service: 'voicegen',
      sourceId,
      sourceType: 'instruction',
      displayName,
      gender: body.gender || 'neutral',
      languages: Array.isArray(body.languages) ? body.languages : (body.languages ? [body.languages] : ['zh-CN']),
      tags: Array.isArray(body.tags) ? body.tags : [],
      description: body.description || '',
      providerVoiceId: null,
      model,
      providerOptions: {
        instruction,
        temperature: samplingParams.temperature ?? 1.5,
        topP: samplingParams.topP ?? 0.6,
        topK: samplingParams.topK ?? 50
      },
      status: 'active'
    };

    return this._applyBeforeHook(form);
  }

  // ==================== 钩子 ====================

  /**
   * 设置创建前钩子（后期前端限制接入点）
   * @param {(form: Object) => { valid: boolean, errors?: string[], form?: Object }} hook
   */
  onBeforeCreate(hook) {
    this._onBeforeCreate = hook;
  }

  onAfterCreate(hook) {
    this._onAfterCreate = hook;
  }

  _applyBeforeHook(form) {
    if (!this._onBeforeCreate) return form;
    const result = this._onBeforeCreate(form);
    if (result && typeof result === 'object' && result.valid !== undefined) {
      return result;
    }
    return form;
  }

  /**
   * 触发创建后钩子（fire-and-forget，绝不阻塞 HTTP 响应）
   *
   * 约束：
   *   - 钩子内部禁止 await 网络请求，只允许内存操作或入消息队列
   *   - 使用 setImmediate 确保在当前事件循环清空后才执行
   *   - 钩子抛错不传播，仅 console.warn
   */
  triggerAfterCreate(storedVoice) {
    if (!this._onAfterCreate) return;
    setImmediate(() => {
      try {
        this._onAfterCreate(storedVoice);
      } catch (e) {
        console.warn('[VoiceCreationEnricher] onAfterCreate hook failed:', e.message);
      }
    });
  }

  // ==================== 内部 ====================

  _getGenerationConfig(providerKey) {
    const keys = ProviderManifest.getAllServiceKeys();
    for (const k of keys) {
      if (k.startsWith(`${providerKey}_`)) {
        const cfg = ProviderManifest.getServiceConfig(k);
        if (cfg?.voiceGenerationConfig) return cfg.voiceGenerationConfig;
      }
    }
    return null;
  }
}

module.exports = { VoiceCreationEnricher };
