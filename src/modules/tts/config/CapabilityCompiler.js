/**
 * CapabilityCompiler - 能力编译器
 *
 * 职责：
 * - 将三层定义合并编译为 CompiledCapability
 * - 执行冲突检查
 * - 生成校验器、映射器、UI Schema
 *
 * 编译时机：
 * - 服务启动时编译
 * - 手动 reload 时重新编译
 * - 编译失败 fail-fast
 *
 * 编译产物：
 * - compiledSchema - 字段 Schema
 * - compiledUiSchema - UI Schema
 * - compiledDefaults - 默认值
 * - compiledLockedParams - 锁定参数
 * - compiledValidator - 校验器
 * - compiledMapper - 映射器
 * - compiledFieldIndex - 字段索引
 */

const { registry } = require('./FieldDefinitionRegistry');

/**
 * 支持状态枚举
 */
const SupportStatus = {
  SUPPORTED: 'supported',
  UNSUPPORTED: 'unsupported',
  LOCKED: 'locked',
  HIDDEN: 'hidden',
  DEPRECATED: 'deprecated'
};

/**
 * 冲突检查规则
 */
const ConflictRules = [
  {
    name: 'locked-without-value',
    check: (field) => field.status === 'locked' && !field.lockedValue && !field.lockedValueSource,
    message: 'locked 状态字段必须有 lockedValue 或 lockedValueSource'
  },
  {
    name: 'range-without-number-type',
    check: (field) => field.range && field.type !== 'number',
    message: '只有 number 类型字段可以有 range'
  },
  {
    name: 'enum-without-enum-type',
    check: (field) => field.values && field.type !== 'enum',
    message: '只有 enum 类型字段可以有 values'
  }
];

/**
 * 编译单个字段
 * @param {string} fieldKey - 字段标识
 * @param {Object} platformField - 平台字段定义
 * @param {Object} serviceOverride - 服务覆盖
 * @param {Object} providerMapping - Provider 映射
 * @returns {Object} 编译后的字段
 */
function compileField(fieldKey, platformField, serviceOverride, providerMapping) {
  const compiled = {
    key: fieldKey,
    displayName: platformField?.displayName || fieldKey,
    description: platformField?.description || '',
    type: platformField?.type || 'string',
    category: platformField?.category || 'core',
    required: platformField?.required || false,

    // 支持状态
    status: serviceOverride?.status || SupportStatus.SUPPORTED,

    // 默认值（服务覆盖 > 平台默认）
    defaultValue: serviceOverride?.defaultOverride ?? platformField?.platformDefault,

    // 范围（服务覆盖 > 平台范围）
    range: serviceOverride?.rangeOverride ?? platformField?.platformRange,

    // 枚举值（服务覆盖 > 平台枚举值）
    values: serviceOverride?.validationOverride?.enum ?? platformField?.platformValues,

    // UI 配置（合并）
    ui: {
      ...platformField?.ui,
      ...serviceOverride?.ui
    },

    // 校验规则（合并）
    validation: {
      ...platformField?.validation,
      ...serviceOverride?.validationOverride
    },

    // 锁定信息
    lockedValue: serviceOverride?.lockedValue,
    lockedValueSource: serviceOverride?.lockedValueSource,

    // Provider 映射
    mapping: providerMapping || null,

    // 原因说明
    reason: serviceOverride?.reason,

    // 来源追踪
    provenance: {
      hasPlatformDef: !!platformField,
      hasServiceOverride: !!serviceOverride,
      hasProviderMapping: !!providerMapping
    }
  };

  return compiled;
}

/**
 * 编译嵌套字段
 * @param {Object} parentField - 父字段定义
 * @param {Object} parentOverride - 父字段覆盖
 * @param {Object} parentMapping - 父字段映射
 * @returns {Object[]} 编译后的嵌套字段列表
 */
function compileNestedFields(parentField, parentOverride, parentMapping) {
  const nestedFields = [];
  const nestedDefs = parentField?.nestedFields || {};

  for (const [nestedKey, nestedDef] of Object.entries(nestedDefs)) {
    const nestedOverride = parentOverride?.nestedFields?.[nestedKey];
    const nestedMapping = parentMapping?.nestedMappings?.[nestedKey];

    nestedFields.push({
      key: nestedKey,
      parentKey: parentField.key,
      fullKey: `${parentField.key}.${nestedKey}`,
      ...nestedDef,
      status: nestedOverride?.status || SupportStatus.SUPPORTED,
      defaultValue: nestedOverride?.defaultOverride ?? nestedDef.platformDefault,
      range: nestedOverride?.rangeOverride ?? nestedDef.platformRange,
      mapping: nestedMapping || null
    });
  }

  return nestedFields;
}

/**
 * 执行冲突检查
 * @param {Object} compiledField - 编译后的字段
 * @throws {Error} 发现冲突时抛出
 */
