/**
 * CompiledCapability - 编译后的服务能力
 *
 * 这是 CapabilityCompiler 的产物，提供：
 * - 字段 Schema 访问
 * - UI Schema 访问
 * - 默认值访问
 * - 锁定参数访问
 * - 字段校验
 * - 参数映射
 *
 * 运行时消费此对象，不再读取原始配置
 */

const { SupportStatus } = require('./CapabilityCompiler');

/**
 * CompiledCapability 类
 */
class CompiledCapability {
  /**
   * @param {Object} compiled - 编译产物
   */
  constructor(compiled) {
    this._data = compiled;
  }

  // ==================== 基本信息 ====================

  /**
   * 获取服务标识
   * @returns {string}
   */
  get serviceKey() {
    return this._data.serviceKey;
  }

  /**
   * 获取服务商标识
   * @returns {string}
   */
  get providerKey() {
    return this._data.providerKey;
  }

  /**
   * 获取操作类型
   * @returns {string}
   */
  get operation() {
    return this._data.operation;
  }

  /**
   * 获取 API 结构类型
   * @returns {string} 'flat' | 'nested'
   */
  get apiStructure() {
    return this._data.apiStructure;
  }

  /**
   * 获取编译时间
   * @returns {string}
   */
  get compiledAt() {
    return this._data.compiledAt;
  }

  // ==================== 字段访问 ====================

  /**
   * 获取所有字段 Schema
   * @returns {Object<string, Object>}
   */
  getSchema() {
    return this._data.compiledSchema;
  }

  /**
   * 获取单个字段定义
   * @param {string} fieldKey - 字段标识
   * @returns {Object|null}
   */
  getField(fieldKey) {
    return this._data.compiledSchema[fieldKey] || null;
  }

  /**
   * 检查字段是否存在
   * @param {string} fieldKey - 字段标识
   * @returns {boolean}
   */
  hasField(fieldKey) {
    return fieldKey in this._data.compiledSchema;
  }

  /**
   * 获取字段支持状态
   * @param {string} fieldKey - 字段标识
   * @returns {string} SupportStatus
   */
  getFieldStatus(fieldKey) {
    const field = this.getField(fieldKey);
    return field?.status || SupportStatus.UNSUPPORTED;
  }

  /**
   * 检查字段是否支持
   * @param {string} fieldKey - 字段标识
   * @returns {boolean}
   */
  isFieldSupported(fieldKey) {
    const status = this.getFieldStatus(fieldKey);
    return status === SupportStatus.SUPPORTED ||
           status === SupportStatus.LOCKED ||
           status === SupportStatus.HIDDEN;
  }

  /**
   * 检查字段是否锁定
   * @param {string} fieldKey - 字段标识
   * @returns {boolean}
   */
  isFieldLocked(fieldKey) {
    return this.getFieldStatus(fieldKey) === SupportStatus.LOCKED;
  }

  // ==================== UI Schema ====================

  /**
   * 获取 UI Schema
   * @returns {Object}
   */
  getUiSchema() {
    return this._data.compiledUiSchema;
  }

  /**
   * 获取 UI 分组列表
   * @returns {Object[]}
   */
  getUiGroups() {
    return this._data.compiledUiSchema.groups || [];
  }

  /**
   * 获取字段的 UI 配置
   * @param {string} fieldKey - 字段标识
   * @returns {Object|null}
   */
  getFieldUi(fieldKey) {
    return this._data.compiledUiSchema.fields[fieldKey]?.ui || null;
  }

  // ==================== 默认值 ====================

  /**
   * 获取所有默认值
   * @returns {Object}
   */
  getDefaults() {
    return this._data.compiledDefaults;
  }

  /**
   * 获取单个字段默认值
   * @param {string} fieldKey - 字段标识
   * @returns {*}
   */
  getDefault(fieldKey) {
    return this._data.compiledDefaults[fieldKey];
  }

