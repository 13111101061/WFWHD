/**
 * ParameterMapper - 参数映射器
 *
 * 将平台标准参数映射为服务商 API 参数。
 * 映射规则来自 ProviderManifest（唯一事实源）。
 * 通过 FieldDefinitionSystem 的 CompiledCapability 执行实际映射。
 */

const { ProviderDescriptorRegistry } = require('../provider-management/ProviderDescriptorRegistry');

let FieldDefinitionSystem = null;
let getCompiledCapability = null;
const FAIL_FAST = process.env.TTS_FIELD_SYSTEM_FAIL_FAST !== 'false';

function _ensureFieldDefinitionSystem() {
  if (!FieldDefinitionSystem) {
    try {
      FieldDefinitionSystem = require('./FieldDefinitionSystem');
      getCompiledCapability = FieldDefinitionSystem.getCompiledCapability;
    } catch (e) {
      if (FAIL_FAST) throw new Error(`[ParameterMapper] FieldDefinitionSystem 未初始化: ${e.message}`);
    }
  }
}

function _tryGetCompiledCapability(serviceKey) {
  const descriptor = ProviderDescriptorRegistry.get(serviceKey);
  if (!descriptor) return null;
  return getCompiledCapability(serviceKey, descriptor.provider);
}

class ParameterMapper {
  constructor() {
    this.loaded = false;
  }

  async initialize() {
    if (this.loaded) return;
    _ensureFieldDefinitionSystem();
    if (getCompiledCapability) {
      this.loaded = true;
      console.log('✅ ParameterMapper 初始化完成');
      return;
    }
    console.warn('⚠️ ParameterMapper: CompiledCapability 不可用，映射将透传');
    this.loaded = false;
  }

  /**
   * 将平台参数映射为 Provider API 参数
   */
  mapToProvider(serviceKey, platformParams = {}, context = {}) {
    _ensureFieldDefinitionSystem();
    if (getCompiledCapability) {
      try {
        const compiled = _tryGetCompiledCapability(serviceKey);
        if (compiled) return compiled.mapToProvider(platformParams, context);
      } catch (e) {
        if (FAIL_FAST) throw e;
        console.warn(`[ParameterMapper] 映射失败，回退透传: ${e.message}`);
      }
    }
    return { ...platformParams };
  }

  /**
   * 获取支持的参数列表（兼容旧接口）
   */
  getSupportedParameters(provider, serviceType) {
    const serviceKey = `${provider}_${serviceType}`;
    _ensureFieldDefinitionSystem();
    if (getCompiledCapability) {
      try {
        const compiled = _tryGetCompiledCapability(serviceKey);
        if (compiled) {
          const schema = compiled.getSchema();
          return Object.entries(schema)
            .filter(([, f]) => f.status !== 'unsupported')
            .map(([key, f]) => ({
              name: key, type: f.type,
              required: f.required || false,
              range: f.range, values: f.values,
              defaultValue: f.defaultValue
            }));
        }
      } catch (e) { /* fall through */ }
    }
    return [];
  }
}

const parameterMapper = new ParameterMapper();
module.exports = { ParameterMapper, parameterMapper };