function checkConflicts(compiledField) {
  for (const rule of ConflictRules) {
    if (rule.check(compiledField)) {
      throw new Error(
        `[CapabilityCompiler] 字段冲突 [${compiledField.key}]: ${rule.message}`
      );
    }
  }
}

/**
 * 生成字段校验器
 * @param {Object} compiledField - 编译后的字段
 * @returns {Function} 校验函数
 */
function generateValidator(compiledField) {
  return (value) => {
    // unsupported 字段拒绝
    if (compiledField.status === SupportStatus.UNSUPPORTED && value !== undefined) {
      return {
        valid: false,
        error: `字段 ${compiledField.key} 不被支持: ${compiledField.reason || ''}`
      };
    }

    // 无值时通过
    if (value === undefined || value === null) {
      return { valid: true };
    }

    // 类型检查
    if (compiledField.type === 'number' && typeof value !== 'number') {
      return { valid: false, error: `${compiledField.key} 必须是数字` };
    }

    if (compiledField.type === 'string' && typeof value !== 'string') {
      return { valid: false, error: `${compiledField.key} 必须是字符串` };
    }

    // 范围检查
    if (compiledField.range && typeof value === 'number') {
      const { min, max } = compiledField.range;
      if (value < min || value > max) {
        return {
          valid: false,
          error: `${compiledField.key} 必须在 ${min} - ${max} 之间`
        };
      }
    }

    // 枚举检查
    if (compiledField.values && compiledField.type === 'enum') {
      if (!compiledField.values.includes(value)) {
        return {
          valid: false,
          error: `${compiledField.key} 必须是以下值之一: ${compiledField.values.join(', ')}`
        };
      }
    }

    return { valid: true };
  };
}

/**
 * 生成字段映射器
 * @param {Object} compiledField - 编译后的字段
 * @param {string} apiStructure - API 结构类型
 * @returns {Function} 映射函数
 */
function generateMapper(compiledField, apiStructure) {
  const mapping = compiledField.mapping;
  if (!mapping || mapping.transform === 'ignore') {
    return null;
  }

  return (value, context) => {
    const result = {};
    const providerPath = mapping.providerPath;

    // 处理 transform
    switch (mapping.transform) {
      case 'direct':
        result[providerPath] = value;
        break;

      case 'rename':
        result[providerPath] = value;
        break;

      case 'linear':
        if (mapping.transformConfig?.formula) {
          // 简单线性变换
          const { inputRange, outputRange } = mapping.transformConfig;
          if (inputRange && outputRange) {
            const ratio = (outputRange.max - outputRange.min) / (inputRange.max - inputRange.min);
            result[providerPath] = Math.round((value - inputRange.min) * ratio + outputRange.min);
          } else {
            result[providerPath] = value;
          }
        }
        break;

      case 'enumMap':
        if (mapping.enumMap && mapping.enumMap[value]) {
          result[providerPath] = mapping.enumMap[value];
        }
        break;

      case 'nestedPath':
        // 嵌套路径写入
        const paths = providerPath.split('.');
        let current = result;
        for (let i = 0; i < paths.length - 1; i++) {
          if (!current[paths[i]]) {
            current[paths[i]] = {};
          }
          current = current[paths[i]];
        }
        current[paths[paths.length - 1]] = value;
        break;

      default:
        result[providerPath] = value;
    }

    // 处理值来源 — 仅在无 transform 时使用 source
    if (mapping.source && !mapping.transform) {
      result[providerPath] = context?.[mapping.source];
    }

    return result;
  };
}

/**
 * CapabilityCompiler 类
 */
