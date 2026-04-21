const TtsException = require('../core/TtsException');
const CapabilitySchema = require('../schema/CapabilitySchema');
const { ProviderDescriptorRegistry } = require('../provider-management/ProviderDescriptorRegistry');

// 新系统导入
let FieldDefinitionSystem = null;
let getCompiledCapability = null;

// fail-fast 配置
const FAIL_FAST = process.env.TTS_FIELD_SYSTEM_FAIL_FAST !== 'false';

function _ensureFieldDefinitionSystem() {
  if (!FieldDefinitionSystem) {
    try {
      FieldDefinitionSystem = require('./FieldDefinitionSystem');
      getCompiledCapability = FieldDefinitionSystem.getCompiledCapability;
    } catch (e) {
      if (FAIL_FAST) {
        throw new Error(`[ParameterMapper] FieldDefinitionSystem 未初始化: ${e.message}`);
      }
      // 非 fail-fast 模式：继续使用旧逻辑
    }
  }
}

/**
 * 参数映射器
 * 负责将统一的用户参数转换为各服务商特定的API参数
 *
 * [改造后] 新增 mapToProvider 方法：
 * - 接收 serviceKey（如 "moss_tts"）而非分开的 provider/serviceType
 * - 支持从 CapabilitySchema 获取参数定义
 * - 输出服务商就绪参数（provider-ready params）
 *
 * [规则源统一] 参数支持状态从 CapabilitySchema 读取：
 * - CapabilitySchema 定义参数是否支持（supported: true/false）
 * - ProviderConfig.json 定义字段映射规则（apiField, transform）
 *
 * [重构] 优先使用 CompiledCapability 的映射器
 */
class ParameterMapper {
  constructor() {
    this.config = null;
    this.loaded = false;
    this.useNewSystem = false;  // 标记是否使用新系统
  }

  /**
   * 初始化参数映射器
   *
   * [重构] 优先检查新系统，不再强制依赖旧配置
   */
  async initialize() {
    if (this.loaded) return;

    // 1. 尝试使用新系统
    _ensureFieldDefinitionSystem();
    if (getCompiledCapability) {
      this.useNewSystem = true;
      this.loaded = true;
      console.log('✅ ParameterMapper 初始化完成（使用 FieldDefinitionSystem）');
      return;
    }

    // 2. 回退：加载旧配置文件
    try {
      const configData = require('./ProviderConfig.json');
      this.config = configData;
      this.loaded = true;
      console.log('✅ ParameterMapper 初始化完成（使用 ProviderConfig.json）');
    } catch (error) {
      // 新系统不可用且旧配置加载失败，记录警告但不阻塞
      console.warn('⚠️ ParameterMapper: 新系统不可用，旧配置也未找到，映射将直接透传参数');
      this.loaded = true;
    }
  }

  /**
   * 将平台标准参数映射为服务商参数（新方法）
   *
   * [重构] 优先使用 CompiledCapability 的映射器
   *
   * @param {string} serviceKey - 服务标识（如 "moss_tts"）
   * @param {Object} platformParams - 平台标准参数
   * @param {Object} context - 上下文（包含 providerVoiceId 等）
   * @returns {Object} 服务商参数（provider-ready params）
   */
  mapToProvider(serviceKey, platformParams = {}, context = {}) {
    // [优先] 尝试使用新系统 CompiledCapability
    _ensureFieldDefinitionSystem();
    if (getCompiledCapability) {
      try {
        const compiled = this._tryGetCompiledCapability(serviceKey);
        if (compiled) {
          return compiled.mapToProvider(platformParams, context);
        }
      } catch (e) {
        if (FAIL_FAST) {
          throw new Error(`[ParameterMapper] CompiledCapability 映射失败: ${e.message}`);
        }
        console.warn(`[ParameterMapper] CompiledCapability 映射失败，回退到旧逻辑: ${e.message}`);
      }
    }

    // [回退] 使用旧的 ProviderConfig.json 逻辑
    return this._mapToProviderLegacy(serviceKey, platformParams);
  }

  /**
   * 尝试获取 CompiledCapability
   * @private
   */
  _tryGetCompiledCapability(serviceKey) {
    const descriptor = ProviderDescriptorRegistry.get(serviceKey);
    if (!descriptor) return null;

    return getCompiledCapability(serviceKey, descriptor.provider);
  }

