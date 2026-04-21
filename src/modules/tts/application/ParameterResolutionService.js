/**
 * ParameterResolutionService - 参数解析服务
 *
 * 核心职责：按固定优先级合并参数
 *
 * 参数优先级（从低到高）：
 * 1. 平台默认值 (platform)
 * 2. 服务默认值 (service)
 * 3. 模型默认值 (model)
 * 4. 音色默认值 (voice)
 * 5. 用户输入值 (user)
 * 6. 锁定参数回写 (locked) - 最高优先级
 *
 * 锁定参数包括：
 * - voice: 服务商真实音色ID，由 VoiceResolver 解析
 * - model: 模型标识，由 CapabilityResolver 或音色配置决定
 *
 * [重构] 支持 CompiledCapability 作为单一事实源
 */

const { getLockedParameters, getPlatformDefaults } = require('../config/PlatformParameterDictionary');

// 新系统支持
let CompiledCapability = null;

function _ensureCompiledCapability() {
  if (!CompiledCapability) {
    try {
      CompiledCapability = require('../config/CompiledCapability').CompiledCapability;
    } catch (e) {
      // 系统未初始化
    }
  }
}

/**
 * @typedef {Object} ResolvedParameters - 参数解析结果
 * @property {Object} parameters - 合并后的参数（平台标准格式）
 * @property {Object} layers - 各层参数来源追踪
 * @property {string[]} lockedParams - 应用的锁定参数
 * @property {Object[]} warnings - 警告信息
 * @property {Object[]} filtered - 被过滤的用户参数
 */

class ParameterResolutionService {

  /**
   * 合并参数（核心方法）
   *
   * @param {Object} layers - 各层参数
   * @param {Object} layers.base - 基础默认值（已合并 platform + service + model）
   * @param {Object} layers.voice - 音色默认值
   * @param {Object} layers.user - 用户输入值
   * @param {Object} layers.locked - 锁定参数值
   * @param {Object} context - 能力上下文（来自 CapabilityResolver）
   * @returns {ResolvedParameters}
   */
  merge(layers, context = {}) {
    const {
      base = {},
      voice = {},
      user = {},
      locked = {}
    } = layers;

    // 兼容旧的调用方式（传入 platform/service/model）
    const platform = layers.platform || {};
    const service = layers.service || {};
    const model = layers.model || {};

    const lockedParams = context.lockedParams || getLockedParameters();
    const parameterSupport = context.parameterSupport || {};

    // 1. 按优先级合并参数
    let merged = {};
    const layerTrace = {};
    const filtered = [];

    // 基础默认值（或兼容旧方式）
    if (Object.keys(base).length > 0) {
      merged = { ...merged, ...base };
      this._recordLayer(layerTrace, 'base', base);
    } else {
      // 兼容旧调用方式
      merged = { ...merged, ...platform };
      this._recordLayer(layerTrace, 'platform', platform);
      merged = { ...merged, ...service };
      this._recordLayer(layerTrace, 'service', service);
      merged = { ...merged, ...model };
      this._recordLayer(layerTrace, 'model', model);
    }

    // 音色默认值
    merged = { ...merged, ...voice };
    this._recordLayer(layerTrace, 'voice', voice);

    // 用户输入值（过滤锁定的参数）
    const { filteredUser, filteredParams } = this._filterLockedParams(user, lockedParams);
    merged = { ...merged, ...filteredUser };
    this._recordLayer(layerTrace, 'user', filteredUser);
    filtered.push(...filteredParams);

    // 2. 锁定参数回写（最高优先级）
    merged = { ...merged, ...locked };
    this._recordLayer(layerTrace, 'locked', locked);

    // 3. 收集警告
    const warnings = this._collectWarnings(merged, parameterSupport, user, filteredParams);

    // 4. 清理未定义值
    merged = this._cleanUndefined(merged);

    return {
      parameters: merged,
      layers: layerTrace,
      lockedParams,
      warnings,
      filtered
    };
  }

