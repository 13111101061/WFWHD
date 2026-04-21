/**
 * VoiceWriteService - 音色写入服务
 *
 * 职责：
 * - 统一收口音色新增、批量新增、更新逻辑
 * - 表单校验、去重检查、标准化、存储结构校验
 * - 调用 VoiceRegistry 写入
 *
 * 使用场景：
 * - 管理路由 POST /api/voices
 * - 管理路由 POST /api/voices/batch
 * - 管理路由 PUT /api/voices/:id
 * - 导入脚本
 */

const { voiceRegistry } = require('../core/VoiceRegistry');
const VoiceFormSchema = require('../schema/VoiceFormSchema');
const StoredVoiceSchema = require('../schema/StoredVoiceSchema');
const VoiceNormalizer = require('./VoiceNormalizer');

class VoiceWriteService {
  /**
   * @param {Object} options
   * @param {Object} options.registry - VoiceRegistry 实例（用于依赖注入）
   */
  constructor(options = {}) {
    this.registry = options.registry || voiceRegistry;
  }

  // ==================== 新增 ====================

  /**
   * 创建单个音色
   * @param {Object} form - VoiceFormDTO
   * @param {Object} options
   * @param {number} [options.voiceNumber] - 音色编号（用于生成 voiceCode）
   * @returns {Object} { success, data?, error? }
   */
  create(form, options = {}) {
    // 1. 表单校验
    const formValidation = VoiceFormSchema.validate(form);
    if (!formValidation.valid) {
      return {
        success: false,
        error: 'Form validation failed',
        details: formValidation.errors
      };
    }

    // 2. 转换为 StoredVoice
    const stored = VoiceNormalizer.fromForm(form, options);

    // 3. 去重检查
    const existing = this.registry.get(stored.identity.id);
    if (existing) {
      return {
        success: false,
        error: 'Voice already exists',
        details: { id: stored.identity.id }
      };
    }

    // 4. 存储结构校验
    const storedValidation = StoredVoiceSchema.validate(stored);
    if (!storedValidation.valid) {
      return {
        success: false,
        error: 'Stored voice validation failed',
        details: storedValidation.errors
      };
    }

    // 5. 写入 Registry
    try {
      this.registry.addStored(stored);
      return { success: true, data: stored };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 批量创建音色
   * 内部复用 create() 的核心校验逻辑
   *
   * @param {Array} forms - VoiceFormDTO 数组
   * @param {Object} options
   * @returns {Object} { success, data: { added, errors, count } }
   */
  createBatch(forms, options = {}) {
    if (!Array.isArray(forms)) {
      return { success: false, error: 'Forms must be an array' };
    }

    const added = [];
    const errors = [];
    const addedIds = new Set(); // 本批次内去重

    for (let i = 0; i < forms.length; i++) {
      const form = forms[i];
      const result = this._createOneInternal(form, options, addedIds);

      if (result.success) {
        added.push(result.data.identity.id);
        addedIds.add(result.data.identity.id);
      } else {
        errors.push({
          index: i,
          form: form.sourceId || form.displayName || 'unknown',
          error: result.error,
          details: result.details
        });
      }
    }

    return {
      success: errors.length === 0,
      data: {
        added,
        errors,
        count: added.length,
        total: forms.length
      }
    };
  }

  /**
   * 内部创建方法（供批量复用）
   * @private
   */
  _createOneInternal(form, options = {}, excludeIds = new Set()) {
    // 1. 表单校验
    const formValidation = VoiceFormSchema.validate(form);
    if (!formValidation.valid) {
      return {
        success: false,
        error: 'Form validation failed',
        details: formValidation.errors
      };
    }

    // 2. 转换为 StoredVoice
    const stored = VoiceNormalizer.fromForm(form, options);

    // 3. 去重检查（Registry + 本批次）
    if (excludeIds.has(stored.identity.id)) {
      return {
        success: false,
        error: 'Duplicate in batch',
        details: { id: stored.identity.id }
      };
    }

    const existing = this.registry.get(stored.identity.id);
    if (existing) {
      return {
        success: false,
        error: 'Voice already exists',
        details: { id: stored.identity.id }
      };
    }

    // 4. 存储结构校验
    const storedValidation = StoredVoiceSchema.validate(stored);
    if (!storedValidation.valid) {
      return {
        success: false,
        error: 'Stored voice validation failed',
        details: storedValidation.errors
      };
    }

    // 5. 写入 Registry
    try {
      this.registry.addStored(stored);
      return { success: true, data: stored };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ==================== 更新 ====================

  /**
   * 更新音色
   * @param {string} id - 音色 ID
   * @param {Object} updates - 更新内容（VoiceFormDTO 的部分字段）
   * @returns {Object} { success, data?, error? }
   */
  update(id, updates) {
    // 1. 检查音色是否存在
    const existing = this.registry.get(id);
    if (!existing) {
      return {
        success: false,
        error: 'Voice not found',
        details: { id }
      };
    }

    // 2. 更新校验（只校验允许更新的字段）
    const updateValidation = VoiceFormSchema.validateUpdate(updates);
    if (!updateValidation.valid) {
      return {
        success: false,
        error: 'Update validation failed',
        details: updateValidation.errors
      };
    }

    // 3. 构建更新对象（分层合并）
    const merged = this._mergeUpdates(existing, updates);

    // 4. 存储结构校验
    const storedValidation = StoredVoiceSchema.validate(merged);
    if (!storedValidation.valid) {
      return {
        success: false,
        error: 'Stored voice validation failed',
        details: storedValidation.errors
      };
    }

    // 5. 写入 Registry
    try {
      const updated = this.registry.update(id, merged);
      return { success: true, data: updated };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 合并更新到现有音色
   * @private
   */
  _mergeUpdates(existing, updates) {
    const now = new Date().toISOString();

    // 从表单字段映射到存储结构
    return {
      identity: {
        ...existing.identity
        // id/provider/service/sourceId 不可变
      },
      profile: {
        ...existing.profile,
        ...(updates.displayName !== undefined && { displayName: updates.displayName }),
        ...(updates.alias !== undefined && { alias: updates.alias }),
        ...(updates.gender !== undefined && { gender: updates.gender }),
        ...(updates.languages !== undefined && { languages: updates.languages }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.tags !== undefined && { tags: updates.tags }),
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.preview !== undefined && { preview: updates.preview })
      },
      runtime: {
        ...existing.runtime,
        ...(updates.providerVoiceId !== undefined && { voiceId: updates.providerVoiceId }),
        ...(updates.model !== undefined && { model: updates.model }),
        ...(updates.providerOptions !== undefined && { providerOptions: updates.providerOptions })
      },
      meta: {
        ...existing.meta,
        updatedAt: now
      }
    };
  }

  // ==================== 删除 ====================

  /**
   * 删除音色
   * @param {string} id - 音色 ID
   * @returns {Object} { success, error? }
   */
  remove(id) {
    const existing = this.registry.get(id);
    if (!existing) {
      return {
        success: false,
        error: 'Voice not found',
        details: { id }
      };
    }

    try {
      this.registry.remove(id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ==================== 持久化 ====================

  /**
   * 保存到存储
   */
  async save() {
    await this.registry.save();
    return { success: true };
  }

  /**
   * 重新加载
   */
  async reload() {
    await this.registry.reload();
    return { success: true };
  }
}

// 导出单例和类
const voiceWriteService = new VoiceWriteService();

module.exports = {
  VoiceWriteService,
  voiceWriteService
};
