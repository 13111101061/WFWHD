/**
 * ServiceContainer - 服务容器
 * 依赖注入容器，管理所有服务的创建和生命周期
 */

const { TtsSynthesisService } = require('../modules/tts/domain/TtsSynthesisService');
const TtsQueryService = require('../modules/tts/application/TtsQueryService');
const TtsValidationService = require('../modules/tts/domain/TtsValidationService');
const TtsHttpAdapter = require('../modules/tts/adapters/http/TtsHttpAdapter');
const { ttsProviderAdapter } = require('../modules/tts/adapters/TtsProviderAdapter');
const { voiceCatalogAdapter } = require('../modules/tts/adapters/VoiceCatalogAdapter');

// [新增] ProviderManifest 确保配置已加载
const { ProviderManifest } = require('../modules/tts/providers/manifests/ProviderManifest');
const { ExecutionPolicy } = require('../modules/tts/infrastructure/ExecutionPolicy');

class ServiceContainer {
  constructor() {
    this._services = new Map();
    this._initialized = false;
    this._initPromise = null;
  }

  /**
   * 初始化所有服务
   */
  async initialize() {
    if (this._initialized) return this;
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._doInitialize();
    return this._initPromise;
  }

  async _doInitialize() {
    console.log('[ServiceContainer] Initializing services...');

    // 0. 加载 Provider Manifest（取代散落的配置加载）
    ProviderManifest._ensureLoaded();
    this._services.set('providerManifest', ProviderManifest);

    // 0.1 [新增] 启动配置审计
    if (process.env.CONFIG_AUDIT !== 'false') {
      try {
        const { audit } = require('../modules/tts/config/ConfigConsistencyChecker');
        audit();
      } catch (e) {
        console.error('[ServiceContainer] Config audit failed:', e.message);
        if (process.env.CONFIG_MODE === 'strict') throw e;
      }
    }

    // 1. 初始化 FieldDefinitionSystem
    const FieldDefinitionSystem = require('../modules/tts/config/FieldDefinitionSystem');
    await FieldDefinitionSystem.initialize();
    this._services.set('fieldDefinitionSystem', FieldDefinitionSystem);

    // 2. 初始化 ProviderManagementService
    const { ProviderManagementService } = require('../modules/tts/provider-management');
    await ProviderManagementService.initialize();
    this._services.set('providerManagementService', ProviderManagementService);

    // 3. CapabilityResolver（单例）
    const { capabilityResolver } = require('../modules/tts/application/CapabilityResolver');
    this._services.set('capabilityResolver', capabilityResolver);

    // 4. 初始化适配器
    await voiceCatalogAdapter.initialize();
    await ttsProviderAdapter.initialize();

    // 5. 创建 ExecutionPolicy
    const executionPolicy = new ExecutionPolicy();
    this._services.set('executionPolicy', executionPolicy);

    // 6. 验证服务
    const validationService = new TtsValidationService();
    this._services.set('validationService', validationService);

    // 7. 查询服务
    const queryService = new TtsQueryService({
      ttsProvider: ttsProviderAdapter,
      providerManagementService: ProviderManagementService,
      capabilityResolver: capabilityResolver
    });
    this._services.set('queryService', queryService);

    // 8. 参数映射器
    const { parameterMapper } = require('../modules/tts/config/ParameterMapper');
    await parameterMapper.initialize();
    this._services.set('parameterMapper', parameterMapper);

    // 9. 参数解析服务
    const { parameterResolutionService } = require('../modules/tts/application/ParameterResolutionService');
    this._services.set('parameterResolutionService', parameterResolutionService);

    // 10. 创建合成服务（构造函数注入，消除 setter 时间耦合）
    const synthesisService = new TtsSynthesisService({
      ttsProvider: ttsProviderAdapter,
      voiceCatalog: voiceCatalogAdapter,
      validator: validationService,
      capabilityResolver: capabilityResolver,
      parameterResolutionService: parameterResolutionService,
      parameterMapper: parameterMapper,
      queryService: queryService,
      executionPolicy: executionPolicy
    });
    this._services.set('synthesisService', synthesisService);

    // 11. HTTP 适配器
    const ttsHttpAdapter = new TtsHttpAdapter(synthesisService);
    this._services.set('ttsHttpAdapter', ttsHttpAdapter);

    this._initialized = true;
    console.log('[ServiceContainer] Services initialized successfully');
    return this;
  }

  /**
   * 获取服务
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
   */
  register(name, service) {
    this._services.set(name, service);
  }

  isInitialized() {
    return this._initialized;
  }

  reset() {
    this._services.clear();
    this._initialized = false;
    this._initPromise = null;
  }

  getRegisteredServices() {
    return Array.from(this._services.keys());
  }
}

const serviceContainer = new ServiceContainer();
module.exports = serviceContainer;