  /**
   * 使用旧逻辑映射（回退路径）
   * @private
   */
  _mapToProviderLegacy(serviceKey, platformParams = {}) {
    if (!this.loaded) {
      console.warn('[ParameterMapper] Not initialized, returning platform params as-is');
      return platformParams;
    }

    // 解析 serviceKey 为 provider 和 serviceType
    const { provider, serviceType } = this._parseServiceKey(serviceKey);

    // [新增] 先从 CapabilitySchema 检查参数支持状态
    const capabilityParams = CapabilitySchema.getParameterConfig ?
      CapabilitySchema.getServiceCapabilities(serviceKey)?.parameters : null;

    // 过滤掉不支持的参数
    const filteredParams = this._filterUnsupportedParams(platformParams, capabilityParams);

    // 尝试使用 ProviderConfig.json 的映射规则
    const serviceConfig = this.config?.providers?.[provider]?.services?.[serviceType];

    let mappedParams;
    if (!serviceConfig) {
      // 没有映射配置，使用默认转换逻辑
      mappedParams = this._defaultMapping(serviceKey, filteredParams);
    } else {
      // 使用配置驱动的映射
      mappedParams = this._mapWithConfig(filteredParams, serviceConfig, provider, capabilityParams);
    }

    // [新增] 统一校验必填参数
    this._validateRequiredParams(mappedParams, serviceConfig, serviceKey);

    return mappedParams;
  }

  /**
   * 统一校验必填参数
   * @param {Object} mappedParams - 映射后的参数
   * @param {Object} serviceConfig - 服务配置
   * @param {string} serviceKey - 服务标识
   * @private
   */
  _validateRequiredParams(mappedParams, serviceConfig, serviceKey) {
    if (!serviceConfig?.parameterMapping) return;

    const missingParams = [];
    const parameterMapping = serviceConfig.parameterMapping;

    for (const [paramKey, paramConfig] of Object.entries(parameterMapping)) {
      // 只检查必填参数
      if (paramConfig.required !== true) continue;
      // 跳过明确不支持的字段
      if (paramConfig.supported === false) continue;

      // 检查映射后的字段是否存在
      const apiField = paramConfig.apiField;
      const hasValue = this._hasValueAtPath(mappedParams, apiField);

      if (!hasValue) {
        missingParams.push({
          param: paramKey,
          apiField,
          description: paramConfig.description || ''
        });
      }
    }

    if (missingParams.length > 0) {
      const details = missingParams
        .map(p => `${p.param} (${p.apiField})${p.description ? `: ${p.description}` : ''}`)
        .join(', ');
      const error = new Error(`Missing required parameters for ${serviceKey}: ${details}`);
      error.code = 'MISSING_REQUIRED_PARAMS';
      error.missingParams = missingParams;
      throw error;
    }
  }

  /**
   * 检查嵌套路径是否有值
   * @private
   */
  _hasValueAtPath(obj, path) {
    if (!obj || !path) return false;
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return false;
      if (!current.hasOwnProperty(part)) return false;
      current = current[part];
    }