  /**
   * 合并用户参数与默认值
   * @param {Object} userParams - 用户参数
   * @param {Object} [options] - 选项
   * @param {boolean} [options.collectWarnings=true] - 是否收集警告
   * @returns {Object|{params: Object, warnings: Object[]}} 合并后的参数（含警告信息）
   */
  mergeWithDefaults(userParams = {}, options = {}) {
    const { collectWarnings = true } = options;
    const defaults = this.getDefaults();
    const result = { ...defaults };
    const warnings = [];

    for (const [key, value] of Object.entries(userParams)) {
      // 跳过 undefined 值
      if (value === undefined) continue;

      // 跳过不支持的字段，记录警告
      if (!this.isFieldSupported(key)) {
        if (collectWarnings) {
          const field = this.getField(key);
          warnings.push({
            type: 'unsupported',
            param: key,
            value,
            message: field?.reason || `参数 ${key} 不被支持`
          });
        }
        continue;
      }

      // 跳过锁定的字段（用户不能覆盖），记录警告
      if (this.isFieldLocked(key)) {
        if (collectWarnings) {
          warnings.push({
            type: 'locked',
            param: key,
            value,
            message: `参数 ${key} 已被锁定，用户值被忽略`
          });
        }
        continue;
      }

      result[key] = value;
    }

    // 如果需要收集警告，返回带警告的对象
    if (collectWarnings && warnings.length > 0) {
      return { params: result, warnings };
    }

    return result;
  }

  // ==================== 锁定参数 ====================

  /**
   * 获取所有锁定参数
   * @returns {Object}
   */
  getLockedParams() {
    return this._data.compiledLockedParams;
  }

  /**
   * 获取锁定参数值
   * @param {string} fieldKey - 字段标识
   * @returns {*}
   */
  getLockedValue(fieldKey) {
    const locked = this._data.compiledLockedParams[fieldKey];
    if (!locked) return undefined;
    return locked.value;
  }

  /**
   * 获取锁定参数值来源
   * @param {string} fieldKey - 字段标识
   * @returns {string|null}
   */
  getLockedValueSource(fieldKey) {
    const locked = this._data.compiledLockedParams[fieldKey];
    if (!locked) return null;
    return locked.valueSource;
  }

  /**
   * 应用锁定参数到请求
   * @param {Object} params - 请求参数
   * @param {Object} context - 上下文（用于解析 valueSource）
   * @returns {Object} 应用锁定后的参数
   */
  applyLockedParams(params = {}, context = {}) {
    const result = { ...params };
    const lockedParams = this.getLockedParams();

    for (const [fieldKey, lockInfo] of Object.entries(lockedParams)) {
      if (lockInfo.value !== undefined) {
        result[fieldKey] = lockInfo.value;
      } else if (lockInfo.valueSource && context[lockInfo.valueSource] !== undefined) {
        result[fieldKey] = context[lockInfo.valueSource];
      }
    }

    return result;
  }

  // ==================== 字段索引 ====================

  /**
   * 获取字段索引
   * @returns {Object}
   */
  getFieldIndex() {
    return this._data.compiledFieldIndex;
  }

  /**
   * 获取支持的字段列表
   * @returns {string[]}
   */
  getSupportedFields() {
    return this._data.compiledFieldIndex.supported || [];
  }

  /**
   * 获取不支持的字段列表
   * @returns {string[]}
   */
  getUnsupportedFields() {
    return this._data.compiledFieldIndex.unsupported || [];
  }

  // ==================== 校验 ====================

