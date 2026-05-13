/**
 * CapabilityCompiler - 能力编译器
 *
 * 职责：
 * - 将三层定义合并编译为 CompiledCapability
 * - 执行冲突检查
 * - 生成校验器、映射器、UI Schema
 *
 * 编译时机：服务启动时编译，手动 reload 时重新编译，编译失败 fail-fast
 *
 * 编译产物：
 * - compiledSchema - 字段 Schema
 * - compiledUiSchema - UI Schema
 * - compiledDefaults - 默认值
 * - compiledLockedParams - 锁定参数
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

// ==================== Transform 函数（独立命名） ====================

function transformDirect(value, providerPath) {
  return { [providerPath]: value };
}

function transformRename(value, providerPath) {
  return { [providerPath]: value };
}

function transformLinear(value, providerPath, transformConfig) {
  if (!transformConfig?.formula) return { [providerPath]: value };
  const { inputRange, outputRange } = transformConfig;
  if (!inputRange || !outputRange) return { [providerPath]: value };
  const ratio = (outputRange.max - outputRange.min) / (inputRange.max - inputRange.min);
  return { [providerPath]: Math.round((value - inputRange.min) * ratio + outputRange.min) };
}

function transformEnumMap(value, providerPath, enumMap) {
  if (enumMap && enumMap[value]) return { [providerPath]: enumMap[value] };
  return null;
}

function transformNestedPath(value, providerPath) {
  const result = {};
  const paths = providerPath.split('.');
  let current = result;
  for (let i = 0; i < paths.length - 1; i++) {
    if (!current[paths[i]]) current[paths[i]] = {};
    current = current[paths[i]];
  }
  current[paths[paths.length - 1]] = value;
  return result;
}

function applyValueTransform(resultValue, valueTransform) {
  if (!valueTransform || resultValue === undefined) return resultValue;
  if (valueTransform === 'toInteger') return parseInt(resultValue, 10);
  return resultValue;
}

// ==================== 编译函数 ====================

function compileField(fieldKey, platformField, serviceOverride, providerMapping) {
  // 状态推断：manifest 中声明的字段默认 supported；未声明的默认 unsupported
  const implicitStatus = serviceOverride
    ? SupportStatus.SUPPORTED   // 字段在 manifest 中（有覆盖/映射/锁定值）→ 默认支持
    : SupportStatus.UNSUPPORTED; // 字段不在 manifest 中 → 默认不支持

  const compiled = {
    key: fieldKey,
    displayName: platformField?.displayName || fieldKey,
    description: platformField?.description || '',
    type: platformField?.type || 'string',
    category: platformField?.category || 'core',

    status: serviceOverride?.status === 'required'
      ? SupportStatus.SUPPORTED
      : (serviceOverride?.status || implicitStatus),

    required: serviceOverride?.status === 'required' || platformField?.required || false,

    defaultValue: serviceOverride?.defaultOverride ?? platformField?.platformDefault,
    range: serviceOverride?.rangeOverride ?? platformField?.platformRange,
    values: serviceOverride?.validationOverride?.enum ?? platformField?.platformValues,

    ui: { ...platformField?.ui, ...serviceOverride?.ui },
    validation: { ...platformField?.validation, ...serviceOverride?.validationOverride },

    lockedValue: serviceOverride?.lockedValue,
    lockedValueSource: serviceOverride?.lockedValueSource,

    mapping: providerMapping || null,
    platformNested: platformField?.nestedFields || null,
    reason: serviceOverride?.reason,

    provenance: {
      hasPlatformDef: !!platformField,
      hasServiceOverride: !!serviceOverride,
      hasProviderMapping: !!providerMapping
    }
  };

  return compiled;
}

function compileNestedFields(platformNested, manifestNested, parentMapping) {
  const allKeys = new Set([
    ...Object.keys(platformNested || {}),
    ...Object.keys(manifestNested || {})
  ]);

  const nestedFields = [];

  for (const nestedKey of allKeys) {
    const platformDef = platformNested?.[nestedKey] || {};
    const manifestDef = manifestNested?.[nestedKey] || {};
    const nestedMapping = parentMapping?.nestedMappings?.[nestedKey];

    nestedFields.push({
      key: nestedKey,
      fullKey: nestedKey,
      displayName: manifestDef.displayName || platformDef.displayName || nestedKey,
      description: platformDef.description || '',
      type: platformDef.type || 'number',
      status: manifestDef.status || SupportStatus.SUPPORTED,
      defaultValue: manifestDef.defaultOverride ?? platformDef.platformDefault,
      range: manifestDef.rangeOverride ?? platformDef.platformRange,
      values: manifestDef.validationOverride?.enum ?? platformDef.platformValues,
      ui: { ...platformDef.ui, ...manifestDef.ui },
      mapping: nestedMapping || null
    });
  }

  return nestedFields;
}

function checkConflicts(compiledField) {
  for (const rule of ConflictRules) {
    if (rule.check(compiledField)) {
      throw new Error(
        `[CapabilityCompiler] 字段冲突 [${compiledField.key}]: ${rule.message}`
      );
    }
  }
}

function generateValidator(compiledField) {
  return (value) => {
    if (compiledField.status === SupportStatus.UNSUPPORTED && value !== undefined) {
      const msg = compiledField.reason || `此服务商不支持参数 ${compiledField.key}`;
      return { valid: false, error: msg };
    }

    if (value === undefined || value === null) return { valid: true };

    if (compiledField.type === 'number' && typeof value !== 'number') {
      return { valid: false, error: `${compiledField.key} 必须是数字` };
    }

    if (compiledField.type === 'string' && typeof value !== 'string') {
      return { valid: false, error: `${compiledField.key} 必须是字符串` };
    }

    if (compiledField.range && typeof value === 'number') {
      const { min, max } = compiledField.range;
      if (value < min || value > max) {
        return { valid: false, error: `${compiledField.key} 必须在 ${min} - ${max} 之间` };
      }
    }

    if (compiledField.values && compiledField.type === 'enum') {
      if (!compiledField.values.includes(value)) {
        return { valid: false, error: `${compiledField.key} 必须是以下值之一: ${compiledField.values.join(', ')}` };
      }
    }

    return { valid: true };
  };
}

/**
 * 生成字段映射器
 * 每种 transform 类型调用对应的独立函数
 */