    return current !== null && current !== undefined;
  }

  /**
   * 过滤掉不支持的参数
   * @private
   */
  _filterUnsupportedParams(params, capabilityParams) {
    if (!capabilityParams) return params;

    const filtered = {};
    for (const [key, value] of Object.entries(params)) {
      const capConfig = capabilityParams[key];
      if (capConfig && capConfig.supported === false) {
        // 参数不支持，跳过
        continue;
      }
      filtered[key] = value;
    }
    return filtered;
  }

  _toSnakeCase(key) {
    return String(key).replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  _toCamelCase(key) {
    return String(key).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  _findMappingEntry(parameterMapping, paramKey) {
    if (!parameterMapping || !paramKey) {
      return { key: null, config: null };
    }

    if (parameterMapping[paramKey]) {
      return { key: paramKey, config: parameterMapping[paramKey] };
    }

    const snakeKey = this._toSnakeCase(paramKey);
    if (parameterMapping[snakeKey]) {
      return { key: snakeKey, config: parameterMapping[snakeKey] };
    }

    const camelKey = this._toCamelCase(paramKey);
    if (parameterMapping[camelKey]) {
      return { key: camelKey, config: parameterMapping[camelKey] };
    }

    return { key: null, config: null };
  }

  /**
   * 解析 serviceKey
   * @private
   */
  _parseServiceKey(serviceKey) {
    const descriptor = ProviderDescriptorRegistry.get(serviceKey);
    if (descriptor) {
      return {
        provider: descriptor.provider,
        serviceType: descriptor.service,
        canonicalKey: descriptor.key
      };
    }

    // serviceKey 格式: "moss_tts", "aliyun_qwen_http", "tencent_tts"
    const parts = serviceKey.split('_');

    if (parts.length === 2) {
      return { provider: parts[0], serviceType: parts[1], canonicalKey: serviceKey };
    }

    if (parts.length >= 3) {
      // 处理 "aliyun_qwen_http" 的情况
      return {
        provider: parts[0],
        serviceType: parts.slice(1).join('_'),
        canonicalKey: serviceKey
      };
    }

    return { provider: serviceKey, serviceType: 'default', canonicalKey: serviceKey };
  }

  /**
   * 默认映射逻辑（无配置时使用）
   * @private
   */
  _defaultMapping(serviceKey, platformParams) {
    const { provider } = this._parseServiceKey(serviceKey);

    // 根据服务商提供默认的参数转换
    switch (provider) {
      case 'moss':
        return this._mapMossParams(platformParams);
      case 'aliyun':
        return this._mapAliyunParams(platformParams);
      case 'tencent':
        return this._mapTencentParams(platformParams);
      case 'volcengine':
        return this._mapVolcengineParams(platformParams);
      case 'minimax':
        return this._mapMinimaxParams(platformParams);
      default:
        // 未知服务商，返回原参数
        return platformParams;
    }
  }

  /**
   * MOSS 参数映射
   * @private
   */
  _mapMossParams(platformParams) {
    const providerParams = {};

    // voice -> voice_id
    if (platformParams.voice) {
      providerParams.voice_id = platformParams.voice;
    }

    // expectedDurationSec -> expected_duration_sec
    if (platformParams.expectedDurationSec) {
      providerParams.expected_duration_sec = platformParams.expectedDurationSec;
    }

    // samplingParams -> sampling_params（转换内部字段名为服务商格式）
    if (platformParams.samplingParams) {
      providerParams.sampling_params = this._convertSamplingParams(platformParams.samplingParams);
    }

    // providerOptions 中的特殊参数处理
    if (platformParams.providerOptions) {
      // 合并 providerOptions 到 providerParams
      Object.assign(providerParams, platformParams.providerOptions);
    }

    // 其他参数透传
    for (const [key, value] of Object.entries(platformParams)) {
      if (!['voice', 'model', 'expectedDurationSec', 'samplingParams', 'speed', 'pitch', 'volume', 'providerOptions'].includes(key)) {
        providerParams[key] = value;
      }
    }

    return providerParams;
  }

  /**
   * 转换 samplingParams 为服务商格式
   * 平台标准格式（驼峰） -> 服务商格式（下划线）
   * @private
   */
  _convertSamplingParams(samplingParams) {
    if (!samplingParams || typeof samplingParams !== 'object') {
      return samplingParams;
    }

    const converted = {};

    // 字段名映射：驼峰 -> 下划线
    const fieldMapping = {
      topP: 'top_p',
      topK: 'top_k',
      maxNewTokens: 'max_new_tokens',
      // temperature 保持不变
    };

    for (const [key, value] of Object.entries(samplingParams)) {
      const mappedKey = fieldMapping[key] || key;
      converted[mappedKey] = value;
    }

    return converted;
  }

  /**
   * 阿里云参数映射
   * @private
   */
  _mapAliyunParams(platformParams) {
    const providerParams = {};

    // 基础参数
    if (platformParams.voice) {
      providerParams.voice = platformParams.voice;
    }
    if (platformParams.model) {
      providerParams.model = platformParams.model;
    }
    if (platformParams.format) {
      providerParams.format = platformParams.format;
    }
    if (platformParams.sampleRate) {
      providerParams.sampleRate = platformParams.sampleRate;
    }

    // 其他参数透传
    for (const [key, value] of Object.entries(platformParams)) {
      if (!['voice', 'model', 'format', 'sampleRate'].includes(key)) {
        providerParams[key] = value;
      }
    }

    return providerParams;
  }

  /**
   * 腾讯云参数映射
   * @private
   */
  _mapTencentParams(platformParams) {
    const providerParams = {};

    // voice -> VoiceType (parseInt)
    if (platformParams.voice) {
      providerParams.VoiceType = parseInt(platformParams.voice) || platformParams.voice;
    }

    // speed -> Speed (范围 -2 到 2，需要转换)
    if (platformParams.speed !== undefined) {
      // 平台标准范围 0.5-2.0 映射到腾讯云 -2 到 2
      providerParams.Speed = Math.round((platformParams.speed - 1) * 4);
    }

    // volume -> Volume (范围 0-10，需要转换)
    if (platformParams.volume !== undefined) {
      // 平台标准范围 0-100 映射到腾讯云 0-10
      providerParams.Volume = Math.round(platformParams.volume / 10);
    }

    // format -> Codec
    if (platformParams.format) {
      providerParams.Codec = platformParams.format;
    }

    return providerParams;
  }

  /**
   * 火山引擎参数映射
   * @private
   */
  _mapVolcengineParams(platformParams) {
    const providerParams = {};

    // 嵌套结构
    providerParams.audio = {
      voice_type: platformParams.voice || 'default',
      encoding: platformParams.format || 'wav',
      speed_ratio: platformParams.speed || 1.0,
      volume_ratio: (platformParams.volume || 50) / 100
    };

    return providerParams;
  }

  /**
   * MiniMax 参数映射
   * @private
   */
  _mapMinimaxParams(platformParams) {
    const providerParams = {};

    // 嵌套结构
    providerParams.voice_setting = {
      voice_id: platformParams.voice || 'default'
    };

    if (platformParams.speed !== undefined) {
      providerParams.voice_setting.speed = platformParams.speed;
    }
    if (platformParams.volume !== undefined) {
      providerParams.voice_setting.vol = platformParams.volume / 100;
    }
    if (platformParams.pitch !== undefined) {
      // pitch 需要转换（平台标准到 MiniMax 格式）
      providerParams.voice_setting.pitch = (platformParams.pitch - 1) * 24;
    }

    // model
    if (platformParams.model) {
      providerParams.model = platformParams.model;
    }

    return providerParams;
  }

  /**
   * 使用配置文件的映射规则
   * @param {Object} platformParams - 平台参数
   * @param {Object} serviceConfig - 服务配置
   * @param {string} provider - 服务商标识
   * @param {Object} [capabilityParams] - CapabilitySchema 参数定义（可选，用于二次校验）
   * @private
   */
  _mapWithConfig(platformParams, serviceConfig, provider, capabilityParams = null) {
    const apiParams = {};
    const parameterMapping = serviceConfig.parameterMapping || {};

    for (const [paramKey, paramValue] of Object.entries(platformParams)) {
      // 跳过 null 和 undefined
      if (paramValue === null || paramValue === undefined) {
        continue;
      }

      const { key: resolvedParamKey, config: paramConfig } = this._findMappingEntry(parameterMapping, paramKey);

      // 检查参数是否支持
      if (!paramConfig) {
        // 未定义的参数，透传
        apiParams[paramKey] = paramValue;
        continue;
      }

      if (paramConfig.supported === false) {
        // 不支持的参数，跳过
        continue;
      }

      // [新增] 二次校验：检查 CapabilitySchema
      const capabilityKey = capabilityParams?.[paramKey]
        ? paramKey
        : capabilityParams?.[resolvedParamKey]
          ? resolvedParamKey
          : this._toCamelCase(paramKey);

      if (capabilityParams && capabilityParams[capabilityKey]?.supported === false) {
        continue;
      }

      // 转换参数
      const transformedValue = this.transformParameter(paramValue, paramConfig);

      // 映射到 API 字段
      this.mapToApiField(apiParams, paramConfig.apiField, transformedValue);
    }

    // 添加默认值
    this.applyDefaults(apiParams, parameterMapping);

    return apiParams;
  }

  /**
   * 映射和验证参数（核心方法）
   * @param {string} provider - 服务商
   * @param {string} serviceType - 服务类型
   * @param {Object} userOptions - 用户提供的参数
   * @returns {Object} 映射后的API参数
   */
  mapAndValidate(provider, serviceType, userOptions = {}) {
    if (!this.loaded) {
      throw TtsException.ConfigError('ParameterMapper not initialized');
    }

    const resolvedService = this._resolveServiceConfig(provider, serviceType);
    if (!resolvedService) {
      const providerConfig = this.config.providers[provider];
      if (!providerConfig) {
        throw TtsException.NotFound(`Provider not found: ${provider}`);
      }

      throw TtsException.NotFound(`Service not found: ${provider}.${serviceType}`);
    }

    const { providerConfig, serviceConfig } = resolvedService;
    if (!providerConfig) {
      throw TtsException.NotFound(`Provider not found: ${provider}`);
    }

    const apiParams = this.buildApiParams(userOptions, serviceConfig, provider);
    return apiParams;
  }

  _resolveServiceConfig(provider, serviceType) {
    const providerConfig = this.config.providers[provider];
    if (!providerConfig) {
      return null;
    }

    if (providerConfig.services[serviceType]) {
      return {
        providerConfig,
        serviceConfig: providerConfig.services[serviceType],
        serviceTypeKey: serviceType
      };
    }

    const canonicalKey = ProviderDescriptorRegistry.resolveCanonicalKey(`${provider}_${serviceType}`)
      || ProviderDescriptorRegistry.resolveCanonicalKey(serviceType);

    if (canonicalKey) {
      const descriptor = ProviderDescriptorRegistry.get(canonicalKey);
      const resolvedKey = descriptor?.provider === provider ? descriptor.service : null;
      if (resolvedKey && providerConfig.services[resolvedKey]) {
        return {
          providerConfig,
          serviceConfig: providerConfig.services[resolvedKey],
          serviceTypeKey: resolvedKey
        };
      }
    }

    return null;
  }

  /**
   * 构建API参数
   * @private
   */
  buildApiParams(userOptions, serviceConfig, provider) {
    const apiParams = {};
    const parameterMapping = serviceConfig.parameterMapping;

    for (const [paramKey, paramValue] of Object.entries(userOptions)) {
      // 跳过null和undefined
      if (paramValue === null || paramValue === undefined) {
        continue;
      }

      const { config: paramConfig } = this._findMappingEntry(parameterMapping, paramKey);

      // 检查参数是否支持
      if (!paramConfig) {
        console.warn(`⚠️  未知参数: ${paramKey} (将被忽略)`);
        continue;
      }

      if (paramConfig.supported === false) {
        throw TtsException.BadRequest(
          `${provider} 不支持参数: ${paramKey}。${paramConfig.description || ''}`
        );
      }

      // 验证参数
      this.validateParameter(paramKey, paramValue, paramConfig);

      // 转换参数
      const transformedValue = this.transformParameter(paramValue, paramConfig);

      // 映射到API字段
      this.mapToApiField(apiParams, paramConfig.apiField, transformedValue);
    }

    // 添加默认值
    this.applyDefaults(apiParams, parameterMapping);

    return apiParams;
  }

  /**
   * 验证参数
   * @private
   */
  validateParameter(paramKey, value, config) {
    // 类型验证
    if (config.type === 'number') {
      const numericValue = typeof value === 'number'
        ? value
        : config.transform === 'parseInt'
          ? parseInt(value, 10)
          : config.transform === 'parseFloat'
            ? parseFloat(value)
            : Number.NaN;

      if (!Number.isFinite(numericValue)) {
        throw TtsException.BadRequest(
          `${paramKey} 必须是数字类型，收到: ${typeof value}`
        );
      }
    }

    if (config.type === 'string') {
      if (typeof value !== 'string') {
        throw TtsException.BadRequest(
          `${paramKey} 必须是字符串类型，收到: ${typeof value}`
        );
      }
    }

    if (config.type === 'enum') {
      if (!config.values.includes(value)) {
        throw TtsException.BadRequest(
          `${paramKey} 必须是以下值之一: ${config.values.join(', ')}`
        );
      }
    }

    // 范围验证
    if (config.range) {
      const inputRange = config.standardization?.inputRange || config.range;
      if (value < inputRange.min || value > inputRange.max) {
        throw TtsException.BadRequest(
          `${paramKey} 必须在 ${config.range.min} 到 ${config.range.max} 之间，收到: ${value}`
        );
      }
    }
  }

  /**
   * 转换参数（标准化处理）
   * @private
   */
  transformParameter(value, config) {
    // 数据类型转换
    if (config.transform === 'parseInt') {
      return parseInt(value);
    }

    if (config.transform === 'parseFloat') {
      return parseFloat(value);
    }

    // 标准化转换（使用安全的转换函数，不使用 eval）
    if (config.standardization) {
      const { transform } = config.standardization;
      if (transform) {
        return this.safeTransform(transform, value);
      }
    }

    return value;
  }

  /**
   * 安全的参数转换（替代 eval）
   * 使用预定义的转换函数，避免代码注入风险
   * @private
   */
  safeTransform(transform, value) {
    // 预定义的转换函数映射表
    const transformations = {
      'value * 10': (v) => v * 10,
      'value * 1.0': (v) => v * 1.0,
      'value / 10': (v) => v / 10,
      'value / 10.0': (v) => v / 10.0,
      'value / 100': (v) => v / 100,
      '(value - 1) * 24': (v) => (v - 1) * 24,
      '(value - 1) * 50': (v) => (v - 1) * 50,
      'Math.round(value)': (v) => Math.round(v),
      'Math.floor(value)': (v) => Math.floor(v),
      'Math.ceil(value)': (v) => Math.ceil(v)
    };

    // 查找预定义的转换函数
    const transformFunc = transformations[transform];
    if (transformFunc) {
      return transformFunc(value);
    }

    // 如果没有预定义的转换，记录警告并返回原值
    console.warn(`⚠️  Unknown transform: "${transform}", returning original value`);
    return value;
  }

  /**
   * 映射到API字段（支持嵌套）
   * @private
   */
  mapToApiField(apiParams, apiField, value) {
    const fieldParts = apiField.split('.');
    let current = apiParams;

    for (let i = 0; i < fieldParts.length - 1; i++) {
      const part = fieldParts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }

    current[fieldParts[fieldParts.length - 1]] = value;
  }

  /**
   * 应用默认值
   * @private
   */
  applyDefaults(apiParams, parameterMapping) {
    for (const [paramKey, paramConfig] of Object.entries(parameterMapping)) {
      // 跳过不支持的参数
      if (paramConfig.supported === false) {
        continue;
      }

      // 检查是否已有值
      const hasValue = this.hasValueInPath(apiParams, paramConfig.apiField);
      if (hasValue) {
        continue;
      }

      // 应用默认值
      if (paramConfig.default !== undefined) {
        this.mapToApiField(apiParams, paramConfig.apiField, paramConfig.default);
      }
    }
  }

  /**
   * 检查字段路径是否已有值
   * @private
   */
  hasValueInPath(obj, path) {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (!current || !current.hasOwnProperty(part)) {
        return false;
      }
      current = current[part];
    }

    return true;
  }

  /**
   * 获取支持的参数列表
   * @param {string} provider - 服务商
   * @param {string} serviceType - 服务类型
   * @returns {Array} 支持的参数列表
   */
  getSupportedParameters(provider, serviceType) {
    if (!this.loaded) {
      throw TtsException.ConfigError('ParameterMapper not initialized');
    }

    const serviceConfig = this._resolveServiceConfig(provider, serviceType)?.serviceConfig;
    if (!serviceConfig) {
      return [];
    }

    const parameters = [];
    for (const [paramKey, paramConfig] of Object.entries(serviceConfig.parameterMapping)) {
      if (paramConfig.supported !== false) {
        parameters.push({
          name: paramKey,
          type: paramConfig.type,
          description: paramConfig.description,
          required: paramConfig.required || false,
          range: paramConfig.range,
          values: paramConfig.values,
          defaultValue: paramConfig.default
        });
      }
    }

    return parameters;
  }

  /**
   * 获取参数配置
   * @param {string} provider - 服务商
   * @param {string} serviceType - 服务类型
   * @param {string} parameterName - 参数名
   * @returns {Object} 参数配置
   */
  getParameterConfig(provider, serviceType, parameterName) {
    if (!this.loaded) {
      throw TtsException.ConfigError('ParameterMapper not initialized');
    }

    const serviceConfig = this._resolveServiceConfig(provider, serviceType)?.serviceConfig;
    return serviceConfig?.parameterMapping[parameterName];
  }

  /**
   * 验证系统ID的参数
   * @param {string} systemId - 系统ID
   * @param {Object} options - 参数
   * @returns {Object} 验证结果
   */
  validateSystemIdParameters(systemId, options) {
    const { voiceRegistry } = require('../core/VoiceRegistry');
    const voice = voiceRegistry.get(systemId);

    if (!voice) {
      throw TtsException.NotFound(`System ID not found: ${systemId}`);
    }

    return this.mapAndValidate(voice.provider, voice.service, options);
  }
}

// 导出单例
const parameterMapper = new ParameterMapper();

module.exports = {
  ParameterMapper,
  parameterMapper
};
