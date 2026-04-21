/**
 * CapabilityValidator - 能力校验器
 *
 * [重构] 代理 CapabilityResolver 进行能力校验
 * 保持 API 兼容性，但内部使用新的能力规则源
 *
 * 注意：新代码应直接使用 CapabilityResolver
 * 此类保留是为了向后兼容
 */

const { capabilityResolver } = require('../application/CapabilityResolver');

class CapabilityValidator {
  /**
   * @param {Object} providerCatalog - ProviderCatalog 实例（向后兼容，实际不使用）
   * @deprecated 请直接使用 CapabilityResolver
   */
  constructor(providerCatalog) {
    this.providerCatalog = providerCatalog;
    // 内部使用 CapabilityResolver
    this._resolver = capabilityResolver;
  }

  /**
   * 校验请求参数是否符合服务能力
   * @param {string} adapterKey - 适配器标识 (如 "moss_tts")
   * @param {Object} options - 请求参数 { speed, pitch, volume, format, sampleRate, ... }
   * @returns {Object} - { valid, errors, warnings }
   */
  validate(adapterKey, options = {}) {
    const errors = [];
    const warnings = [];

    // 使用 CapabilityResolver 获取能力上下文
    const context = this._resolver.resolve(adapterKey);
    const { parameterSupport } = context;

    if (!parameterSupport || Object.keys(parameterSupport).length === 0) {
      // 没有能力配置，跳过校验
      warnings.push(`No capability config found for ${adapterKey}, validation skipped`);
      return { valid: true, errors, warnings };
    }

    // 遍历参数进行校验
    for (const [param, value] of Object.entries(options)) {
      if (value === undefined || value === null) continue;

      const support = parameterSupport[param];
      if (!support) continue;

      // 检查是否支持
      if (support.supported === false) {
        errors.push(support.config?.description || `参数 ${param} 不被当前服务支持`);
        continue;
      }

      // 类型校验
      if (support.config?.type && typeof value !== support.config.type) {
        if (support.config.type === 'number' && typeof value !== 'number') {
          errors.push(`${param} 必须是数字，收到: ${typeof value}`);
          continue;
        }
        if (support.config.type === 'string' && typeof value !== 'string') {
          errors.push(`${param} 必须是字符串，收到: ${typeof value}`);
          continue;
        }
      }

      // 范围校验
      if (support.config?.range && typeof value === 'number') {
        const { min, max } = support.config.range;
        if (min !== undefined && value < min) {
          errors.push(`${param} 必须 >= ${min}，当前值: ${value}`);
        }
        if (max !== undefined && value > max) {
          errors.push(`${param} 必须 <= ${max}，当前值: ${value}`);
        }
      }

      // 枚举校验
      if (support.config?.type === 'enum' && support.config.values) {
        if (!support.config.values.includes(value)) {
          warnings.push(`${param} 值 "${value}" 可能不被支持。支持值: ${support.config.values.join(', ')}`);
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
   * 校验数值范围
   * @deprecated 内部方法，保留向后兼容
   */
  _validateRange(paramName, value, range) {
    if (typeof value !== 'number' || isNaN(value)) {
      return {
        valid: false,
        error: `${paramName} must be a number, got ${typeof value}`
      };
    }

    if (range.min !== undefined && value < range.min) {
      return {
        valid: false,
        error: `${paramName} must be >= ${range.min}, got ${value}`
      };
    }

    if (range.max !== undefined && value > range.max) {
      return {
        valid: false,
        error: `${paramName} must be <= ${range.max}, got ${value}`
      };
    }

    return { valid: true };
  }

  /**
   * 获取服务的默认参数
   * @param {string} adapterKey - 适配器标识
   * @returns {Object} - 默认参数
   */
  getDefaults(adapterKey) {
    const context = this._resolver.resolve(adapterKey);
    return context.resolvedDefaults || {};
  }

  /**
   * 检查服务是否支持某项能力
   * @param {string} adapterKey - 适配器标识
   * @param {string} capability - 能力名称 (streaming, realtime, speedAdjustable, etc.)
   * @returns {boolean}
   */
  hasCapability(adapterKey, capability) {
    const context = this._resolver.resolve(adapterKey);
    const { serviceCapabilities, parameterSupport } = context;

    // 检查服务能力（streaming, realtime 等）
    if (serviceCapabilities && serviceCapabilities.capabilities) {
      if (serviceCapabilities.capabilities[capability] !== undefined) {
        return serviceCapabilities.capabilities[capability] === true;
      }
    }

    // 检查参数支持（speed, pitch, volume 等）
    if (parameterSupport && parameterSupport[capability]) {
      return parameterSupport[capability].supported !== false;
    }

    return false;
  }
}

module.exports = {
  CapabilityValidator
};
