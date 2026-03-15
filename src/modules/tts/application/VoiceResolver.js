/**
 * VoiceResolver - 参数解析器
 *
 * 职责：
 * - 解析 service（支持 alias）
 * - 解析 voiceId
 * - 合并默认值
 * - 生成 provider 运行参数
 *
 * 约束：
 * - alias 解析只在这里做
 * - 默认值只在这里和 ttsDefaults.js 中取
 * - route 不得再写硬编码默认值
 * - 优先使用 voice.runtime，ttsConfig 作为兼容
 */

const { ProviderCatalog } = require('../catalog/ProviderCatalog');
const { VoiceCatalog } = require('../catalog/VoiceCatalog');
const ttsDefaults = require('../config/ttsDefaults');

const VoiceResolver = {
  /**
   * 解析合成请求参数
   *
   * @param {Object} request - 原始请求
   * @param {string} request.service - 服务标识（可以是 canonical key 或 alias）
   * @param {string} [request.voiceId] - 音色ID（系统ID）
   * @param {Object} [request.options] - 覆盖选项
   * @returns {Object} 解析结果
   *
   * @example
   * // 输入
   * {
   *   service: 'aliyun_qwen_http',
   *   voiceId: 'aliyun-qwen_http-cherry',
   *   options: { speed: 1.1, format: 'wav' }
   * }
   *
   * // 输出
   * {
   *   providerKey: 'aliyun',
   *   serviceKey: 'qwen_http',
   *   adapterKey: 'aliyun_qwen_http',
   *   voiceConfig: { ... },
   *   runtimeOptions: {
   *     voice: 'Cherry',
   *     model: 'qwen3-tts-flash',
   *     sampleRate: 24000,
   *     speed: 1.1,
   *     pitch: 1.0,
   *     format: 'wav'
   *   }
   * }
   */
  resolve(request) {
    const { service, voiceId, options = {} } = request;

    // 1. 解析 service 为 canonical key
    const canonicalKey = ProviderCatalog.resolveCanonicalKey(service);
    if (!canonicalKey) {
      const error = new Error(`Unknown service: ${service}`);
      error.code = 'UNKNOWN_SERVICE';
      throw error;
    }

    // 2. 获取 provider 配置
    const providerConfig = ProviderCatalog.get(canonicalKey);
    if (!providerConfig) {
      const error = new Error(`Provider config not found: ${canonicalKey}`);
      error.code = 'CONFIG_ERROR';
      throw error;
    }

    // 3. 获取默认值
    const defaults = ttsDefaults.getDefaults(canonicalKey);

    // 4. 解析音色配置（通过 VoiceCatalog，不直接访问 voiceRegistry）
    let effectiveVoiceId = voiceId;

    // 如果没有指定 voiceId，使用服务默认音色
    if (!effectiveVoiceId) {
      effectiveVoiceId = ttsDefaults.getDefaultVoiceId(canonicalKey);
    }

    // 通过 VoiceCatalog 获取运行时配置（已分离 profile/runtime）
    const voiceRuntime = effectiveVoiceId ? VoiceCatalog.getRuntime(effectiveVoiceId) : null;

    // 5. 构建运行时选项
    const runtimeOptions = this._buildRuntimeOptions({
      defaults,
      voiceRuntime,
      options,
      providerConfig
    });

    return {
      providerKey: providerConfig.provider,
      serviceKey: providerConfig.service,
      adapterKey: canonicalKey,
      voiceId: effectiveVoiceId,
      voiceRuntime,
      runtimeOptions
    };
  },

  /**
   * 构建运行时选项
   * @private
   */
  _buildRuntimeOptions({ defaults, voiceRuntime, options, providerConfig }) {
    // 基础选项：默认值
    const baseOptions = {
      speed: defaults.speed,
      pitch: defaults.pitch,
      volume: defaults.volume,
      format: defaults.format,
      sampleRate: defaults.sampleRate
    };

    // 合并：默认值 < 音色运行时配置 < 用户选项
    const merged = {
      ...baseOptions,
      ...(voiceRuntime || {}),  // VoiceCatalog.getRuntime() 已完成 runtime/ttsConfig 合并
      ...options
    };

    // 确保必要字段
    if (!merged.voice) {
      merged.voice = 'default';
    }

    return merged;
  },

  /**
   * 验证文本参数
   * @param {string} text
   * @throws {Error}
   */
  validateText(text) {
    const { minLength, maxLength } = ttsDefaults.textLimits;

    if (!text) {
      const error = new Error('Missing required parameter: text');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (typeof text !== 'string' || text.trim().length === 0) {
      const error = new Error('Text must be a non-empty string');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (text.length > maxLength) {
      const error = new Error(`Text length must not exceed ${maxLength} characters`);
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
  },

  /**
   * 获取服务的默认值（便捷方法）
   * @param {string} service
   * @returns {Object}
   */
  getDefaults(service) {
    const canonicalKey = ProviderCatalog.resolveCanonicalKey(service);
    return canonicalKey ? ttsDefaults.getDefaults(canonicalKey) : { ...ttsDefaults.common };
  }
};

module.exports = {
  VoiceResolver
};