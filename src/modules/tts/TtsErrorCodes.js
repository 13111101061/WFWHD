/**
 * TtsErrorCodes — TTS 微服务标准错误码
 *
 * 所有错误响应使用统一格式：
 *   { success: false, code: string, message: string, retryable: boolean, ... }
 *
 * 前端应基于 code 做判断，不依赖 message 内容。
 */

const TtsErrorCodes = Object.freeze({
  /** 输入参数不合法 */
  VALIDATION_ERROR: "VALIDATION_ERROR",

  /** 音色不存在 */
  VOICE_NOT_FOUND: "VOICE_NOT_FOUND",

  /** 服务标识无法识别 */
  UNKNOWN_SERVICE: "UNKNOWN_SERVICE",

  /** 服务商能力校验失败（参数范围/必填字段） */
  CAPABILITY_ERROR: "CAPABILITY_ERROR",

  /** 前端 Schema 版本过旧 */
  CAPABILITY_SCHEMA_OUTDATED: "CAPABILITY_SCHEMA_OUTDATED",

  /** 参数到服务商字段映射失败 */
  PARAMETER_MAPPING_ERROR: "PARAMETER_MAPPING_ERROR",

  /** 服务配置错误（API Key、manifest） */
  CONFIG_ERROR: "CONFIG_ERROR",

  /** Provider 返回鉴权失败（401） */
  PROVIDER_UNAUTHORIZED: "PROVIDER_UNAUTHORIZED",

  /** Provider 触发限流（429） */
  PROVIDER_RATE_LIMITED: "PROVIDER_RATE_LIMITED",

  /** Provider 内部错误（5xx） */
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",

  /** 熔断器已打开 */
  CIRCUIT_BREAKER_OPEN: "CIRCUIT_BREAKER_OPEN",

  /** 服务不可用 */
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",

  /** 请求超时 */
  TIMEOUT_ERROR: "TIMEOUT_ERROR",

  /** 计费相关错误 */
  BILLING_ERROR: "BILLING_ERROR",

  /** 内部未知错误 */
  INTERNAL_ERROR: "INTERNAL_ERROR",
});

/**
 * 错误码 → HTTP 状态码映射
 */
const HTTP_STATUS_MAP = Object.freeze({
  [TtsErrorCodes.VALIDATION_ERROR]: 400,
  [TtsErrorCodes.UNKNOWN_SERVICE]: 400,
  [TtsErrorCodes.CAPABILITY_ERROR]: 400,
  [TtsErrorCodes.PARAMETER_MAPPING_ERROR]: 400,
  [TtsErrorCodes.BILLING_ERROR]: 402,

  [TtsErrorCodes.VOICE_NOT_FOUND]: 404,

  [TtsErrorCodes.CAPABILITY_SCHEMA_OUTDATED]: 409,

  [TtsErrorCodes.PROVIDER_RATE_LIMITED]: 429,

  [TtsErrorCodes.TIMEOUT_ERROR]: 504,

  [TtsErrorCodes.PROVIDER_UNAUTHORIZED]: 502,
  [TtsErrorCodes.PROVIDER_UNAVAILABLE]: 502,

  [TtsErrorCodes.CIRCUIT_BREAKER_OPEN]: 503,
  [TtsErrorCodes.SERVICE_UNAVAILABLE]: 503,

  [TtsErrorCodes.CONFIG_ERROR]: 500,
  [TtsErrorCodes.INTERNAL_ERROR]: 500,
});

/**
 * 错误码 → 是否可重试
 */
const RETRYABLE_MAP = Object.freeze({
  [TtsErrorCodes.PROVIDER_RATE_LIMITED]: true,
  [TtsErrorCodes.PROVIDER_UNAVAILABLE]: true,
  [TtsErrorCodes.TIMEOUT_ERROR]: true,
  [TtsErrorCodes.CIRCUIT_BREAKER_OPEN]: true,
  [TtsErrorCodes.SERVICE_UNAVAILABLE]: true,
});

/**
 * API_ERROR / PROVIDER_ERROR 旧码 → 细分后的新码
 * 用于 GenericHttpAdapter._mapError 等场景。
 */
function resolveProviderError(httpStatus, innerMessage) {
  if (httpStatus === 401 || httpStatus === 403) return TtsErrorCodes.PROVIDER_UNAUTHORIZED;
  if (httpStatus === 429) return TtsErrorCodes.PROVIDER_RATE_LIMITED;
  if (httpStatus >= 500) return TtsErrorCodes.PROVIDER_UNAVAILABLE;
  if (httpStatus === 400) return TtsErrorCodes.VALIDATION_ERROR;
  return TtsErrorCodes.PROVIDER_UNAVAILABLE;
}

module.exports = {
  TtsErrorCodes,
  HTTP_STATUS_MAP,
  RETRYABLE_MAP,
  resolveProviderError,
};