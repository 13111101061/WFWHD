/**
 * CapabilityResolver - 能力解析器
 *
 * 运行时只读 CompiledCapability（启动时编译的缓存），
 * 不再直接读 manifest 原始数据。
 *
 * 输入：serviceKey, modelKey, voiceRuntime
 * 输出：CapabilityContext + 参数支持检查 + unsupported 用户输入检测
 */

const CapabilitySchema = require('../schema/CapabilitySchema');
const { ProviderDescriptorRegistry } = require('../provider-management/ProviderDescriptorRegistry');

let FieldDefinitionSystem = null;
let getCompiledCapability = null;
let initialized = false;

function _ensureSystem() {
  if (initialized) return;
  try {
    FieldDefinitionSystem = require('../config/FieldDefinitionSystem');
    getCompiledCapability = FieldDefinitionSystem.getCompiledCapability;
    initialized = true;
  } catch (e) {
    throw new Error(`[CapabilityResolver] FieldDefinitionSystem 不可用: ${e.message}`);
  }
}

function _getCompiled(serviceKey) {
  _ensureSystem();
  const desc = ProviderDescriptorRegistry.get(serviceKey);
  if (!desc) throw new Error(`[CapabilityResolver] Unknown service: ${serviceKey}`);
  const compiled = getCompiledCapability(serviceKey, desc.provider);
  if (!compiled) throw new Error(`[CapabilityResolver] No compiled capability for: ${serviceKey}`);
  return compiled;
}

class CapabilityResolver {
  constructor() {
    this.cache = new Map();
  }

  /**
   * 解析能力上下文（运行时入口）
   */
  resolve(serviceKey, modelKey = null, voiceRuntime = null) {
    const cacheKey = serviceKey;  // modelKey 不影响当前的能力上下文解析，服务级缓存即可

    if (this.cache.has(cacheKey)) return this._enrich(this.cache.get(cacheKey), voiceRuntime);

    const compiled = _getCompiled(serviceKey);

    const context = {
      serviceKey,
      compiled,
      resolvedDefaults: compiled.getDefaults(),
      lockedParams: Object.keys(compiled.getLockedParams()),
      lockedParamsMap: compiled.getLockedParams(),
      parameterSupport: this._buildParamSupport(compiled),
      defaultVoiceId: CapabilitySchema.getDefaultVoiceId(serviceKey) || null,
      apiStructure: compiled.apiStructure
    };

    this.cache.set(cacheKey, context);
    return this._enrich(context, voiceRuntime);
  }

  /**
   * 检查用户输入中是否有服务商不支持的参数
   * @returns {Array<{field, reason}>} warnings
   */
  checkUnsupportedInput(serviceKey, userParams = {}) {
    const context = this.resolve(serviceKey);
    const warnings = [];
    for (const [k, v] of Object.entries(userParams)) {
      if (v === undefined || v === null) continue;
      const support = context.parameterSupport[k];
      if (support && !support.supported) {
        warnings.push({
          field: k,
          value: v,
          reason: support.reason || `${k} 不被 ${serviceKey} 支持`,
          action: 'ignored'
        });
      }
    }
    return warnings;
  }

  /**
   * 从 CompiledCapability 构建参数支持状态
   */
  _buildParamSupport(compiled) {
    const support = {};
    const schema = compiled.getSchema();
    for (const [param, field] of Object.entries(schema)) {
      support[param] = {
        supported: field.status !== 'unsupported',
        status: field.status,
        config: {
          type: field.type,
          range: field.range,
          values: field.values
        },
        reason: field.reason || '',
        onUserInput: field.onUserInput || (field.status === 'unsupported' ? 'warn' : null),
        mapTo: field.mapping?.providerPath || null
      };
    }
    return support;
  }

  _enrich(context, voiceRuntime) {
    if (!voiceRuntime) return context;
    return {
      ...context,
      voiceDefaults: voiceRuntime,
      providerOptions: voiceRuntime?.providerOptions || null
    };
  }

  /** 获取服务的默认值 */
  getDefaults(serviceKey) {
    return this.resolve(serviceKey).resolvedDefaults;
  }

  /** 清理缓存 */
  clearCache() { this.cache.clear(); }
}

const capabilityResolver = new CapabilityResolver();
module.exports = { CapabilityResolver, capabilityResolver };
