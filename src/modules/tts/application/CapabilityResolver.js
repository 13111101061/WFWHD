/**
 * CapabilityResolver - 能力解析器
 *
 * 统一读取服务能力、模型能力、音色默认配置、锁定规则
 * 将分散在各处的能力规则统一收口
 *
 * [重构] 优先使用 CompiledCapability，回退到旧配置
 * [fail-fast] 新系统编译失败时直接抛错，不静默回退
 *
 * 输入：serviceKey, modelKey, voiceRuntime
 * 输出：CapabilityContext
 */

const CapabilitySchema = require('../schema/CapabilitySchema');
const { ProviderCatalog } = require('../catalog/ProviderCatalog');
const ttsDefaults = require('../config/ttsDefaults');

// 新系统导入
let FieldDefinitionSystem = null;
let getCompiledCapability = null;
let systemInitialized = false;
let initError = null;

// fail-fast 配置
const FAIL_FAST = process.env.TTS_FIELD_SYSTEM_FAIL_FAST !== 'false';

function _ensureFieldDefinitionSystem() {
  if (systemInitialized) return;

  if (!FieldDefinitionSystem) {
    try {
      FieldDefinitionSystem = require('../config/FieldDefinitionSystem');
      getCompiledCapability = FieldDefinitionSystem.getCompiledCapability;
      systemInitialized = true;
    } catch (e) {
      initError = e;
      if (FAIL_FAST) {
        throw new Error(`[CapabilityResolver] FieldDefinitionSystem 未初始化: ${e.message}`);
      }
      // 非 fail-fast 模式：继续使用旧逻辑
    }
  }
}

/**
 * @typedef {Object} CapabilityContext - CapabilityResolver 输出
 * @property {string} serviceKey - 服务标识
 * @property {Object} serviceCapabilities - 服务能力配置
 * @property {Object} modelCapabilities - 模型能力配置（可选）
 * @property {Object} providerCapabilities - ProviderCatalog 能力（向后兼容）
 * @property {Object} mergedDefaults - 合并后的默认值
 * @property {Object} voiceDefaults - 音色默认值
 * @property {string[]} lockedParams - 锁定参数列表
 * @property {Object} parameterSupport - 参数支持状态
 */

class CapabilityResolver {
  constructor() {
    this.cache = new Map();
  }

  /**
   * 解析能力上下文
   * @param {string} serviceKey - 服务标识（如 'moss_tts'）
   * @param {string} [modelKey] - 模型标识（如 'moss-tts'）
   * @param {Object} [voiceRuntime] - 音色运行时配置
   * @returns {CapabilityContext}
   */
  resolve(serviceKey, modelKey = null, voiceRuntime = null) {
    const cacheKey = `${serviceKey}:${modelKey || 'default'}`;

    // 检查缓存
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      return this._applyVoiceRuntime(cached, voiceRuntime);
    }

    // [优先] 尝试使用新系统 CompiledCapability
    _ensureFieldDefinitionSystem();
    if (getCompiledCapability) {
      try {
        const compiled = this._tryGetCompiledCapability(serviceKey);
        if (compiled) {
          const context = this._buildContextFromCompiled(compiled, serviceKey, voiceRuntime);
          this.cache.set(cacheKey, context);
          return this._applyVoiceRuntime(context, voiceRuntime);
        }
      } catch (e) {
        if (FAIL_FAST) {
          throw new Error(`[CapabilityResolver] CompiledCapability 解析失败: ${e.message}`);
        }
        console.warn(`[CapabilityResolver] CompiledCapability 失败，回退到旧逻辑: ${e.message}`);
      }
    }