  /**
   * 校验参数
   * @param {Object} params - 要校验的参数
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(params = {}) {
    const errors = [];
    const schema = this.getSchema();

    for (const [fieldKey, field] of Object.entries(schema)) {
      const value = params[fieldKey];

      // locked 字段由系统填充，跳过必填检查
      if (field.status === SupportStatus.LOCKED) {
        continue;
      }

      // 必填检查
      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field.displayName} 是必填字段`);
        continue;
      }

      // 跳过未提供的非必填字段
      if (value === undefined) continue;

      // 使用字段校验器
      if (field.validator) {
        const result = field.validator(value);
        if (!result.valid) {
          errors.push(result.error);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 过滤参数（移除不支持的字段）
   * @param {Object} params - 原始参数
   * @returns {Object} 过滤后的参数
   */
  /**
   * 过滤参数（移除不支持的字段）
   * @param {Object} params - 原始参数
   * @param {Object} [options] - 选项
   * @param {boolean} [options.collectWarnings=true] - 是否收集警告
   * @returns {Object|{params: Object, warnings: Object[]}} 过滤后的参数（含警告信息）
   */
  filterParams(params = {}, options = {}) {
    const { collectWarnings = true } = options;
    const result = {};
    const unsupported = new Set(this.getUnsupportedFields());
    const warnings = [];

    for (const [key, value] of Object.entries(params)) {
      if (unsupported.has(key)) {
        if (collectWarnings && value !== undefined) {
          const field = this.getField(key);
          warnings.push({
            type: 'filtered',
            param: key,
            value,
            message: field?.reason || `参数 ${key} 不被支持，已过滤`
          });
        }
        continue;
      }
      if (value !== undefined) {
        result[key] = value;
      }
    }

    if (collectWarnings && warnings.length > 0) {
      return { params: result, warnings };
    }

    return result;
  }

  // ==================== 映射 ====================

  /**
   * 将参数映射为 Provider API 格式
   * @param {Object} params - 平台参数
   * @param {Object} context - 上下文（包含 providerVoiceId 等）
   * @returns {Object} Provider API 参数
   */
  mapToProvider(params = {}, context = {}) {
    const result = {};
    const schema = this.getSchema();

    for (const [fieldKey, value] of Object.entries(params)) {
      if (value === undefined) continue;

      const field = schema[fieldKey];
      if (!field?.mapper) continue;

      const mapped = field.mapper(value, context);
      if (mapped) {
        Object.assign(result, mapped);
      }
    }

    return result;
  }

  // ==================== 调试 ====================

  /**
   * 获取字段来源追踪
   * @param {string} fieldKey - 字段标识
   * @returns {Object}
   */
  traceField(fieldKey) {
    const field = this.getField(fieldKey);
    if (!field) {
      return { error: `字段 ${fieldKey} 不存在` };
    }

    return {
      key: fieldKey,
      displayName: field.displayName,
      status: field.status,
      defaultValue: field.defaultValue,
      provenance: field.provenance,
      mapping: field.mapping ? {
        providerPath: field.mapping.providerPath,
        transform: field.mapping.transform
      } : null
    };
  }

  /**
   * 导出为 JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      serviceKey: this.serviceKey,
      providerKey: this.providerKey,
      operation: this.operation,
      apiStructure: this.apiStructure,
      compiledAt: this.compiledAt,
      fieldIndex: this.getFieldIndex(),
      defaults: this.getDefaults(),
      lockedParams: this.getLockedParams()
    };
  }

  /**
   * 导出详细调试信息
   * @returns {Object}
   */
  toDebugJSON() {
    return this._data;
  }
}

/**
 * 创建 CompiledCapability 实例
 * @param {Object} compiled - 编译产物
 * @returns {CompiledCapability}
 */
function createCompiledCapability(compiled) {
  return new CompiledCapability(compiled);
}

/**
 * 从缓存获取或编译 CompiledCapability
 * @param {string} serviceKey - 服务标识
 * @param {string} providerKey - 服务商标识
 * @param {string} operation - 操作类型
 * @returns {CompiledCapability}
 */
function getCompiledCapability(serviceKey, providerKey, operation = 'synthesize') {
  const { CapabilityCompiler } = require('./CapabilityCompiler');
  const compiled = CapabilityCompiler.compile(serviceKey, providerKey, operation);
  return new CompiledCapability(compiled);
}

module.exports = {
  CompiledCapability,
  createCompiledCapability,
  getCompiledCapability
};
