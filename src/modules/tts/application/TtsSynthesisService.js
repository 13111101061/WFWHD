/**
 * TtsSynthesisService - TTS 合成服务
 *
 * 职责：
 * - 接收标准化请求
 * - 调 VoiceResolver 解析参数
 * - 调用 adapter 执行合成
 * - 返回统一合成结果 DTO
 *
 * 禁止事项：
 * - 不要在 route 里再写 provider 选择逻辑
 * - 不要在 adapter 里做目录字段解析
 */

const { VoiceResolver } = require('./VoiceResolver');
const { createProvider } = require('../adapters/providers');
const credentials = require('../../credentials');
const { buildSynthesisSuccessResponse, buildSynthesisErrorResponse, getErrorStatusCode } = require('../catalog/dto/synthesisResultDto');

const TtsSynthesisService = {
  /**
   * 执行语音合成
   *
   * @param {Object} request - 合成请求
   * @param {string} request.text - 要合成的文本
   * @param {string} request.service - 服务标识
   * @param {string} [request.voiceId] - 音色ID
   * @param {Object} [request.options] - 额外选项
   * @returns {Promise<Object>} 合成结果
   *
   * @example
   * const result = await TtsSynthesisService.synthesize({
   *   text: '你好世界',
   *   service: 'aliyun_qwen_http',
   *   voiceId: 'aliyun-qwen_http-cherry',
   *   options: { speed: 1.1, format: 'wav' }
   * });
   */
  async synthesize(request) {
    const { text, service, voiceId, options = {} } = request;

    try {
      // 1. 验证文本
      VoiceResolver.validateText(text);

      // 2. 解析参数（合并默认值、解析 voiceId）
      const resolved = VoiceResolver.resolve({
        service,
        voiceId,
        options
      });

      // 3. 检查服务商凭证
      const providerKey = resolved.providerKey;
      if (!credentials.isConfigured(providerKey)) {
        return buildSynthesisErrorResponse({
          error: `Provider not configured: ${providerKey}`,
          code: 'PROVIDER_NOT_CONFIGURED',
          provider: providerKey,
          hint: 'Please check API key configuration'
        });
      }

      // 4. 创建适配器并执行合成
      const adapter = createProvider(resolved.adapterKey);
      const result = await adapter.synthesizeAndSave(text, resolved.runtimeOptions);

      // 5. 构建成功响应
      return buildSynthesisSuccessResponse({
        audioUrl: result.url,
        format: result.format,
        size: result.size,
        isRemote: result.isRemote,
        provider: resolved.adapterKey,
        voice: resolved.runtimeOptions.voice
      });

    } catch (error) {
      // 构建错误响应
      return buildSynthesisErrorResponse({
        error: error.message,
        code: error.code,
        provider: error.provider || service
      });
    }
  },

  /**
   * 获取合成错误的状态码
   * @param {Object} result - synthesize 返回的结果
   * @returns {number} HTTP 状态码
   */
  getStatusCode(result) {
    if (result.success) {
      return 200;
    }
    // 从错误结果中获取状态码
    const code = result.code;
    switch (code) {
      case 'VALIDATION_ERROR':
        return 400;
      case 'PROVIDER_NOT_CONFIGURED':
      case 'CONFIG_ERROR':
        return 503;
      case 'UNKNOWN_SERVICE':
        return 400;
      default:
        return 500;
    }
  },

  /**
   * 快捷合成（预设服务）
   * @param {string} serviceKey - 服务标识
   * @param {string} text - 文本
   * @param {Object} [options] - 选项
   * @returns {Promise<Object>}
   */
  async quickSynthesize(serviceKey, text, options = {}) {
    return this.synthesize({
      text,
      service: serviceKey,
      options
    });
  }
};

module.exports = {
  TtsSynthesisService
};