    // [回退] 使用旧的 CapabilitySchema 逻辑
    return this._resolveLegacy(serviceKey, modelKey, voiceRuntime);
  }

  /**
   * 尝试获取 CompiledCapability
   * @private
   */
  _tryGetCompiledCapability(serviceKey) {
    const descriptor = ProviderCatalog.get(serviceKey);
    if (!descriptor) return null;

    return getCompiledCapability(serviceKey, descriptor.provider);
  }

  /**
   * 从 CompiledCapability 构建上下文
   * @private
   */
  _buildContextFromCompiled(compiled, serviceKey, voiceRuntime) {
    // 从旧配置获取 defaultVoiceId（新系统暂不定义此字段）
    const legacyDefaultVoiceId = CapabilitySchema.getDefaultVoiceId(serviceKey);

    return {
      serviceKey,
      // [新系统] CompiledCapability 实例
      compiled,
      // 默认值
      resolvedDefaults: compiled.getDefaults(),
      mergedDefaults: compiled.getDefaults(),
      // 锁定参数
      lockedParams: Object.keys(compiled.getLockedParams()),
      lockedParamsMap: compiled.getLockedParams(),
      // 参数支持状态
      parameterSupport: this._buildParameterSupportFromCompiled(compiled),
      // 元数据（包含 defaultVoiceId）
      metadata: {
        displayName: compiled.getField('text')?.displayName,
        apiStructure: compiled.apiStructure,
        defaultVoiceId: legacyDefaultVoiceId
      },
      // 向后兼容字段
      serviceCapabilities: null,
      modelCapabilities: null,
      providerCapabilities: null,
      voiceDefaults: {}
    };
  }

  /**
   * 从 CompiledCapability 构建参数支持状态
   * @private
   */
  _buildParameterSupportFromCompiled(compiled) {
    const support = {};
    const schema = compiled.getSchema();

    for (const [param, field] of Object.entries(schema)) {
      // supported: supported/locked/hidden 都是"支持"，只有 unsupported 才是不支持
      const isSupported = field.status !== 'unsupported';
      support[param] = {
        supported: isSupported,
        status: field.status,
        config: {
          type: field.type,
          range: field.range,
          values: field.values,
          description: field.reason
        }
      };
    }

    return support;
  }

  /**
   * 使用旧逻辑解析（回退路径）
   * @private
   */
  _resolveLegacy(serviceKey, modelKey = null, voiceRuntime = null) {
    const cacheKey = `${serviceKey}:${modelKey || 'default'}`;

    // 1. 获取平台默认值
    const platformDefaults = CapabilitySchema.getPlatformDefaults();

    // 2. 获取服务能力配置
    const serviceCapabilities = CapabilitySchema.getServiceCapabilities(serviceKey);

    if (!serviceCapabilities) {
      console.warn(`[CapabilityResolver] Unknown service: ${serviceKey}`);
      return this._createFallbackContext(serviceKey, voiceRuntime);
    }

    // 3. 获取模型能力配置（如果有）
    const actualModelKey = modelKey || serviceCapabilities.defaults?.model;
    const modelCapabilities = actualModelKey
      ? CapabilitySchema.getModelCapabilities(actualModelKey)
      : null;

    // 4. 获取 ProviderCatalog 能力（向后兼容）
    const providerCapabilities = ProviderCatalog.getCapabilities(serviceKey);

    // 5. 获取 ttsDefaults 中的默认值（向后兼容）
    const legacyDefaults = ttsDefaults.getDefaults(serviceKey);

    // 6. 合并默认值（优先级：服务 > 平台）
    // 注意：只合并"参数默认值"，不合并"元数据字段"
    const mergedDefaults = this._mergeDefaults(
      platformDefaults,
      serviceCapabilities.defaults,
      modelCapabilities?.defaults,
      legacyDefaults
    );

    // 7. 获取锁定参数
    const lockedParams = CapabilitySchema.getLockedParamsForService(serviceKey);

    // 8. 构建参数支持状态
    const parameterSupport = this._buildParameterSupport(
      serviceCapabilities,
      modelCapabilities,
      providerCapabilities
    );

    // 9. 提取元数据（展示字段，不进入执行参数）
    const metadata = this._extractMetadata(serviceCapabilities, modelCapabilities);

    // 10. resolvedDefaults 只包含可执行参数
    const resolvedDefaults = mergedDefaults;

    const context = {
      serviceKey,
      // [新结构] 可执行默认参数（已过滤元数据）
      resolvedDefaults,
      // [新结构] 展示元数据（不进入执行参数）
      metadata,
      // 参数支持状态
      parameterSupport,
      // 锁定参数
      lockedParams,
      // [保留] 原始能力配置（向后兼容）
      serviceCapabilities,
      modelCapabilities,
      providerCapabilities,
      // [deprecated] 使用 resolvedDefaults
      mergedDefaults
    };

    // 缓存结果
    this.cache.set(cacheKey, context);

    return this._applyVoiceRuntime(context, voiceRuntime);
  }

  /**
   * 提取元数据（展示字段）
   * @private
   */
  _extractMetadata(serviceCapabilities, modelCapabilities) {
    return {
      displayName: serviceCapabilities?.displayName,
      description: serviceCapabilities?.description,
      status: serviceCapabilities?.status,
      defaultVoiceId: serviceCapabilities?.defaultVoiceId,
      provider: serviceCapabilities?.provider,
      service: serviceCapabilities?.service
    };
  }

  /**
   * 应用音色运行时配置
   * @param {Object} context - 基础上下文
   * @param {Object} voiceRuntime - 音色运行时配置
   * @returns {CapabilityContext}
   *
   * [修复] providerOptions 不进入 resolvedDefaults
   * - resolvedDefaults 只包含平台标准参数
   * - providerOptions 单独传递，由 ParameterMapper 处理
   */
  _applyVoiceRuntime(context, voiceRuntime) {
    if (!voiceRuntime) {
      return {
        ...context,
        voiceDefaults: {},
        providerOptions: {}
      };
    }

    // 从音色运行时提取默认值
    const voiceDefaults = { ...voiceRuntime };

    // 删除非参数字段
    delete voiceDefaults.voiceId;
    delete voiceDefaults.model;
    delete voiceDefaults.providerOptions;  // 单独处理

    // 提取 providerOptions（服务商专属参数，不进入 resolvedDefaults）
    const providerOptions = voiceRuntime.providerOptions || {};

    return {
      ...context,
      voiceDefaults,
      providerOptions,
      // resolvedDefaults 只包含平台标准参数（不包含 providerOptions）
      resolvedDefaults: {
        ...context.resolvedDefaults,
        ...voiceDefaults
      },
      // 保持 mergedDefaults 向后兼容
      mergedDefaults: {
        ...context.mergedDefaults,
        ...voiceDefaults,
        ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {})
      }
    };
  }

  /**
   * 创建兜底上下文（未知服务）
   * @param {string} serviceKey - 服务标识
   * @param {Object} voiceRuntime - 音色运行时配置
   * @returns {CapabilityContext}
   */
  _createFallbackContext(serviceKey, voiceRuntime) {
    const platformDefaults = CapabilitySchema.getPlatformDefaults();

    return {
      serviceKey,
      resolvedDefaults: platformDefaults,
      metadata: {},
      serviceCapabilities: null,
      modelCapabilities: null,
      providerCapabilities: null,
      mergedDefaults: platformDefaults,
      voiceDefaults: {},
      lockedParams: ['voice', 'model'],
      parameterSupport: {}
    };
  }

  /**
   * 构建参数支持状态
   * @param {Object} serviceCapabilities - 服务能力配置
   * @param {Object} modelCapabilities - 模型能力配置
   * @param {Object} providerCapabilities - Provider 能力
   * @returns {Object}
   */
  _buildParameterSupport(serviceCapabilities, modelCapabilities, providerCapabilities) {
    const support = {};

    // 从服务配置的 parameters 字段读取
    if (serviceCapabilities?.parameters) {
      for (const [param, config] of Object.entries(serviceCapabilities.parameters)) {
        support[param] = {
          supported: config.supported !== false,
          config
        };
      }
    }

    // 从服务配置的 capabilities 字段读取（传统方式）
    if (serviceCapabilities?.capabilities) {
      const caps = serviceCapabilities.capabilities;

      // 语速
      if (caps.speedAdjustable !== undefined) {
        support.speed = support.speed || {};
        support.speed.supported = caps.speedAdjustable;
      }

      // 音调
      if (caps.pitchAdjustable !== undefined) {
        support.pitch = support.pitch || {};
        support.pitch.supported = caps.pitchAdjustable;
      }

      // 音量
      if (caps.volumeAdjustable !== undefined) {
        support.volume = support.volume || {};
        support.volume.supported = caps.volumeAdjustable;
      }

      // 情感
      if (caps.emotion !== undefined) {
        support.emotion = support.emotion || {};
        support.emotion.supported = caps.emotion;
      }

      // 采样参数（MOSS 特有）
      if (caps.samplingParams !== undefined) {
        support.samplingParams = support.samplingParams || {};
        support.samplingParams.supported = caps.samplingParams;
      }

      // 期望时长（MOSS 特有）
      if (caps.expectedDuration !== undefined) {
        support.expectedDurationSec = support.expectedDurationSec || {};
        support.expectedDurationSec.supported = caps.expectedDuration;
      }
    }

    return support;
  }

  /**
   * 合并默认值，排除元数据字段
   * @private
   */
  _mergeDefaults(platformDefaults, serviceDefaults, modelDefaults, legacyDefaults) {
    // 这些是"元数据/展示字段"，不应该进入参数默认值
    const metadataFields = new Set([
      'defaultVoiceId',      // 默认音色ID（元数据）
      'displayName',         // 显示名称
      'description',         // 描述
      'status',              // 状态
      'aliases',             // 别名列表
      'provider',            // 服务商标识（元数据）
      'service'              // 服务标识（元数据）
    ]);

    const filterMetadata = (obj) => {
      if (!obj) return {};
      const filtered = {};
      for (const [key, value] of Object.entries(obj)) {
        if (!metadataFields.has(key)) {
          filtered[key] = value;
        }
      }
      return filtered;
    };

    // 按优先级合并：平台 < 服务 < 模型 < legacy（ttsDefaults）
    return {
      ...filterMetadata(platformDefaults),
      ...filterMetadata(serviceDefaults),
      ...filterMetadata(modelDefaults),
      ...filterMetadata(legacyDefaults)
    };
  }

  /**
   * 检查参数是否支持
   * @param {string} serviceKey - 服务标识
   * @param {string} paramName - 参数名
   * @returns {boolean}
   */
  isParameterSupported(serviceKey, paramName) {
    const context = this.resolve(serviceKey);
    return context.parameterSupport[paramName]?.supported ?? false;
  }

  /**
   * 获取服务的默认值
   * @param {string} serviceKey - 服务标识
   * @returns {Object}
   */
  getDefaults(serviceKey) {
    const context = this.resolve(serviceKey);
    return context.mergedDefaults;
  }

  /**
   * 获取锁定参数列表
   * @param {string} serviceKey - 服务标识
   * @returns {string[]}
   */
  getLockedParams(serviceKey) {
    const context = this.resolve(serviceKey);
    return context.lockedParams;
  }

  /**
   * 获取服务的默认音色ID
   * @param {string} serviceKey - 服务标识
   * @returns {string|null}
   */
  getDefaultVoiceId(serviceKey) {
    // [优先] 从 CompiledCapability 获取
    _ensureFieldDefinitionSystem();
    if (getCompiledCapability) {
      try {
        const compiled = this._tryGetCompiledCapability(serviceKey);
        if (compiled) {
          // 从 context.metadata 或服务配置中获取
          const context = this.resolve(serviceKey);
          return context.metadata?.defaultVoiceId || null;
        }
      } catch (e) {
        // 回退到旧逻辑
      }
    }

    // [回退] 使用 CapabilitySchema
    return CapabilitySchema.getDefaultVoiceId(serviceKey);
  }

  /**
   * 获取参数配置
   * @param {string} serviceKey - 服务标识
   * @param {string} paramName - 参数名
   * @returns {Object|null}
   */
  getParameterConfig(serviceKey, paramName) {
    // [优先] 从 CompiledCapability 获取
    _ensureFieldDefinitionSystem();
    if (getCompiledCapability) {
      try {
        const compiled = this._tryGetCompiledCapability(serviceKey);
        if (compiled) {
          const field = compiled.getField(paramName);
          if (field) {
            // supported: supported/locked/hidden 都是"支持"，只有 unsupported 才是不支持
            // locked = 支持但不允许用户改
            // hidden = 后端支持但前端不展示
            const isSupported = field.status !== 'unsupported';
            return {
              type: field.type,
              supported: isSupported,
              status: field.status,
              range: field.range,
              values: field.values,
              description: field.reason || field.description
            };
          }
        }
      } catch (e) {
        // 回退到旧逻辑
      }
    }

    // [回退] 使用 CapabilitySchema
    return CapabilitySchema.getParameterConfig(serviceKey, paramName);
  }

  /**
   * 验证参数值
   * @param {string} serviceKey - 服务标识
   * @param {string} paramName - 参数名
   * @param {*} value - 参数值
   * @returns {{ valid: boolean, error?: string }}
   */
  validateParameter(serviceKey, paramName, value) {
    // [优先] 使用 CompiledCapability 校验
    _ensureFieldDefinitionSystem();
    if (getCompiledCapability) {
      try {
        const compiled = this._tryGetCompiledCapability(serviceKey);
        if (compiled) {
          const field = compiled.getField(paramName);
          if (!field) {
            return { valid: true }; // 未知参数允许通过
          }

          // 检查是否支持
          if (field.status === 'unsupported') {
            return {
              valid: false,
              error: field.reason || `参数 ${paramName} 不被当前服务支持`
            };
          }

          // 类型检查
          if (field.type && value !== undefined && value !== null) {
            if (field.type === 'number' && typeof value !== 'number') {
              return { valid: false, error: `${paramName} 必须是数字` };
            }
            if (field.type === 'string' && typeof value !== 'string') {
              return { valid: false, error: `${paramName} 必须是字符串` };
            }
            if (field.type === 'object' && typeof value !== 'object') {
              return { valid: false, error: `${paramName} 必须是对象` };
            }
          }

          // 范围检查
          if (field.range && typeof value === 'number') {
            if (value < field.range.min || value > field.range.max) {
              return {
                valid: false,
                error: `${paramName} 必须在 ${field.range.min} 到 ${field.range.max} 之间`
              };
            }
          }

          // 枚举检查
          if (field.type === 'enum' && field.values && value !== undefined) {
            if (!field.values.includes(value)) {
              return {
                valid: false,
                error: `${paramName} 必须是 [${field.values.join(', ')}] 之一`
              };
            }
          }

          return { valid: true };
        }
      } catch (e) {
        // 回退到旧逻辑
      }
    }

    // [回退] 使用旧的 CapabilitySchema 逻辑
    const paramConfig = CapabilitySchema.getParameterConfig(serviceKey, paramName);

    if (!paramConfig) {
      // 参数未定义，允许通过（可能是扩展参数）
      return { valid: true };
    }

    // 检查是否支持
    if (paramConfig.supported === false) {
      return {
        valid: false,
        error: paramConfig.description || `参数 ${paramName} 不被当前服务支持`
      };
    }

    // 类型检查
    if (paramConfig.type && value !== undefined && value !== null) {
      if (paramConfig.type === 'number' && typeof value !== 'number') {
        return { valid: false, error: `${paramName} 必须是数字` };
      }
      if (paramConfig.type === 'string' && typeof value !== 'string') {
        return { valid: false, error: `${paramName} 必须是字符串` };
      }
      if (paramConfig.type === 'object' && typeof value !== 'object') {
        return { valid: false, error: `${paramName} 必须是对象` };
      }
    }

    // 范围检查
    if (paramConfig.range && typeof value === 'number') {
      if (value < paramConfig.range.min || value > paramConfig.range.max) {
        return {
          valid: false,
          error: `${paramName} 必须在 ${paramConfig.range.min} 到 ${paramConfig.range.max} 之间`
        };
      }
    }

    // 枚举检查
    if (paramConfig.type === 'enum' && paramConfig.values && value !== undefined) {
      if (!paramConfig.values.includes(value)) {
        return {
          valid: false,
          error: `${paramName} 必须是 [${paramConfig.values.join(', ')}] 之一`
        };
      }
    }

    return { valid: true };
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   * @returns {Object}
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// 导出单例
const capabilityResolver = new CapabilityResolver();

module.exports = {
  CapabilityResolver,
  capabilityResolver
};
