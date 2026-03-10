/**
 * ServiceContainer - 服务容器
 * 依赖注入容器，管理所有服务的创建和生命周期
 *
 * 使用方式：
 * const container = require('./config/ServiceContainer');
 * const ttsHttpAdapter = container.get('ttsHttpAdapter');
 */

const TtsSynthesisService = require('../modules/tts/domain/TtsSynthesisService');
const TtsValidationService = require('../modules/tts/domain/TtsValidationService');
const TtsHttpAdapter = require('../modules/tts/adapters/http/TtsHttpAdapter');
const { ttsProviderAdapter } = require('../modules/tts/adapters/TtsProviderAdapter');
const { voiceCatalogAdapter } = require('../modules/tts/adapters/VoiceCatalogAdapter');

class ServiceContainer {
  constructor() {
    this._services = new Map();
    this._initialized = false;
  }

  /**
   * 初始化所有服务
   */
  async initialize() {
    if (this._initialized) return;

    console.log('[ServiceContainer] Initializing services...');

    // 1. 初始化适配器
    await voiceCatalogAdapter.initialize();
    await ttsProviderAdapter.initialize();

    // 2. 创建验证服务（无依赖）
    const validationService = new TtsValidationService();
    this._services.set('validationService', validationService);

    // 3. 创建领域服务（注入适配器）
    const synthesisService = new TtsSynthesisService({
      ttsProvider: ttsProviderAdapter,
      voiceCatalog: voiceCatalogAdapter,
      validator: validationService
    });
    this._services.set('synthesisService', synthesisService);

    // 4. 创建HTTP适配器（注入领域服务）
    const ttsHttpAdapter = new TtsHttpAdapter(synthesisService);
    this._services.set('ttsHttpAdapter', ttsHttpAdapter);

    this._initialized = true;
    console.log('[ServiceContainer] Services initialized successfully');

    return this;
  }

  /**
   * 获取服务
   * @param {string} name - 服务名称
   * @returns {Object}
   */
  get(name) {
    if (!this._initialized) {
      throw new Error('ServiceContainer not initialized. Call initialize() first.');
    }

    const service = this._services.get(name);
    if (!service) {
      throw new Error(`Service not found: ${name}`);
    }

    return service;
  }

  /**
   * 注册服务（用于测试覆盖）
   * @param {string} name
   * @param {Object} service
   */
  register(name, service) {
    this._services.set(name, service);
  }

  /**
   * 检查是否已初始化
   */
  isInitialized() {
    return this._initialized;
  }

  /**
   * 重置容器（用于测试）
   */
  reset() {
    this._services.clear();
    this._initialized = false;
  }

  /**
   * 获取所有已注册的服务名称
   */
  getRegisteredServices() {
    return Array.from(this._services.keys());
  }
}

// 导出单例
const serviceContainer = new ServiceContainer();

module.exports = serviceContainer;