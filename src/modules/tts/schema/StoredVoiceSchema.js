/**
 * StoredVoiceSchema - 存储结构校验 Schema
 *
 * 职责：
 * - 校验持久化存储的完整音色结构
 * - 确保四层结构（identity/profile/runtime/meta）完整
 *
 * 存储结构：
 * {
 *   identity: { id, voiceCode, sourceId, provider, service },
 *   profile: { displayName, alias, gender, languages, description, tags, status },
 *   runtime: { voiceId, model, providerOptions },
 *   meta: { createdAt, updatedAt, dataSource, version }
 * }
 */

const VALID_GENDERS = ['male', 'female', 'neutral'];
const VALID_STATUSES = ['active', 'inactive', 'deprecated'];
const VALID_DATA_SOURCES = ['manual', 'import', 'migration', 'api'];

const IdentitySchema = {
  // voiceCode 改为可选，由系统生成
  required: ['id', 'sourceId', 'provider', 'service'],
  optional: ['voiceCode'],
  validate(identity) {
    const errors = [];
    if (!identity) {
      return ['identity 不能为空'];
    }
    for (const field of this.required) {
      if (!identity[field]) {
        errors.push(`identity 缺少必填字段: ${field}`);
      }
    }
    // ID 格式校验: provider-service-sourceId
    if (identity.id && !identity.id.includes('-')) {
      errors.push('identity.id 格式不正确，应为 provider-service-sourceId');
    }
    return errors;
  }
};

const ProfileSchema = {
  required: ['displayName', 'gender'],
  validate(profile) {
    const errors = [];
    if (!profile) {
      return ['profile 不能为空'];
    }
    for (const field of this.required) {
      if (!profile[field]) {
        errors.push(`profile 缺少必填字段: ${field}`);
      }
    }
    if (profile.gender && !VALID_GENDERS.includes(profile.gender)) {
      errors.push(`profile.gender 值无效: ${profile.gender}`);
    }
    if (profile.languages && !Array.isArray(profile.languages)) {
      errors.push('profile.languages 必须为数组');
    }
    if (profile.tags && !Array.isArray(profile.tags)) {
      errors.push('profile.tags 必须为数组');
    }
    return errors;
  }
};

const RuntimeSchema = {
  required: ['voiceId'],
  validate(runtime) {
    const errors = [];
    if (!runtime) {
      return ['runtime 不能为空'];
    }
    for (const field of this.required) {
      if (!runtime[field]) {
        errors.push(`runtime 缺少必填字段: ${field}`);
      }
    }
    if (runtime.providerOptions && typeof runtime.providerOptions !== 'object') {
      errors.push('runtime.providerOptions 必须为对象');
    }
    return errors;
  }
};

const MetaSchema = {
  required: ['createdAt', 'updatedAt', 'dataSource'],
  validate(meta) {
    const errors = [];
    if (!meta) {
      return ['meta 不能为空'];
    }
    for (const field of this.required) {
      if (!meta[field]) {
        errors.push(`meta 缺少必填字段: ${field}`);
      }
    }
    // 日期格式校验
    if (meta.createdAt && isNaN(Date.parse(meta.createdAt))) {
      errors.push('meta.createdAt 格式不正确');
    }
    if (meta.updatedAt && isNaN(Date.parse(meta.updatedAt))) {
      errors.push('meta.updatedAt 格式不正确');
    }
    if (meta.dataSource && !VALID_DATA_SOURCES.includes(meta.dataSource)) {
      errors.push(`meta.dataSource 值无效: ${meta.dataSource}`);
    }
    return errors;
  }
};

const StoredVoiceSchema = {
  // 顶层必填结构
  required: ['identity', 'profile', 'runtime', 'meta'],

  /**
   * 校验完整存储结构
   * @param {Object} stored - 存储对象
   * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
   */
  validate(stored) {
    const errors = [];
    const warnings = [];

    if (!stored || typeof stored !== 'object') {
      return { valid: false, errors: ['存储对象必须为对象'], warnings: [] };
    }

    // 1. 检查顶层结构
    for (const field of this.required) {
      if (!stored[field]) {
        errors.push(`缺少顶层结构: ${field}`);
      }
    }

    // 2. 校验各层
    if (stored.identity) {
      errors.push(...IdentitySchema.validate(stored.identity).map(e => `identity: ${e}`));
    }

    if (stored.profile) {
      errors.push(...ProfileSchema.validate(stored.profile).map(e => `profile: ${e}`));
    }

    if (stored.runtime) {
      errors.push(...RuntimeSchema.validate(stored.runtime).map(e => `runtime: ${e}`));
    }

    if (stored.meta) {
      errors.push(...MetaSchema.validate(stored.meta).map(e => `meta: ${e}`));
    }

    // 3. 检查兼容层（如果有）
    if (stored._compat) {
      warnings.push('_compat 为兼容层，后续版本将移除');
    }

    // 4. 检查未知顶层字段
    const knownTopLevel = new Set([...this.required, '_compat']);
    for (const key of Object.keys(stored)) {
      if (!knownTopLevel.has(key)) {
        warnings.push(`未知顶层字段 "${key}"`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  },

  /**
   * 获取存储结构定义（供文档生成使用）
   */
  getStructureDefinition() {
    return {
      identity: {
        required: IdentitySchema.required,
        description: '身份标识层，只放稳定不变的字段'
      },
      profile: {
        required: ProfileSchema.required,
        description: '展示资料层，用于前端展示和筛选'
      },
      runtime: {
        required: RuntimeSchema.required,
        description: '运行时层，服务商调用所需字段'
      },
      meta: {
        required: MetaSchema.required,
        description: '元数据层，系统生成和运维字段'
      }
    };
  },

  // 导出子 Schema 供单独使用
  IdentitySchema,
  ProfileSchema,
  RuntimeSchema,
  MetaSchema
};

module.exports = StoredVoiceSchema;