  /**
   * 从能力上下文合并参数（便捷方法）
   *
   * [修复] 避免重复叠加 mergedDefaults：
   * - mergedDefaults/resolvedDefaults 已经包含了 platform + service + model 的默认值
   * - 不需要再单独传 platform、service、model 层
   *
   * [重构] 支持 CompiledCapability
   * - 如果 context.compiled 存在，使用新系统的默认值、锁定参数、参数支持状态
   *
   * @param {Object} userOptions - 用户输入的参数
   * @param {Object} capabilityContext - CapabilityResolver 返回的上下文
   * @param {Object} voiceIdentity - VoiceResolver 返回的身份信息
   * @returns {ResolvedParameters}
   */
  mergeFromContext(userOptions, capabilityContext, voiceIdentity) {
    // [优先] 使用 CompiledCapability
    _ensureCompiledCapability();
    if (capabilityContext.compiled && CompiledCapability) {
      return this._mergeFromCompiled(userOptions, capabilityContext, voiceIdentity);
    }

    // [回退] 使用旧的 mergedDefaults 逻辑
    return this._mergeFromLegacy(userOptions, capabilityContext, voiceIdentity);
  }

  /**
   * 从 CompiledCapability 合并参数
   * @private
   */
  _mergeFromCompiled(userOptions, capabilityContext, voiceIdentity) {
    const compiled = capabilityContext.compiled;
    const warnings = [];

    // 获取默认值
    const defaults = compiled.getDefaults();

    // 过滤用户参数（移除不支持的字段），收集警告
    const filterResult = compiled.filterParams(userOptions || {});
    const filteredUser = filterResult.params || filterResult;
    if (filterResult.warnings) {
      warnings.push(...filterResult.warnings);
    }

    // 应用锁定参数
    const lockedParams = compiled.applyLockedParams(
      {},
      { providerVoiceId: voiceIdentity?.providerVoiceId }
    );

    // 合并：默认值 < 用户值 < 锁定值，收集警告
    const mergeResult = compiled.mergeWithDefaults(filteredUser);
    const merged = mergeResult.params || mergeResult;
    if (mergeResult.warnings) {
      warnings.push(...mergeResult.warnings);
    }

    const finalParams = { ...merged, ...lockedParams };

    // 构建层追踪
    const layerTrace = {};
    for (const key of Object.keys(defaults)) {
      layerTrace[key] = 'defaults';
    }
    for (const key of Object.keys(filteredUser)) {
      layerTrace[key] = 'user';
    }
    for (const key of Object.keys(lockedParams)) {
      layerTrace[key] = 'locked';
    }

    return {
      parameters: finalParams,
      layers: layerTrace,
      lockedParams: Object.keys(compiled.getLockedParams()),
      warnings,
      filtered: warnings.filter(w => w.type === 'filtered').map(w => ({
        param: w.param,
        value: w.value,
        reason: w.type
      }))
    };
  }

  /**
   * 从旧逻辑合并参数（回退路径）
   * @private
   */
  _mergeFromLegacy(userOptions, capabilityContext, voiceIdentity) {
    // 构建各层参数
    // resolvedDefaults 已包含平台和服务默认值，作为 base 层
    const layers = {
      // resolvedDefaults 已包含平台和服务默认值（优先使用新字段）
      base: capabilityContext.resolvedDefaults || capabilityContext.mergedDefaults || {},
      // 音色默认值
      voice: capabilityContext.voiceDefaults || {},
      // 用户输入值
      user: userOptions || {},
      // 锁定参数
      locked: {
        voice: voiceIdentity.providerVoiceId,
        model: voiceIdentity.modelKey || capabilityContext.resolvedDefaults?.model || capabilityContext.mergedDefaults?.model
      }
    };

    return this.merge(layers, capabilityContext);
  }

  /**
   * 记录参数来源层
   * @param {Object} trace - 追踪对象
   * @param {string} layerName - 层名称
   * @param {Object} params - 参数对象
   */
  _recordLayer(trace, layerName, params) {
    for (const key of Object.keys(params)) {
      if (params[key] !== undefined) {
        trace[key] = layerName;
      }
    }
  }

  /**
   * 过滤锁定参数
   * @param {Object} params - 原始参数
   * @param {string[]} lockedParams - 锁定参数列表
   * @returns {{ filteredUser: Object, filteredParams: Object[] }}
   */
  _filterLockedParams(params, lockedParams) {
    const filteredUser = {};
    const filteredParams = [];

    for (const [key, value] of Object.entries(params)) {
      if (lockedParams.includes(key)) {
        filteredParams.push({
          param: key,
          value,
          reason: 'locked'
        });
      } else {
        filteredUser[key] = value;
      }
    }

    return { filteredUser, filteredParams };
  }

