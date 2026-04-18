const TtsException = require('../core/TtsException');

/**
 * 参数映射器
 * 负责将统一的用户参数转换为各服务商特定的API参数
 */
class ParameterMapper {
  constructor() {
    this.config = null;
    this.loaded = false;
  }

  /**
   * 初始化参数映射器
   */
  async initialize() {
    if (this.loaded) return;

    try {
      const configPath = require('path').join(__dirname, 'ProviderConfig.json');
      const configData = require('./ProviderConfig.json');
      this.config = configData;
      this.loaded = true;
      console.log('✅ ParameterMapper 初始化完成');
    } catch (error) {
      console.error('❌ ParameterMapper 初始化失败:', error);
      throw error;
    }
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

    // 获取服务商配置
    const providerConfig = this.config.providers[provider];
    if (!providerConfig) {
      throw TtsException.NotFound(`Provider not found: ${provider}`);
    }

    const serviceConfig = providerConfig.services[serviceType];
    if (!serviceConfig) {
      throw TtsException.NotFound(`Service not found: ${provider}.${serviceType}`);
    }

    const apiParams = this.buildApiParams(userOptions, serviceConfig, provider);
    return apiParams;
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

      const paramConfig = parameterMapping[paramKey];

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
      if (typeof value !== 'number' || isNaN(value)) {
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
      if (value < config.range.min || value > config.range.max) {
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

    const serviceConfig = this.config.providers[provider]?.services[serviceType];
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

    const serviceConfig = this.config.providers[provider]?.services[serviceType];
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
