/**
 * CapabilityResolver - 能力解析器
 *
 * 运行时只读 CompiledCapability（启动时编译的缓存），
 * 不再直接读 manifest 原始数据。
 *
 * 输入：serviceKey, modelKey, voiceRuntime
 * 输出：CapabilityContext（包含 compiled、默认值、锁定参数、apiStructure）
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
    const cacheKey = serviceKey;

    if (this.cache.has(cacheKey)) return this._enrich(this.cache.get(cacheKey), voiceRuntime);

    const compiled = _getCompiled(serviceKey);

    const context = {
      serviceKey,
      compiled,
      resolvedDefaults: compiled.getDefaults(),
      lockedParams: Object.keys(compiled.getLockedParams()),
      lockedParamsMap: compiled.getLockedParams(),
      defaultVoiceId: CapabilitySchema.getDefaultVoiceId(serviceKey) || null,
      apiStructure: compiled.apiStructure
    };

    this.cache.set(cacheKey, context);
    return this._enrich(context, voiceRuntime);
  }

  _enrich(context, voiceRuntime) {
    if (!voiceRuntime) return context;
    return {
      ...context,
      voiceDefaults: voiceRuntime,
      providerOptions: voiceRuntime?.providerOptions || null
    };
  }

  getDefaults(serviceKey) {
    return this.resolve(serviceKey).resolvedDefaults;
  }

  clearCache() { this.cache.clear(); }
}

const capabilityResolver = new CapabilityResolver();
module.exports = { CapabilityResolver, capabilityResolver };