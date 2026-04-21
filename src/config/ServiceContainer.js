/**
 * ServiceContainer - 服务容器
 * 依赖注入容器，管理所有服务的创建和生命周期
 *
 * 使用方式：
 * const container = require('./config/ServiceContainer');
 * const ttsHttpAdapter = container.get('ttsHttpAdapter');
 */

const { TtsSynthesisService } = require('../modules/tts/domain/TtsSynthesisService');
const TtsQueryService = require('../modules/tts/application/TtsQueryService');
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

    // 0. [新增] 初始化 FieldDefinitionSystem（字段定义单一事实源）
    const FieldDefinitionSystem = require('../modules/tts/config/FieldDefinitionSystem');
    FieldDefinitionSystem.initialize();
    this._services.set('fieldDefinitionSystem', FieldDefinitionSystem);

    // 0.1 [新增] 初始化 ProviderManagementService（统一服务商管理门面）
    const { ProviderManagementService } = require('../modules/tts/provider-management');
    ProviderManagementService.initialize();
    this._services.set('providerManagementService', ProviderManagementService);

    // 0.2 [前置] 加载单例服务（无异步初始化，可提前加载）
    const { capabilityResolver } = require('../modules/tts/application/CapabilityResolver');
    this._services.set('capabilityResolver', capabilityResolver);

    // 1. 初始化适配器
    await voiceCatalogAdapter.initialize();
    await ttsProviderAdapter.initialize();

    // 2. 创建验证服务（无依赖）
    const validationService = new TtsValidationService();
    this._services.set('validationService', validationService);

    // 3. 创建查询服务（注入依赖）
    const queryService = new TtsQueryService({
      ttsProvider: ttsProviderAdapter,
      providerManagementService: ProviderManagementService,
      capabilityResolver: capabilityResolver
    });
    this._services.set('queryService', queryService);

    // 4. 创建领域服务（注入适配器）
    const synthesisService = new TtsSynthesisService({
      ttsProvider: ttsProviderAdapter,
      voiceCatalog: voiceCatalogAdapter,
      validator: validationService
    });

    // 注入查询服务
    synthesisService.setQueryService(queryService);

    // 5. 初始化并注入能力校验器
    const { CapabilityValidator } = require('../modules/tts/domain/CapabilityValidator');
    const { ProviderCatalog } = require('../modules/tts/catalog/ProviderCatalog');

    const capabilityValidator = new CapabilityValidator(ProviderCatalog);
    this._services.set('capabilityValidator', capabilityValidator);
    synthesisService.setCapabilityValidator(capabilityValidator);

    // 6. [新增] 注入 CapabilityResolver 和 ParameterResolutionService
    // capabilityResolver 已在步骤 0.1 加载，直接使用
    synthesisService.setCapabilityResolver(capabilityResolver);

    const { parameterResolutionService } = require('../modules/tts/application/ParameterResolutionService');
    this._services.set('parameterResolutionService', parameterResolutionService);
    synthesisService.setParameterResolutionService(parameterResolutionService);

    // 7. [启用] ParameterMapper - 参数映射器
    const { parameterMapper } = require('../modules/tts/config/ParameterMapper');
    await parameterMapper.initialize();
    this._services.set('parameterMapper', parameterMapper);
    synthesisService.setParameterMapper(parameterMapper);

    this._services.set('synthesisService', synthesisService);

    // 8. 创建HTTP适配器（注入领域服务）
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