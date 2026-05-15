/**
 * CapabilityResolver - 能力解析器
 *
 * 运行时只读 CompiledCapability（启动时编译的缓存），
 * 不再直接读 manifest 原始数据。
 *
 * 依赖由构造函数注入，启动时立即校验可用性。
 *
 * 签名（向后兼容）：
 *   resolve(serviceKey, modelKey, voiceRuntime)           // 旧
 *   resolve({ serviceKey, modelKey, voiceRuntime,          // 新
 *             mode, inputFormat, voiceCode })
 *
 * 输出：CapabilityContext（包含 compiled、默认值、锁定参数、apiStructure、
 *       executionModes、inputFormats、outputFormats）
 */

const CapabilitySchema = require('../schema/CapabilitySchema');

class CapabilityResolver {
  /**
   * @param {Object} deps
   * @param {Function} deps.getCompiledCapability - FieldDefinitionSystem.getCompiledCapability
   * @param {Object} deps.providerRegistry - ProviderRegistry 实例
   * @param {Object} [deps.cache] - 可选的缓存 Map（测试用）
   */
  constructor({ getCompiledCapability, providerRegistry, cache }) {
    if (!getCompiledCapability || typeof getCompiledCapability !== 'function') {
      throw new Error('[CapabilityResolver] 需要 getCompiledCapability 函数');
    }
    if (!providerRegistry) {
      throw new Error('[CapabilityResolver] 需要 providerRegistry 实例');
    }
    this._getCompiledCapability = getCompiledCapability;
    this._providerRegistry = providerRegistry;
    this.cache = cache || new Map();
  }

  /**
   * @param {string|Object} serviceKeyOrOpts — canonical serviceKey 或 resolve options
   * @param {string|null} [modelKey] — 旧签名第二参数
   * @param {Object|null} [voiceRuntime] — 旧签名第三参数
   */
  resolve(serviceKeyOrOpts, modelKey = null, voiceRuntime = null) {
    // 对象化签名兼容
    let serviceKey, mode, inputFormat, voiceCode;
    if (typeof serviceKeyOrOpts === 'object' && serviceKeyOrOpts !== null) {
      ({ serviceKey, modelKey = null, voiceRuntime = null, mode = null, inputFormat = null, voiceCode = null } = serviceKeyOrOpts);
    } else {
      serviceKey = serviceKeyOrOpts;
    }

    const cacheKey = [serviceKey, modelKey, mode, inputFormat, voiceCode].filter(Boolean).join('|') || serviceKey;

    if (this.cache.has(cacheKey)) return this._enrich(this.cache.get(cacheKey), voiceRuntime);

    const desc = this._providerRegistry.get(serviceKey);
    if (!desc) throw new Error(`[CapabilityResolver] Unknown service: ${serviceKey}`);

    const compiled = this._getCompiledCapability(serviceKey, desc.provider);
    if (!compiled) throw new Error(`[CapabilityResolver] No compiled capability for: ${serviceKey}`);

    const context = {
      serviceKey,
      modelKey,
      mode,
      inputFormat,
      voiceCode,
      compiled,
      resolvedDefaults: compiled.getDefaults(),
      lockedParams: Object.keys(compiled.getLockedParams()),
      lockedParamsMap: compiled.getLockedParams(),
      defaultVoiceId: CapabilitySchema.getDefaultVoiceId(serviceKey) || null,
      apiStructure: compiled.apiStructure,
      executionModes: compiled.executionModes || {},
      inputFormats: compiled.inputFormats || [],
      outputFormats: compiled.outputFormats || [],
      contextualDigest: compiled.getContextualDigest({ modelKey, mode, inputFormat, voiceCode })
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

module.exports = { CapabilityResolver };