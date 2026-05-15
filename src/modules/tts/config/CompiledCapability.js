/**
 * CompiledCapability - 编译后的服务能力
 *
 * CapabilityCompiler 的运行时产物，提供：
 * - 字段 Schema / UI Schema / 默认值 / 锁定参数 访问
 * - resolveParams(): 单一参数解析入口（过滤 + 合并 + 锁定 → { params, warnings }）
 * - validate(): 参数校验
 * - mapToProvider(): 映射为服务商 API 参数（自动跳过不支持的字段）
 *
 * 运行时消费此对象，不再读取原始配置
 */

const { SupportStatus } = require('./CapabilityCompiler');

class CompiledCapability {
  constructor(compiled) {
    this._data = compiled;
  }

  // ==================== 基本信息 ====================

  get serviceKey() { return this._data.serviceKey; }
  get providerKey() { return this._data.providerKey; }
  get operation() { return this._data.operation; }
  get apiStructure() { return this._data.apiStructure; }
  get compiledAt() { return this._data.compiledAt; }

  // ==================== 字段访问 ====================

  getSchema() { return this._data.compiledSchema; }

  getField(fieldKey) { return this._data.compiledSchema[fieldKey] || null; }

  hasField(fieldKey) { return fieldKey in this._data.compiledSchema; }

  getFieldStatus(fieldKey) {
    const field = this.getField(fieldKey);
    return field?.status || SupportStatus.UNSUPPORTED;
  }

  isFieldSupported(fieldKey) {
    const status = this.getFieldStatus(fieldKey);
    return status === SupportStatus.SUPPORTED ||
           status === SupportStatus.LOCKED ||
           status === SupportStatus.HIDDEN;
  }

  isFieldLocked(fieldKey) {
    return this.getFieldStatus(fieldKey) === SupportStatus.LOCKED;
  }

  // ==================== UI Schema ====================

  getUiSchema() { return this._data.compiledUiSchema; }
  getUiGroups() { return this._data.compiledUiSchema.groups || []; }
  getFieldUi(fieldKey) { return this._data.compiledUiSchema.fields[fieldKey]?.ui || null; }

  // ==================== 默认值 ====================

  getDefaults() { return this._data.compiledDefaults; }
  getDefault(fieldKey) { return this._data.compiledDefaults[fieldKey]; }

  // ==================== 锁定参数 ====================

  getLockedParams() { return this._data.compiledLockedParams; }
  getLockedValue(fieldKey) { return this._data.compiledLockedParams[fieldKey]?.value; }
  getLockedValueSource(fieldKey) { return this._data.compiledLockedParams[fieldKey]?.valueSource; }

  /**
   * 应用锁定参数到请求
   * @param {Object} params - 请求参数
   * @param {Object} context - 上下文（用于解析 valueSource）
   * @returns {Object} 应用锁定后的参数
   */
  applyLockedParams(params = {}, context = {}) {
    const result = { ...params };
    for (const [fieldKey, lockInfo] of Object.entries(this.getLockedParams())) {
      if (lockInfo.value !== undefined) {
        result[fieldKey] = lockInfo.value;
      } else if (lockInfo.valueSource && context[lockInfo.valueSource] !== undefined) {
        result[fieldKey] = context[lockInfo.valueSource];
      }
    }
    return result;
  }

  // ==================== 字段索引 ====================

  getFieldIndex() { return this._data.compiledFieldIndex; }
  getSupportedFields() { return this._data.compiledFieldIndex.supported || []; }
  getUnsupportedFields() { return this._data.compiledFieldIndex.unsupported || []; }

  // ==================== 能力推导 ====================

  /**
   * 从编译后的字段索引自动推导 capabilities（替代 manifest 中手写的 capabilities 块）
   */
  getCapabilities() {
    const supported = new Set(this.getSupportedFields());
    return {
      streaming: this._data.capabilityStreaming || false,
      realtime: this._data.capabilityRealtime || false,
      emotion: supported.has('emotion'),
      speedAdjustable: supported.has('speed'),
      pitchAdjustable: supported.has('pitch'),
      volumeAdjustable: supported.has('volume'),
      languageSelectable: supported.has('languageType'),
      samplingParams: supported.has('samplingParams'),
      expectedDuration: supported.has('expectedDurationSec')
    };
  }

