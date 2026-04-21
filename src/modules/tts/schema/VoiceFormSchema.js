/**
 * VoiceFormSchema - 表单输入校验 Schema
 *
 * 职责：
 * - 校验前端表单提交的可编辑字段
 * - 禁止传入系统字段（id, voiceCode, createdAt, updatedAt, ttsConfig）
 *
 * 表单字段分组：
 * - 基础身份：provider, service, sourceId（必填）
 * - 展示资料：displayName, alias, gender, languages, description, tags, status, preview
 * - 运行配置：providerVoiceId, model, providerOptions
 *
 * 字段映射说明：
 * - 表单字段: preview（试听地址）
 * - 存储位置: profile.preview
 * - 展示输出: previewUrl（VoiceCatalog.toDisplayDto 标准化输出）
 */

const VALID_GENDERS = ['male', 'female', 'neutral'];
const VALID_STATUSES = ['active', 'inactive', 'deprecated'];

// 禁止前端填写的系统字段
const FORBIDDEN_FIELDS = [
  'id',
  'voiceCode',
  'voiceCodeMeta',
  'createdAt',
  'updatedAt',
  'ttsConfig',
  'runtime',   // runtime 应该通过 providerVoiceId/model/providerOptions 构建
  'meta'
];

const VoiceFormSchema = {
  // 必填字段
  required: [
    'provider',       // 服务商标识
    'service',        // 服务类型
    'sourceId',       // 源文件 ID
    'displayName',    // 显示名称
    'gender',         // 性别
    'providerVoiceId' // 服务商真实音色 ID
  ],

  // 可选字段
  optional: [
    'alias',          // 别名
    'languages',      // 支持语言
    'description',    // 描述
    'tags',           // 标签
    'status',         // 状态
    'preview',        // 试听地址 URL
    'model',          // 模型名称
    'providerOptions' // 服务商特定选项
  ],

  /**
   * 校验表单数据
   * @param {Object} form - 表单数据
   * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
   */
  validate(form) {
    const errors = [];
    const warnings = [];

    if (!form || typeof form !== 'object') {
      return { valid: false, errors: ['表单数据必须为对象'], warnings: [] };
    }

    // 1. 检查禁止字段
    for (const field of FORBIDDEN_FIELDS) {
      if (form[field] !== undefined) {
        errors.push(`禁止传入系统字段: ${field}`);
      }
    }

    // 2. 检查必填字段
    for (const field of this.required) {
      if (form[field] === undefined || form[field] === null || form[field] === '') {
        errors.push(`缺少必填字段: ${field}`);
      }
    }

    // 3. 校验字段格式
    if (form.provider && typeof form.provider !== 'string') {
      errors.push('provider 必须为字符串');
    }

    if (form.service && typeof form.service !== 'string') {
      errors.push('service 必须为字符串');
    }

    if (form.sourceId && typeof form.sourceId !== 'string') {
      errors.push('sourceId 必须为字符串');
    }

    if (form.displayName && typeof form.displayName !== 'string') {
      errors.push('displayName 必须为字符串');
    }

    if (form.gender && !VALID_GENDERS.includes(form.gender)) {
      errors.push(`gender 必须为: ${VALID_GENDERS.join(', ')}`);
    }

    if (form.status && !VALID_STATUSES.includes(form.status)) {
      warnings.push(`status 值 "${form.status}" 不在标准列表中，将使用默认值 "active"`);
    }

    if (form.languages && !Array.isArray(form.languages)) {
      errors.push('languages 必须为数组');
    }

    if (form.tags && !Array.isArray(form.tags)) {
      errors.push('tags 必须为数组');
    }

    if (form.providerVoiceId && typeof form.providerVoiceId !== 'string') {
      errors.push('providerVoiceId 必须为字符串');
    }

    if (form.providerOptions && typeof form.providerOptions !== 'object') {
      errors.push('providerOptions 必须为对象');
    }

    // providerOptions 不能是数组
    if (form.providerOptions && Array.isArray(form.providerOptions)) {
      errors.push('providerOptions 必须为对象，不能是数组');
    }

    if (form.preview !== undefined && form.preview !== null && typeof form.preview !== 'string') {
      errors.push('preview 必须为字符串 URL');
    }

    // 4. 检查未知字段（警告）
    const knownFields = new Set([...this.required, ...this.optional, ...FORBIDDEN_FIELDS]);
    for (const key of Object.keys(form)) {
      if (!knownFields.has(key)) {
        warnings.push(`未知字段 "${key}" 将被忽略`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  },

  /**
   * 校验更新数据（不要求必填字段，只校验格式）
   * @param {Object} updates - 更新数据
   * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
   */
  validateUpdate(updates) {
    const errors = [];
    const warnings = [];

    if (!updates || typeof updates !== 'object') {
      return { valid: false, errors: ['更新数据必须为对象'], warnings: [] };
    }

    // 1. 检查禁止字段
    for (const field of FORBIDDEN_FIELDS) {
      if (updates[field] !== undefined) {
        errors.push(`禁止修改系统字段: ${field}`);
      }
    }

    // 2. 校验字段格式（只校验传入的字段）
    if (updates.provider !== undefined && typeof updates.provider !== 'string') {
      errors.push('provider 必须为字符串');
    }

    if (updates.service !== undefined && typeof updates.service !== 'string') {
      errors.push('service 必须为字符串');
    }

    if (updates.sourceId !== undefined && typeof updates.sourceId !== 'string') {
      errors.push('sourceId 必须为字符串');
    }

    if (updates.displayName !== undefined && typeof updates.displayName !== 'string') {
      errors.push('displayName 必须为字符串');
    }

    if (updates.gender !== undefined && !VALID_GENDERS.includes(updates.gender)) {
      errors.push(`gender 必须为: ${VALID_GENDERS.join(', ')}`);
    }

    if (updates.status !== undefined && !VALID_STATUSES.includes(updates.status)) {
      warnings.push(`status 值 "${updates.status}" 不在标准列表中`);
    }

    if (updates.languages !== undefined && !Array.isArray(updates.languages)) {
      errors.push('languages 必须为数组');
    }

    if (updates.tags !== undefined && !Array.isArray(updates.tags)) {
      errors.push('tags 必须为数组');
    }

    if (updates.providerVoiceId !== undefined && typeof updates.providerVoiceId !== 'string') {
      errors.push('providerVoiceId 必须为字符串');
    }

    if (updates.providerOptions !== undefined) {
      if (typeof updates.providerOptions !== 'object' || Array.isArray(updates.providerOptions)) {
        errors.push('providerOptions 必须为对象，不能是数组');
      }
    }

    if (updates.preview !== undefined && updates.preview !== null && typeof updates.preview !== 'string') {
      errors.push('preview 必须为字符串 URL');
    }

    // 3. 检查未知字段
    const knownFields = new Set([...this.required, ...this.optional, ...FORBIDDEN_FIELDS]);
    for (const key of Object.keys(updates)) {
      if (!knownFields.has(key)) {
        warnings.push(`未知字段 "${key}" 将被忽略`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  },

  /**
   * 获取表单字段定义（供前端使用）
   */
  getFieldDefinition() {
    return {
      required: this.required,
      optional: this.optional,
      forbidden: FORBIDDEN_FIELDS,
      validGenders: VALID_GENDERS,
      validStatuses: VALID_STATUSES
    };
  }
};

module.exports = VoiceFormSchema;
