/**
 * TTS 统一常量限制 — 单一事实源
 *
 * 所有模块从此引用，避免散落在安全中间件、SynthesisRequest、TtsHttpAdapter 多处。
 */

module.exports = {
  MAX_TEXT_LENGTH: 10000,
  MAX_BATCH_SIZE: 10,
  MAX_BATCH_TEXT_LENGTH: 5000,

  // ExecutionPolicy defaults
  DEFAULT_TIMEOUT_MS: 60000,
  DEFAULT_RETRY_TIMES: 1,
  DEFAULT_RATE_LIMIT_PER_MIN: 100,

  // Audio
  MAX_AUDIO_SIZE_BYTES: 50 * 1024 * 1024, // 50MB
};
