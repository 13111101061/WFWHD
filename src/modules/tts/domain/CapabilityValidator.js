/**
 * CapabilityValidator - 能力校验器
 *
 * 校验请求参数是否在 provider/service 的能力范围内
 * 基于 ProviderCatalog 中定义的能力配置进行校验
 */

class CapabilityValidator {
  /**
   * @param {Object} providerCatalog - ProviderCatalog 实例
   */
  constructor(providerCatalog) {
    this.providerCatalog = providerCatalog;
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

    // 获取服务能力配置
    const capabilities = this.providerCatalog.getCapabilities(adapterKey);

    if (!capabilities) {
      // 没有能力配置，跳过校验（记录警告）
      warnings.push(`No capability config found for ${adapterKey}, validation skipped`);
      return { valid: true, errors, warnings };
    }

    // 校验 speed 范围
    if (options.speed !== undefined && capabilities.speed) {
      const speedResult = this._validateRange('speed', options.speed, capabilities.speed);
      if (!speedResult.valid) {
        errors.push(speedResult.error);
      }
    }

    // 校验 pitch 范围
    if (options.pitch !== undefined && capabilities.pitch) {
      const pitchResult = this._validateRange('pitch', options.pitch, capabilities.pitch);
      if (!pitchResult.valid) {
        errors.push(pitchResult.error);
      }
    }

    // 校验 volume 范围
    if (options.volume !== undefined && capabilities.volume) {
      const volumeResult = this._validateRange('volume', options.volume, capabilities.volume);
      if (!volumeResult.valid) {
        errors.push(volumeResult.error);
      }
    }

    // 校验 format 是否支持
    if (options.format !== undefined && capabilities.formats) {
      if (!capabilities.formats.includes(options.format)) {
        warnings.push(
          `Format "${options.format}" may not be supported. ` +
          `Supported formats: ${capabilities.formats.join(', ')}`
        );
      }
    }

    // 校验 sampleRate 是否支持
    if (options.sampleRate !== undefined && capabilities.sampleRates) {
      if (!capabilities.sampleRates.includes(options.sampleRate)) {
        warnings.push(
          `Sample rate ${options.sampleRate} may not be supported. ` +
          `Supported rates: ${capabilities.sampleRates.join(', ')}`
        );
      }
    }

    // 校验 streaming 能力
    if (options.streaming === true && capabilities.streaming === false) {
      warnings.push(`Service ${adapterKey} does not support streaming`);
    }

    // 校验 realtime 能力
    if (options.realtime === true && capabilities.realtime === false) {
      warnings.push(`Service ${adapterKey} does not support realtime synthesis`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 校验数值范围
   * @param {string} paramName - 参数名
   * @param {number} value - 参数值
   * @param {Object} range - 范围配置 { min, max, default }
   * @returns {Object} - { valid, error? }
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
    const capabilities = this.providerCatalog.getCapabilities(adapterKey);
    if (!capabilities) {
      return {};
    }

    const defaults = {};

    if (capabilities.speed && capabilities.speed.default !== undefined) {
      defaults.speed = capabilities.speed.default;
    }

    if (capabilities.pitch && capabilities.pitch.default !== undefined) {
      defaults.pitch = capabilities.pitch.default;
    }

    if (capabilities.volume && capabilities.volume.default !== undefined) {
      defaults.volume = capabilities.volume.default;
    }

    if (capabilities.formats && capabilities.formats.length > 0) {
      defaults.format = capabilities.formats[0];
    }

    if (capabilities.sampleRates && capabilities.sampleRates.length > 0) {
      defaults.sampleRate = capabilities.sampleRates[0];
    }

    return defaults;
  }

  /**
   * 检查服务是否支持某项能力
   * @param {string} adapterKey - 适配器标识
   * @param {string} capability - 能力名称 (streaming, realtime)
   * @returns {boolean}
   */
  hasCapability(adapterKey, capability) {
    const capabilities = this.providerCatalog.getCapabilities(adapterKey);
    if (!capabilities) {
      return false;
    }
    return capabilities[capability] === true;
  }
}

module.exports = {
  CapabilityValidator
};
