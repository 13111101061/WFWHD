/**
 * TTS Providers - 服务商适配器注册中心
 *
 * [统一注册源] 所有服务商信息在此定义，包括：
 * - Adapter 类
 * - provider/service 标识
 * - 显示名称、描述、状态
 * - 别名映射
 * - 协议能力
 *
 * ProviderDescriptorRegistry 和 ProviderRuntimeRegistry 从此处读取
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
 * key 格式: provider_service (canonical key)
 *
 * 字段说明：
 * - Adapter: Adapter 类（必需）
 * - provider: 服务商标识（必需）
 * - service: 服务标识（必需）
 * - displayName: 显示名称（可选，用于 ProviderDescriptorRegistry）
 * - description: 描述（可选）
 * - status: 状态 stable/beta/deprecated（可选，默认 stable）
 * - aliases: 别名列表（可选）
 * - protocol: 协议类型 http/ws（可选，默认 http）
 * - supportsStreaming: 是否支持流式（可选，默认 false）
 * - supportsAsync: 是否支持异步（可选，默认 false）
 */
const adapters = {
  // ==================== 阿里云 ====================
  aliyun_cosyvoice: {
    Adapter: AliyunCosyVoiceAdapter,
    provider: 'aliyun',
    service: 'cosyvoice',
    displayName: '阿里云 CosyVoice',
    description: '阿里云 CosyVoice 语音合成',
    status: 'stable',
    aliases: ['cosyvoice'],
    protocol: 'http',
    supportsStreaming: true,
    supportsAsync: true
  },
  aliyun_qwen_http: {
    Adapter: AliyunQwenAdapter,
    provider: 'aliyun',
    service: 'qwen_http',
    displayName: '阿里云 Qwen HTTP',
    description: '阿里云通义千问语音合成 HTTP 接口',
    status: 'stable',
    aliases: ['aliyun_qwen', 'qwen_http'],
    protocol: 'http',
    supportsStreaming: false,
    supportsAsync: false
  },

  // ==================== 腾讯云 ====================
  tencent_tts: {
    Adapter: TencentTtsAdapter,
    provider: 'tencent',
    service: 'tts',
    displayName: '腾讯云 TTS',
    description: '腾讯云语音合成',
    status: 'stable',
    aliases: ['tencent'],
    protocol: 'http',
    supportsStreaming: false,
    supportsAsync: false
  },

  // ==================== 火山引擎 ====================
  volcengine_http: {
    Adapter: VolcengineTtsAdapter,
    provider: 'volcengine',
    service: 'volcengine_http',
    displayName: '火山引擎 HTTP',
    description: '火山引擎语音合成 HTTP 接口',
    status: 'stable',
    aliases: ['volcengine', 'volcengine_ws', 'volcengine_http_legacy'],
    protocol: 'http',
    supportsStreaming: false,
    supportsAsync: false
  },

  // ==================== MiniMax ====================
  minimax_tts: {
    Adapter: MinimaxTtsAdapter,
    provider: 'minimax',
    service: 'minimax_tts',
    displayName: 'MiniMax TTS',
    description: 'MiniMax 语音合成',
    status: 'beta',
    aliases: ['minimax'],
    protocol: 'http',
    supportsStreaming: false,
    supportsAsync: false
  },

  // ==================== MOSS ====================
  moss_tts: {
    Adapter: MossTtsAdapter,
    provider: 'moss',
    service: 'tts',
    displayName: 'MOSS TTS',
    description: 'MOSS 语音合成服务',
    status: 'beta',
    aliases: ['moss'],
    protocol: 'http',
    supportsStreaming: false,
    supportsAsync: false
  }
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

/**
 * 获取完整的适配器描述（用于 ProviderDescriptorRegistry）
 * @param {string} key - canonical key
 * @returns {Object|null}
 */
function getDescriptor(key) {
  const entry = adapters[key];
  if (!entry) return null;

  return {
    key,
    provider: entry.provider,
    service: entry.service,
    displayName: entry.displayName || key,
    description: entry.description || '',
    status: entry.status || 'stable',
    aliases: entry.aliases || [],
    protocol: entry.protocol || 'http',
    category: 'tts',
    supportsStreaming: entry.supportsStreaming || false,
    supportsAsync: entry.supportsAsync || false
  };
}

/**
 * 获取所有 canonical keys（不含别名）
 * @returns {string[]}
 */
function getCanonicalKeys() {
  return Object.keys(adapters);
}

/**
 * 获取所有适配器的完整描述列表
 * @returns {Object[]}
 */
function getAllDescriptors() {
  return Object.keys(adapters).map(key => getDescriptor(key));
}

/**
 * 构建 alias 到 canonical key 的映射
 * @returns {Map}
 */
function buildAliasMap() {
  const map = new Map();

  Object.keys(adapters).forEach(canonicalKey => {
    // canonical key 映射到自身
    map.set(canonicalKey, canonicalKey);

    // 注册所有别名
    const aliases = adapters[canonicalKey].aliases || [];
    aliases.forEach(alias => {
      map.set(alias, canonicalKey);
    });
  });

  return map;
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
  getDescriptor,
  getCanonicalKeys,
  getAllDescriptors,
  buildAliasMap,

  // 适配器映射
  adapters
};