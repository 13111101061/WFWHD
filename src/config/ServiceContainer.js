/**
 * ServiceContainer - 服务容器
 * 依赖注入容器，管理所有服务的创建和生命周期。
 * 全部通过构造函数注入，无 setter，无模块级延迟加载。
 */

const { TtsSynthesisService } = require('../modules/tts/domain/TtsSynthesisService');
const TtsQueryService = require('../modules/tts/application/TtsQueryService');
const TtsValidationService = require('../modules/tts/domain/TtsValidationService');
const TtsHttpAdapter = require('../modules/tts/adapters/http/TtsHttpAdapter');
const { TtsProviderAdapter } = require('../modules/tts/adapters/TtsProviderAdapter');
const { CapabilityResolver } = require('../modules/tts/application/CapabilityResolver');
const { voiceCatalogAdapter } = require('../modules/tts/adapters/VoiceCatalogAdapter');

const { ProviderManifest } = require('../modules/tts/providers/manifests/ProviderManifest');
const { ExecutionPolicy } = require('../modules/tts/infrastructure/ExecutionPolicy');

class ServiceContainer {
  constructor() {
    this._services = new Map();
    this._initialized = false;
    this._initPromise = null;
  }

  async initialize() {
    if (this._initialized) return this;
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._doInitialize();
    return this._initPromise;
  }

  async _doInitialize() {
    console.log('[ServiceContainer] Initializing services...');

    // 0. 加载 Provider Manifest
    ProviderManifest._ensureLoaded();
    this._services.set('providerManifest', ProviderManifest);

    // 0.1 配置审计
    if (process.env.CONFIG_AUDIT !== 'false') {
      try {
        const { audit } = require('../modules/tts/config/ConfigConsistencyChecker');
        audit();
      } catch (e) {
        console.error('[ServiceContainer] Config audit failed:', e.message);
        if (process.env.CONFIG_MODE === 'strict') throw e;
      }
    }

    // 1. FieldDefinitionSystem
    const FieldDefinitionSystem = require('../modules/tts/config/FieldDefinitionSystem');
    await FieldDefinitionSystem.initialize();
    this._services.set('fieldDefinitionSystem', FieldDefinitionSystem);

    // 2. ProviderManagementService
    const { ProviderManagementService } = require('../modules/tts/provider-management');
    ProviderManagementService.initialize();
    this._services.set('providerManagementService', ProviderManagementService);

    // 3. 创建 TtsProviderAdapter（构造函数注入 PMS）
    const ttsProviderAdapter = new TtsProviderAdapter({
      providerManagementService: ProviderManagementService
    });
    this._services.set('ttsProviderAdapter', ttsProviderAdapter);

    // 4. 创建 CapabilityResolver（构造函数注入 getCompiledCapability）
    const capabilityResolver = new CapabilityResolver({
      getCompiledCapability: FieldDefinitionSystem.getCompiledCapability
    });
    this._services.set('capabilityResolver', capabilityResolver);

    // 5. 初始化适配器
    await voiceCatalogAdapter.initialize();
    await ttsProviderAdapter.initialize();

    // 5.1 音色一致性审计
    if (process.env.CONFIG_AUDIT !== 'false') {
      const { auditVoiceCoverage } = require('../modules/tts/config/ConfigConsistencyChecker');
      await auditVoiceCoverage();
    }

    // 6. ExecutionPolicy
    const executionPolicy = new ExecutionPolicy();
    this._services.set('executionPolicy', executionPolicy);

    // 7. 验证服务
    const validationService = new TtsValidationService();
    this._services.set('validationService', validationService);

    // 8. 查询服务
    const queryService = new TtsQueryService({
      ttsProvider: ttsProviderAdapter,
      providerManagementService: ProviderManagementService,
      capabilityResolver: capabilityResolver,
      voiceCatalog: voiceCatalogAdapter
    });
    this._services.set('queryService', queryService);

    // 9. 参数解析服务
    const { parameterResolutionService } = require('../modules/tts/application/ParameterResolutionService');
    this._services.set('parameterResolutionService', parameterResolutionService);

    // 10. 合成服务
    const synthesisService = new TtsSynthesisService({
      ttsProvider: ttsProviderAdapter,
      voiceCatalog: voiceCatalogAdapter,
      validator: validationService,
      capabilityResolver: capabilityResolver,
      parameterResolutionService: parameterResolutionService,
      executionPolicy: executionPolicy
    });
    this._services.set('synthesisService', synthesisService);

    // 11. HTTP 适配器
    const ttsHttpAdapter = new TtsHttpAdapter(synthesisService, queryService);
    this._services.set('ttsHttpAdapter', ttsHttpAdapter);

    this._initialized = true;
    console.log('[ServiceContainer] Services initialized successfully');
    return this;
  }

  get(name) {
    if (!this._initialized) {
      throw new Error('ServiceContainer not initialized. Call initialize() first.');
    }
    const service = this._services.get(name);
    if (!service) throw new Error(`Service not found: ${name}`);
    return service;
  }

  register(name, service) { this._services.set(name, service); }
  isInitialized() { return this._initialized; }

  reset() {
    this._services.clear();
    this._initialized = false;
    this._initPromise = null;
  }

  getRegisteredServices() { return Array.from(this._services.keys()); }
}

const serviceContainer = new ServiceContainer();
module.exports = serviceContainer;