  /**
   * 收集警告信息
   * @param {Object} merged - 合并后的参数
   * @param {Object} parameterSupport - 参数支持状态
   * @param {Object} userInput - 用户输入
   * @param {Object[]} filteredParams - 被过滤的参数
   * @returns {Object[]}
   */
  _collectWarnings(merged, parameterSupport, userInput, filteredParams) {
    const warnings = [];

    // 被过滤的锁定参数警告
    for (const filtered of filteredParams) {
      warnings.push({
        type: 'locked',
        param: filtered.param,
        message: `参数 ${filtered.param} 已被锁定，用户传入的值被忽略`,
        userValue: filtered.value
      });
    }

    // 不支持的参数警告
    for (const [param, value] of Object.entries(userInput)) {
      const support = parameterSupport[param];
      if (support && !support.supported && value !== undefined) {
        warnings.push({
          type: 'unsupported',
          param,
          message: support.config?.description || `参数 ${param} 不被当前服务支持`,
          userValue: value
        });
      }
    }

    return warnings;
  }

  /**
   * 清理未定义值
   * @param {Object} params - 参数对象
   * @returns {Object}
   */
  _cleanUndefined(params) {
    const cleaned = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  /**
   * 验证参数
   * @param {Object} params - 参数对象
   * @param {Object} context - 能力上下文
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  validate(params, context) {
    const errors = [];
    const warnings = [];
    const parameterSupport = context.parameterSupport || {};

    for (const [param, value] of Object.entries(params)) {
      const support = parameterSupport[param];

      if (support && support.supported === false) {
        errors.push(support.config?.description || `参数 ${param} 不被支持`);
        continue;
      }

      // 范围验证
      if (support?.config?.range && typeof value === 'number') {
        const { min, max } = support.config.range;
        if (value < min || value > max) {
          errors.push(`${param} 必须在 ${min} 到 ${max} 之间，当前值: ${value}`);
        }
      }

      // 枚举验证
      if (support?.config?.type === 'enum' && support.config.values) {
        if (!support.config.values.includes(value)) {
          errors.push(`${param} 必须是 [${support.config.values.join(', ')}] 之一，当前值: ${value}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 提取 providerOptions
   * 从用户参数中提取服务商扩展参数
   *
   * [重构] 支持从 CompiledCapability 动态获取标准字段列表
   *
   * @param {Object} params - 参数对象
   * @param {Object} [context] - 能力上下文（可选，包含 compiled）
   * @returns {Object}
   */
  extractProviderOptions(params, context = null) {
    // [优先] 从 CompiledCapability 获取标准字段
    if (context?.compiled) {
      const schema = context.compiled.getSchema();
      const knownParams = new Set(Object.keys(schema));
      knownParams.add('text');  // text 是核心参数
      knownParams.add('providerOptions');

      const providerOptions = {};
      for (const [key, value] of Object.entries(params)) {
        if (!knownParams.has(key)) {
          providerOptions[key] = value;
        }
      }
      return providerOptions;
    }

    // [回退] 使用硬编码列表（保持向后兼容）
    const knownParams = new Set([
      'text', 'voice', 'model', 'speed', 'pitch', 'volume',
      'format', 'sampleRate', 'emotion', 'style',
      'styleStrength', 'expectedDurationSec', 'samplingParams',
      'durationHint', 'languageType', 'providerOptions'
    ]);

    const providerOptions = {};

    for (const [key, value] of Object.entries(params)) {
      if (!knownParams.has(key)) {
        providerOptions[key] = value;
      }
    }

    return providerOptions;
  }

  /**
   * 构建最终参数对象
   * 合并标准参数和 providerOptions
   *
   * [修复] 传递 context 以支持动态字段识别
   *
   * @param {Object} resolvedParams - 解析后的参数
   * @param {Object} [context] - 能力上下文（包含 compiled）
   * @returns {Object}
   */
  buildFinalParams(resolvedParams, context = null) {
    const { parameters } = resolvedParams;

    // 提取额外的 providerOptions（传递 context 支持动态字段）
    const extraProviderOptions = this.extractProviderOptions(parameters, context);

    // 合并
    const final = { ...parameters };

    if (Object.keys(extraProviderOptions).length > 0) {
      final.providerOptions = {
        ...(parameters.providerOptions || {}),
        ...extraProviderOptions
      };

      // 删除已合并到 providerOptions 的字段
      for (const key of Object.keys(extraProviderOptions)) {
        delete final[key];
      }
    }

    return final;
  }
}

// 导出单例
const parameterResolutionService = new ParameterResolutionService();

module.exports = {
  ParameterResolutionService,
  parameterResolutionService
};
