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
const { VoiceCatalogAdapter } = require('../modules/tts/adapters/VoiceCatalogAdapter');
const { VoiceCatalog } = require('../modules/tts/catalog/VoiceCatalog');
const { VoiceResolver } = require('../modules/tts/application/VoiceResolver');
const { VoiceRegistry, setVoiceRegistry } = require('../modules/tts/core/VoiceRegistry');
const { ProviderCatalog } = require('../modules/tts/catalog/ProviderCatalog');

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

    // 0.2 VoiceRegistry（音色注册中心）
    const defaultRedisConfig = process.env.REDIS_HOST ? {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379')
    } : null;

    const voiceRegistry = new VoiceRegistry({ redis: defaultRedisConfig });
    await voiceRegistry.initialize();
    setVoiceRegistry(voiceRegistry);
    this._services.set('voiceRegistry', voiceRegistry);

    // 1. ProviderRegistry（统一注册表：manifest 解析 + adapter 自动加载）
    const { ProviderRegistry, ProviderManagementService, setProviderRegistry } = require('../modules/tts/provider-management');
    const credentials = require('../modules/credentials');

    const providerRegistry = new ProviderRegistry({ voiceRegistry });
    providerRegistry.initialize();
    setProviderRegistry(providerRegistry);
    this._services.set('providerRegistry', providerRegistry);

    // 2. ProviderManagementService（凭证感知包装）
    const pms = new ProviderManagementService({ providerRegistry, credentials });
    this._services.set('providerManagementService', pms);

    // 3. FieldDefinitionSystem（传入 providerRegistry 供 CapabilityCompiler 使用）
    const FieldDefinitionSystem = require('../modules/tts/config/FieldDefinitionSystem');
    await FieldDefinitionSystem.initialize({ providerRegistry });
    this._services.set('fieldDefinitionSystem', FieldDefinitionSystem);

    // 4. TtsProviderAdapter（构造函数注入 PMS + voiceRegistry）
    const ttsProviderAdapter = new TtsProviderAdapter({
      providerManagementService: pms,
      voiceRegistry
    });
    this._services.set('ttsProviderAdapter', ttsProviderAdapter);

    // 5. VoiceCatalogAdapter（构造函数注入 voiceRegistry）
    const voiceCatalogAdapter = new VoiceCatalogAdapter({ voiceRegistry });
    await voiceCatalogAdapter.initialize();
    this._services.set('voiceCatalogAdapter', voiceCatalogAdapter);

    // 6. ProviderCatalog（服务商目录，构造函数注入 providerRegistry）
    const providerCatalog = new ProviderCatalog({ providerRegistry });
    this._services.set('providerCatalog', providerCatalog);

    // 7. CapabilityResolver（构造函数注入 getCompiledCapability + providerRegistry）
    const capabilityResolver = new CapabilityResolver({
      getCompiledCapability: FieldDefinitionSystem.getCompiledCapability,
      providerRegistry
    });
    FieldDefinitionSystem.onReload(() => capabilityResolver.clearCache());
    this._services.set('capabilityResolver', capabilityResolver);

    // 8. 初始化适配器
    await ttsProviderAdapter.initialize();

    // 8.1 音色一致性审计
    if (process.env.CONFIG_AUDIT !== 'false') {
      const { auditVoiceCoverage } = require('../modules/tts/config/ConfigConsistencyChecker');
      await auditVoiceCoverage(voiceRegistry, console);
    }

    // 9. ExecutionPolicy（从 manifest 注册 per-service 配置）
    const executionPolicy = new ExecutionPolicy();
    for (const serviceKey of ProviderManifest.getAllServiceKeys()) {
      const svcConfig = ProviderManifest.getServiceConfig(serviceKey);
      if (svcConfig?.executionPolicy) {
        executionPolicy.registerServiceConfig(serviceKey, svcConfig.executionPolicy);
      }
    }
    this._services.set('executionPolicy', executionPolicy);

    // 10. 验证服务
    const validationService = new TtsValidationService();
    this._services.set('validationService', validationService);

    // 11. VoiceCatalog（查询门面，构造函数注入 voiceRegistry）
    const voiceCatalogQuery = new VoiceCatalog({ voiceRegistry });
    this._services.set('voiceCatalogQuery', voiceCatalogQuery);

    // 12. VoiceResolver（音色解析器，构造函数注入 voiceRegistry + providerCatalog）
    const voiceResolver = new VoiceResolver({ voiceRegistry, providerCatalog });
    this._services.set('voiceResolver', voiceResolver);

    // 13. 查询服务
    const queryService = new TtsQueryService({
      ttsProvider: ttsProviderAdapter,
      providerManagementService: pms,
      capabilityResolver: capabilityResolver,
      voiceCatalog: voiceCatalogAdapter,
      voiceCatalogQuery,
      voiceRegistry,
      providerRegistry
    });
    this._services.set('queryService', queryService);

    // 14. 参数解析服务
    const { ParameterResolutionService } = require('../modules/tts/application/ParameterResolutionService');
    const parameterResolutionService = new ParameterResolutionService();
    this._services.set('parameterResolutionService', parameterResolutionService);

    // 15. 合成服务
    const synthesisService = new TtsSynthesisService({
      ttsProvider: ttsProviderAdapter,
      voiceCatalog: voiceCatalogAdapter,
      validator: validationService,
      capabilityResolver: capabilityResolver,
      parameterResolutionService: parameterResolutionService,
      executionPolicy: executionPolicy,
      voiceResolver,
      providerRegistry
    });
    this._services.set('synthesisService', synthesisService);

    // 16. HTTP 适配器
    let clearAllCacheFn = null;
    try {
      const audioCache = require('../shared/utils/audioCache');
      clearAllCacheFn = audioCache.clearAllCache;
    } catch (e) { /* audioCache 可选 */ }
    const ttsHttpAdapter = new TtsHttpAdapter(synthesisService, queryService, { clearAllCache: clearAllCacheFn, providerRegistry });
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
