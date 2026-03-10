/**
 * TTS Adapters - 适配器层统一入口
 *
 * 六边形架构的适配器层，包含：
 * - providers/: TTS提供者适配器（实现 ITtsProvider 端口）
 * - VoiceCatalogAdapter: 音色目录适配器（实现 IVoiceCatalog 端口）
 * - TtsProviderAdapter: TTS提供者门面（聚合多个provider）
 * - http/: HTTP适配器（Express专用）
 */

// 提供者适配器
const providers = require('./providers');
const BaseTtsAdapter = require('./providers/BaseTtsAdapter');

// 端口适配器
const TtsProviderAdapter = require('./TtsProviderAdapter');
const VoiceCatalogAdapter = require('./VoiceCatalogAdapter');

// HTTP适配器
const { TtsHttpAdapter } = require('./http');

module.exports = {
  // 提供者适配器
  providers,
  BaseTtsAdapter,

  // 端口适配器（单例）
  TtsProviderAdapter,
  VoiceCatalogAdapter,

  // HTTP适配器
  TtsHttpAdapter,

  // 便捷创建方法
  createProviderAdapter: (provider, serviceType, config) => {
    return providers.createAdapter(provider, serviceType, config);
  }
};