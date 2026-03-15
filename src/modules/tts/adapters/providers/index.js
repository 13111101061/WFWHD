/**
 * TTS Providers - 服务商适配器注册中心
 *
 * 统一管理所有TTS服务商适配器
 * 凭证由 credentials 模块统一管理
 */

const BaseTtsAdapter = require('./BaseTtsAdapter');
const AliyunCosyVoiceAdapter = require('./AliyunCosyVoiceAdapter');
const AliyunQwenAdapter = require('./AliyunQwenAdapter');
const TencentTtsAdapter = require('./TencentTtsAdapter');
const VolcengineTtsAdapter = require('./VolcengineTtsAdapter');
const MinimaxTtsAdapter = require('./MinimaxTtsAdapter');
const MossTtsAdapter = require('./MossTtsAdapter');

/**
 * 服务商适配器映射
 * key 格式: provider_service
 */
const adapters = {
  // 阿里云
  aliyun_cosyvoice: { Adapter: AliyunCosyVoiceAdapter, provider: 'aliyun', service: 'cosyvoice' },
  aliyun_qwen_http: { Adapter: AliyunQwenAdapter, provider: 'aliyun', service: 'qwen_http' },
  aliyun_qwen: { Adapter: AliyunQwenAdapter, provider: 'aliyun', service: 'qwen_http' },

  // 腾讯云
  tencent: { Adapter: TencentTtsAdapter, provider: 'tencent', service: 'tts' },
  tencent_tts: { Adapter: TencentTtsAdapter, provider: 'tencent', service: 'tts' },

  // 火山引擎
  volcengine: { Adapter: VolcengineTtsAdapter, provider: 'volcengine', service: 'http' },
  volcengine_http: { Adapter: VolcengineTtsAdapter, provider: 'volcengine', service: 'http' },

  // MiniMax
  minimax: { Adapter: MinimaxTtsAdapter, provider: 'minimax', service: 'tts' },
  minimax_tts: { Adapter: MinimaxTtsAdapter, provider: 'minimax', service: 'tts' },

  // MOSS-TTS
  moss: { Adapter: MossTtsAdapter, provider: 'moss', service: 'tts' },
  moss_tts: { Adapter: MossTtsAdapter, provider: 'moss', service: 'tts' }
};

/**
 * 创建服务商适配器实例
 * @param {string} key - 适配器标识
 * @param {Object} customConfig - 自定义配置
 */
function createProvider(key, customConfig = {}) {
  const entry = adapters[key];

  if (!entry) {
    throw new Error(`Unknown TTS provider: ${key}`);
  }

  return new entry.Adapter({
    provider: entry.provider,
    serviceType: entry.service,
    ...customConfig
  });
}

/**
 * 获取所有已注册的适配器
 */
function getRegisteredProviders() {
  return Object.keys(adapters);
}

/**
 * 检查适配器是否已注册
 */
function hasProvider(key) {
  return key in adapters;
}

/**
 * 获取适配器信息
 */
function getAdapterInfo(key) {
  const entry = adapters[key];
  if (!entry) return null;

  return {
    key,
    provider: entry.provider,
    service: entry.service,
    adapterName: entry.Adapter.name
  };
}

module.exports = {
  // 基类
  BaseTtsAdapter,

  // 具体适配器
  AliyunCosyVoiceAdapter,
  AliyunQwenAdapter,
  TencentTtsAdapter,
  VolcengineTtsAdapter,
  MinimaxTtsAdapter,
  MossTtsAdapter,

  // 工厂方法
  createProvider,
  getRegisteredProviders,
  hasProvider,
  getAdapterInfo,

  // 适配器映射
  adapters
};