/**
 * TTS Adapters - 适配器层统一入口
 *
 * 六边形架构的适配器层
 */

// 服务商适配器
const providers = require('./providers');
const BaseTtsAdapter = require('./providers/BaseTtsAdapter');

// 端口适配器
const TtsProviderAdapter = require('./TtsProviderAdapter');
const VoiceCatalogAdapter = require('./VoiceCatalogAdapter');

// HTTP适配器
const { TtsHttpAdapter } = require('./http');

module.exports = {
  // 服务商适配器
  providers,
  BaseTtsAdapter,

  // 端口适配器
  TtsProviderAdapter,
  VoiceCatalogAdapter,

  // HTTP适配器
  TtsHttpAdapter,

  // 便捷方法
  createProvider: (key, config) => providers.createProvider(key, config)
};