/**
 * ParameterMapper - 参数映射器
 *
 * 将平台标准参数映射为服务商 API 参数。
 * 映射规则来自 ProviderManifest（唯一事实源）。
 * 通过 FieldDefinitionSystem 的 CompiledCapability 执行实际映射。
 *
 * 环境变量：
 * - TTS_STRICT_MAPPER: 映射失败时抛错（默认：跟随 CONFIG_MODE，strict 时为 true）
 * - TTS_FIELD_SYSTEM_FAIL_FAST: FieldDefinitionSystem 不可用时抛错（默认：true）
 */

const { ProviderDescriptorRegistry } = require('../provider-management/ProviderDescriptorRegistry');

let FieldDefinitionSystem = null;
let getCompiledCapability = null;
const FAIL_FAST = process.env.TTS_FIELD_SYSTEM_FAIL_FAST !== 'false';

function _isStrictMode() {
  return process.env.TTS_STRICT_MAPPER === 'true' ||
         process.env.CONFIG_MODE === 'strict' ||
         process.env.TTS_STRICT_MAPPER !== 'false';
}

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
        console.error(`[ParameterMapper] 映射执行错误: ${e.message}`);
        const msg = `[ParameterMapper] 映射失败 [${serviceKey}]: ${e.message}`;
        if (_isStrictMode()) {
          const err = new Error(msg);
          err.code = 'PARAMETER_MAPPING_ERROR';
          throw err;
        }
        console.warn(`⚠️ ${msg} — 参数将原样透传（非严格模式）`);
      }
    }

    if (_isStrictMode()) {
      const err = new Error(
        `[ParameterMapper] 无法获取编译能力 [${serviceKey}] — ` +
        '请确认 CONFIG_MODE=strict 下所有 manifest 解析正确，或设为 CONFIG_MODE=migration'
      );
      err.code = 'PARAMETER_MAPPING_ERROR';
      throw err;
    }

    console.warn(`[ParameterMapper] 无法获取编译能力，参数原样透传: ${serviceKey}`);
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
