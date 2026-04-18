/**
 * TTS Module - 语音合成模块
 *
 * 模块职责：提供统一的TTS服务，支持多提供商、多音色
 *
 * 架构设计：
 * - Domain: 纯业务逻辑（SynthesisRequest, AudioResult, TtsSynthesisService）
 * - Ports: 接口定义（TtsProviderPort, VoiceCatalogPort）
 * - Adapters: 具体实现（TtsProviderAdapter, VoiceCatalogAdapter, TtsHttpAdapter）
 * - Core: 核心组件（TtsFactory, VoiceRegistry, TtsServiceManager）
 *
 * 使用方式：
 * ```javascript
 * const ttsModule = require('./modules/tts');
 *
 * // 初始化
 * await ttsModule.initialize();
 *
 * // 获取HTTP适配器（用于Express路由）
 * const httpAdapter = ttsModule.getHttpAdapter();
 * app.post('/api/tts/synthesize', (req, res) => httpAdapter.synthesize(req, res));
 *
 * // 音色管理
 * const registry = ttsModule.getVoiceRegistry();
 * registry.add({ id: 'new-voice', provider: 'aliyun', ... });
 * await registry.save(); // 可选持久化
 * ```
 */

const ServiceContainer = require('../../config/ServiceContainer');
const { voiceRegistry, VoiceRegistry } = require('./core/VoiceRegistry');

// 状态
let _initialized = false;

/**
 * 初始化TTS模块
 */
async function initialize() {
  if (_initialized) {
    console.warn('[TtsModule] Already initialized, skipping...');
    return;
  }

  await ServiceContainer.initialize();
  _initialized = true;
  console.log('[TtsModule] Initialized successfully');
}

/**
 * 获取合成服务
 */
function getSynthesisService() {
  if (!_initialized) {
    throw new Error('[TtsModule] Not initialized. Call initialize() first.');
  }
  return ServiceContainer.get('synthesisService');
}

/**
 * 获取HTTP适配器
 */
function getHttpAdapter() {
  if (!_initialized) {
    throw new Error('[TtsModule] Not initialized. Call initialize() first.');
  }
  return ServiceContainer.get('ttsHttpAdapter');
}

/**
 * 获取验证服务
 */
function getValidationService() {
  if (!_initialized) {
    throw new Error('[TtsModule] Not initialized. Call initialize() first.');
  }
  return ServiceContainer.get('validationService');
}

/**
 * 获取音色注册中心
 */
function getVoiceRegistry() {
  return voiceRegistry;
}

/**
 * 检查是否已初始化
 */
function isInitialized() {
  return _initialized;
}

/**
 * 重置模块（用于测试）
 */
function reset() {
  ServiceContainer.reset();
  _initialized = false;
}

// 导出模块接口
module.exports = {
  // 核心方法
  initialize,
  isInitialized,
  reset,

  // 服务获取
  getSynthesisService,
  getHttpAdapter,
  getValidationService,
  getVoiceRegistry,

  // 音色管理
  voiceRegistry,
  VoiceRegistry,

  // 类型导出（用于扩展）
  SynthesisRequest: require('./domain/SynthesisRequest'),
  AudioResult: require('./domain/AudioResult'),
  TtsSynthesisService: require('./domain/TtsSynthesisService').TtsSynthesisService,  // 兼容解构导出
  TtsValidationService: require('./domain/TtsValidationService'),
  TtsProviderPort: require('./ports/TtsProviderPort'),
  VoiceCatalogPort: require('./ports/VoiceCatalogPort'),
  TtsHttpAdapter: require('./adapters/http/TtsHttpAdapter')
};