const CapabilityCompiler = {
  /**
   * 编译服务能力
   * @param {string} serviceKey - 服务标识
   * @param {string} providerKey - 服务商标识
   * @param {string} operation - 操作类型
   * @returns {Object} CompiledCapability
   * @throws {Error} 编译失败时抛出
   */
  compile(serviceKey, providerKey, operation = 'synthesize') {
    // 检查缓存
    const cacheKey = `${serviceKey}:${operation}`;
    const cached = registry.getCompiledCache(cacheKey);
    if (cached) {
      return cached;
    }

    console.log(`[CapabilityCompiler] 编译服务能力: ${serviceKey}/${operation}`);

    // 获取三层定义
    const platformFields = registry.getAllPlatformFields();
    const serviceOverrides = registry.getServiceOverrides(serviceKey, operation);
    const providerMappings = registry.getProviderMappings(providerKey, serviceKey);
    const apiStructure = registry.getProviderApiStructure(providerKey, serviceKey);

    // 编译字段
    const compiledFields = {};
    const fieldIndex = {
      supported: [],
      unsupported: [],
      locked: [],
      hidden: [],
      deprecated: []
    };

    for (const [fieldKey, platformField] of Object.entries(platformFields)) {
      const serviceOverride = serviceOverrides[fieldKey];
      const providerMapping = providerMappings[fieldKey];

      const compiled = compileField(fieldKey, platformField, serviceOverride, providerMapping);

      // 冲突检查
      checkConflicts(compiled);

      // 生成校验器和映射器
      compiled.validator = generateValidator(compiled);
      compiled.mapper = generateMapper(compiled, apiStructure);

      // 编译嵌套字段
      if (platformField.type === 'object' && platformField.nestedFields) {
        compiled.nestedFields = compileNestedFields(
          compiled,
          serviceOverride,
          providerMapping
        );
      }

      compiledFields[fieldKey] = compiled;

      // 更新字段索引
      const status = compiled.status;
      if (fieldIndex[status]) {
        fieldIndex[status].push(fieldKey);
      }
    }

    // 生成最终产物
    const compiled = {
      serviceKey,
      providerKey,
      operation,

      // 字段 Schema
      compiledSchema: compiledFields,

      // UI Schema
      compiledUiSchema: this._buildUiSchema(compiledFields, registry.getUiGroups()),

      // 默认值
      compiledDefaults: this._extractDefaults(compiledFields),

      // 锁定参数
      compiledLockedParams: this._extractLockedParams(compiledFields),

      // 字段索引
      compiledFieldIndex: fieldIndex,

      // API 结构
      apiStructure,

      // 元信息
      compiledAt: new Date().toISOString(),
      version: '1.0.0'
    };

    // 缓存编译结果
    registry.setCompiledCache(cacheKey, compiled);

    console.log(`[CapabilityCompiler] 编译完成: ${fieldIndex.supported.length} supported, ${fieldIndex.unsupported.length} unsupported, ${fieldIndex.locked.length} locked`);

    return compiled;
  },

  /**
   * 编译所有服务
   * @returns {Object<string, Object>} 服务标识 -> CompiledCapability
   */
  compileAll() {
    const { ProviderManifest } = require('../providers/manifests/ProviderManifest');
    const serviceKeys = ProviderManifest.getAllServiceKeys();
    const results = {};
    const errors = [];

    // 从 ProviderDescriptorRegistry 获取 providerKey 映射
    const { ProviderDescriptorRegistry } = require('../provider-management/ProviderDescriptorRegistry');

    for (const serviceKey of serviceKeys) {
      try {
        const descriptor = ProviderDescriptorRegistry.get(serviceKey);
        if (!descriptor) {
          errors.push({ serviceKey, error: '服务描述未找到' });
          continue;
        }

        results[serviceKey] = this.compile(serviceKey, descriptor.provider);
      } catch (error) {
        errors.push({ serviceKey, error: error.message });
        console.error(`[CapabilityCompiler] 编译失败 [${serviceKey}]:`, error.message);
      }
    }

    if (errors.length > 0) {
      console.warn(`[CapabilityCompiler] 部分服务编译失败: ${errors.length}/${serviceKeys.length}`);
    }

    return { results, errors };
  },

  /**
   * 构建 UI Schema
   * @private
   */
  _buildUiSchema(compiledFields, uiGroups) {
    const schema = {
      groups: {},
      fields: {}
    };

    // 按分组组织字段
    for (const [fieldKey, field] of Object.entries(compiledFields)) {
      if (field.status === SupportStatus.HIDDEN) continue;

      const groupKey = field.ui?.group || 'advanced';
      if (!schema.groups[groupKey]) {
        schema.groups[groupKey] = {
          key: groupKey,
          displayName: uiGroups[groupKey]?.displayName || groupKey,
          order: uiGroups[groupKey]?.order || 99,
          collapsed: uiGroups[groupKey]?.collapsed ?? false,
          fields: []
        };
      }

      schema.groups[groupKey].fields.push(fieldKey);
      schema.fields[fieldKey] = {
        displayName: field.displayName,
        description: field.description,
        type: field.type,
        ui: field.ui,
        status: field.status,
        defaultValue: field.defaultValue,
        range: field.range,
        values: field.values
      };
    }

    // 排序分组
    schema.groups = Object.values(schema.groups).sort((a, b) => a.order - b.order);

    return schema;
  },

  /**
   * 提取默认值
   * @private
   */
  _extractDefaults(compiledFields) {
    const defaults = {};

    for (const [fieldKey, field] of Object.entries(compiledFields)) {
      if (field.status === SupportStatus.UNSUPPORTED) continue;
      if (field.defaultValue !== undefined) {
        defaults[fieldKey] = field.defaultValue;
      }
    }

    return defaults;
  },

  /**
   * 提取锁定参数
   * @private
   */
  _extractLockedParams(compiledFields) {
    const locked = {};

    for (const [fieldKey, field] of Object.entries(compiledFields)) {
      if (field.status === SupportStatus.LOCKED) {
        locked[fieldKey] = {
          value: field.lockedValue,
          valueSource: field.lockedValueSource,
          reason: field.reason
        };
      }
    }

    return locked;
  }
};

module.exports = {
  CapabilityCompiler,
  SupportStatus
};