function generateMapper(compiledField, apiStructure) {
  const mapping = compiledField.mapping;
  if (!mapping || mapping.transform === 'ignore') return null;

  return (value, context) => {
    let result;
    const providerPath = mapping.providerPath;

    switch (mapping.transform) {
      case 'direct':
        result = transformDirect(value, providerPath);
        break;
      case 'rename':
        result = transformRename(value, providerPath);
        break;
      case 'linear':
        result = transformLinear(value, providerPath, mapping.transformConfig);
        break;
      case 'enumMap':
        result = transformEnumMap(value, providerPath, mapping.enumMap);
        break;
      case 'nestedPath':
        result = transformNestedPath(value, providerPath);
        break;
      default:
        result = { [providerPath]: value };
    }

    if (!result) return null;

    if (mapping.source && context?.[mapping.source] !== undefined) {
      result[providerPath] = context[mapping.source];
    }

    if (mapping.valueTransform) {
      result[providerPath] = applyValueTransform(result[providerPath], mapping.valueTransform);
    }

    return result;
  };
}

// ==================== CapabilityCompiler 对象 ====================

const CapabilityCompiler = {
  compile(serviceKey, providerKey, operation = 'synthesize') {
    const cacheKey = `${serviceKey}:${operation}`;
    const cached = registry.getCompiledCache(cacheKey);
    if (cached) return cached;

    console.log(`[CapabilityCompiler] 编译服务能力: ${serviceKey}/${operation}`);

    const platformFields = registry.getAllPlatformFields();
    const serviceOverrides = registry.getServiceOverrides(serviceKey, operation);
    const providerMappings = registry.getProviderMappings(providerKey, serviceKey);
    const apiStructure = registry.getProviderApiStructure(providerKey, serviceKey);

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

      checkConflicts(compiled);

      compiled.validator = generateValidator(compiled);
      compiled.mapper = generateMapper(compiled, apiStructure);

      if (platformField.type === 'object' &&
          (platformField.nestedFields || serviceOverride?.nestedFields)) {
        compiled.nestedFields = compileNestedFields(
          platformField?.nestedFields,
          serviceOverride?.nestedFields,
          providerMapping
        );
      }

      compiledFields[fieldKey] = compiled;

      const status = compiled.status;
      if (fieldIndex[status]) fieldIndex[status].push(fieldKey);
    }

    const compiled = {
      serviceKey,
      providerKey,
      operation,
      compiledSchema: compiledFields,
      compiledUiSchema: this._buildUiSchema(compiledFields, registry.getUiGroups()),
      compiledDefaults: this._extractDefaults(compiledFields),
      compiledLockedParams: this._extractLockedParams(compiledFields),
      compiledFieldIndex: fieldIndex,
      apiStructure,
      // streaming flags（从 manifest 读取，供 getCapabilities() 推导）
      capabilityStreaming: this._getStreamingFlag(serviceKey, 'supportsStreaming'),
      capabilityRealtime: this._getStreamingFlag(serviceKey, 'supportsRealtime'),
      compiledAt: new Date().toISOString(),
      version: '1.0.0'
    };

    registry.setCompiledCache(cacheKey, compiled);

    console.log(`[CapabilityCompiler] 编译完成: ${fieldIndex.supported.length} supported, ${fieldIndex.unsupported.length} unsupported, ${fieldIndex.locked.length} locked`);

    return compiled;
  },

  compileAll(providerRegistry) {
    const { ProviderManifest } = require('../providers/manifests/ProviderManifest');
    const serviceKeys = ProviderManifest.getAllServiceKeys();
    const results = {};
    const errors = [];

    for (const serviceKey of serviceKeys) {
      try {
        const descriptor = providerRegistry.get(serviceKey);
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

  _buildUiSchema(compiledFields, uiGroups) {
    const schema = { groups: {}, fields: {} };

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

    schema.groups = Object.values(schema.groups).sort((a, b) => a.order - b.order);
    return schema;
  },

  _extractDefaults(compiledFields) {
    const defaults = {};

    for (const [fieldKey, field] of Object.entries(compiledFields)) {
      if (field.status === SupportStatus.UNSUPPORTED) continue;

      if (field.nestedFields && Array.isArray(field.nestedFields)) {
        const nestedDefaults = {};
        for (const nestedField of field.nestedFields) {
          if (nestedField.status === SupportStatus.UNSUPPORTED) continue;
          if (nestedField.defaultValue !== undefined) {
            nestedDefaults[nestedField.key] = nestedField.defaultValue;
          }
        }
        if (Object.keys(nestedDefaults).length > 0) {
          defaults[fieldKey] = nestedDefaults;
        }
        continue;
      }

      if (field.defaultValue !== undefined) {
        defaults[fieldKey] = field.defaultValue;
      }
    }

    return defaults;
  },

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
  },

  _getStreamingFlag(serviceKey, flagKey) {
    try {
      const { ProviderManifest } = require('../providers/manifests/ProviderManifest');
      const svc = ProviderManifest.getServiceConfig(serviceKey);
      return svc?.[flagKey] || false;
    } catch (e) { return false; }
  }
};

module.exports = {
  CapabilityCompiler,
  SupportStatus,
  transformDirect,
  transformRename,
  transformLinear,
  transformEnumMap,
  transformNestedPath,
  applyValueTransform
};