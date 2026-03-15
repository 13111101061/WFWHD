/**
 * SynthesisResultDto - 合成结果输出 DTO
 *
 * 用于 /api/tts/synthesize 接口返回
 * 统一合成结果格式
 */

/**
 * 构建合成成功响应
 * @param {Object} params
 * @param {string} params.audioUrl - 音频 URL
 * @param {string} params.format - 音频格式
 * @param {number} [params.size] - 文件大小
 * @param {boolean} [params.isRemote] - 是否远程 URL
 * @param {string} params.provider - 服务商
 * @param {string} params.voice - 使用的音色
 * @param {number} [params.duration] - 音频时长（秒）
 * @returns {Object}
 */
function buildSynthesisSuccessResponse(params) {
  const {
    audioUrl,
    format,
    size,
    isRemote,
    provider,
    voice,
    duration
  } = params;

  const data = {
    audioUrl,
    format,
    provider,
    voice,
    isRemote: isRemote !== undefined ? isRemote : false
  };

  // 可选字段
  if (size !== undefined) {
    data.size = size;
  }

  if (duration !== undefined) {
    data.duration = duration;
  }

  return {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };
}

/**
 * 构建合成失败响应
 * @param {Object} params
 * @param {string} params.error - 错误信息
 * @param {string} [params.code] - 错误码
 * @param {string} [params.provider] - 服务商
 * @param {string} [params.hint] - 提示信息
 * @returns {Object}
 */
function buildSynthesisErrorResponse(params) {
  const { error, code, provider, hint } = params;

  const response = {
    success: false,
    error
  };

  if (code) {
    response.code = code;
  }

  if (provider) {
    response.provider = provider;
  }

  if (hint) {
    response.hint = hint;
  }

  response.timestamp = new Date().toISOString();

  return response;
}

/**
 * 从 adapter 结果构建响应
 * @param {Object} result - adapter.synthesizeAndSave() 返回的结果
 * @param {Object} context - 上下文信息
 * @param {string} context.provider - 服务商
 * @param {string} context.voice - 音色
 * @returns {Object}
 */
function buildResponseFromResult(result, context) {
  return buildSynthesisSuccessResponse({
    audioUrl: result.url,
    format: result.format,
    size: result.size,
    isRemote: result.isRemote,
    provider: context.provider,
    voice: context.voice
  });
}

/**
 * 根据错误类型确定 HTTP 状态码
 * @param {Error} error
 * @returns {number}
 */
function getErrorStatusCode(error) {
  switch (error.code) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'CONFIG_ERROR':
    case 'PROVIDER_NOT_CONFIGURED':
      return 503;
    case 'UNKNOWN_SERVICE':
      return 400;
    case 'PROVIDER_ERROR':
      return 502;
    default:
      return 500;
  }
}

module.exports = {
  buildSynthesisSuccessResponse,
  buildSynthesisErrorResponse,
  buildResponseFromResult,
  getErrorStatusCode
};