  /** 从编译字段推导锁定参数列表（替代 manifest 中手写的 lockedParams） */
  getLockedParamsKeys() {
    return Object.keys(this.getLockedParams());
  }

  // ==================== 参数解析（单一入口）====================

  /**
   * 解析参数：过滤不支持 → 合并默认值 → 跳过锁定 → 生成 warnings
   *
   * 这是参数合并的唯一入口，替代旧的 filterParams + mergeWithDefaults 两步调用。
   * 不会产生重复 warnings。
   *
   * @param {Object} userParams - 用户输入参数
   * @param {Object} [context] - 锁定参数上下文（如 providerVoiceId）
   * @returns {{ params: Object, warnings: Object[] }}
   */
  resolveParams(userParams = {}, context = {}) {
    const defaults = this.getDefaults();
    const result = { ...defaults };
    const warnings = [];

    for (const [key, value] of Object.entries(userParams)) {
      if (value === undefined) continue;

      const status = this.getFieldStatus(key);

      if (status === SupportStatus.UNSUPPORTED) {
        const field = this.getField(key);
        warnings.push({
          type: 'unsupported',
          param: key,
          value,
          message: field?.reason || `此服务商不支持参数 ${key}`
        });
        continue;
      }

      if (status === SupportStatus.LOCKED) {
        warnings.push({
          type: 'locked',
          param: key,
          value,
          message: `参数 ${key} 已被锁定，用户值被忽略`
        });
        continue;
      }

      if (status === SupportStatus.HIDDEN) continue;

      result[key] = value;
    }

    const lockedApplied = this.applyLockedParams(result, context);

    return { params: lockedApplied, warnings };
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

      if (field.status === SupportStatus.LOCKED) continue;

      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field.displayName} 是必填字段`);
        continue;
      }

      if (value === undefined) continue;

      if (field.validator) {
        const result = field.validator(value);
        if (!result.valid) errors.push(result.error);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ==================== 映射 ====================

  /**
   * 将参数映射为 Provider API 格式
   * 自动跳过不支持的字段（mapper 为 null）和未映射的字段。
   *
   * @param {Object} params - 平台参数（已通过 resolveParams 处理）
   * @param {Object} context - 上下文（包含 providerVoiceId 等）
   * @returns {Object} Provider API 参数
   */
  mapToProvider(params = {}, context = {}) {
    const result = {};
    const schema = this.getSchema();

    for (const [fieldKey, value] of Object.entries(params)) {
      if (value === undefined) continue;

      const field = schema[fieldKey];
      if (!field) continue;

      if (field.nestedFields && Array.isArray(field.nestedFields) && typeof value === 'object') {
        for (const nestedField of field.nestedFields) {
          const nestedValue = value[nestedField.key];
          if (nestedValue === undefined) continue;
          if (!nestedField.mapping?.providerPath) continue;

          const paths = nestedField.mapping.providerPath.split('.');
          let current = result;
          for (let i = 0; i < paths.length - 1; i++) {
            if (!current[paths[i]]) current[paths[i]] = {};
            current = current[paths[i]];
          }
          current[paths[paths.length - 1]] = nestedValue;
        }
        continue;
      }

      if (!field?.mapper) continue;

      const mapped = field.mapper(value, context);
      if (mapped) Object.assign(result, mapped);
    }

    return result;
  }

  // ==================== 调试 ====================

  traceField(fieldKey) {
    const field = this.getField(fieldKey);
    if (!field) return { error: `字段 ${fieldKey} 不存在` };

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

  toDebugJSON() { return this._data; }

  /**
   * 能力指纹：前端提交时带此 digest，后端校验 schema 是否一致。
   * 不一致时返回 CAPABILITY_SCHEMA_OUTDATED 让前端拉最新 schema。
   */
  get capabilityDigest() {
    if (!this._cachedDigest) {
      const crypto = require('crypto');
      const payload = JSON.stringify({
        schema: this._data.compiledSchema,
        defaults: this._data.compiledDefaults,
        lockedParams: this._data.compiledLockedParams
      });
      this._cachedDigest = crypto.createHash('sha256').update(payload).digest('hex').substring(0, 12);
    }
    return this._cachedDigest;
  }
}

function createCompiledCapability(compiled) {
  return new CompiledCapability(compiled);
}

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