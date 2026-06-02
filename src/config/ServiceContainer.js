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

    // 0.2 VoiceRegistry — 双库裂变（官方只读 + 用户 Redis）
    const path = require('path');

    const officialRegistry = new VoiceRegistry({
      storagePath: path.join(__dirname, '../../voices/dist/voices.json'),
      readOnly: true
    });
    await officialRegistry.initialize();
    this._services.set('officialVoiceRegistry', officialRegistry);
    setVoiceRegistry(officialRegistry);

    // 0.21 Redis 连接池初始化
    const redisPool = require('./redis');
    await redisPool.initialize();

    let userRegistry;
    if (redisPool.isReady()) {
      const { RedisVoiceRegistry } = require('../modules/tts/application/RedisVoiceRegistry');
      userRegistry = new RedisVoiceRegistry({
        redis: redisPool.getPrimary(),
        sub: redisPool.getSubscriber(),
        hashKey: 'tts:voices:user',
        channel: 'tts:voices:channel',
        seedPath: path.join(__dirname, '../../voices/dist/user-voices.seed.json')
      });
      await userRegistry.initialize();
    } else {
      // Redis 不可用时回退到文件模式
      console.warn('[ServiceContainer] Redis unavailable — user voices fallback to file');
      userRegistry = new VoiceRegistry({
        storagePath: path.join(__dirname, '../../voices/dist/user-voices.json'),
        readOnly: false
      });
      try { await userRegistry.initialize(); } catch (e) {
        console.warn('[ServiceContainer] User voice registry init skipped:', e.message);
      }
      userRegistry.enableHotReload();
    }
    this._services.set('userVoiceRegistry', userRegistry);

    // 0.3 VoiceCatalog — 跨库聚合代理
    const voiceCatalog = new VoiceCatalog({ registries: [officialRegistry, userRegistry] });
    this._services.set('voiceCatalog', voiceCatalog);

    // 1. ProviderRegistry（统一注册表：manifest 解析 + adapter 自动加载）
    const { ProviderRegistry, ProviderManagementService, setProviderRegistry } = require('../modules/tts/provider-management');
    const credentials = require('../modules/credentials');

    const providerRegistry = new ProviderRegistry({ voiceRegistry: voiceCatalog });
    providerRegistry.initialize();

    // 开发环境自动启用热监听（仅 VoiceRegistry 文件实例，Redis 靠 Pub/Sub）
    if ((process.env.VOICE_HOT_RELOAD === 'true' || process.env.NODE_ENV !== 'production') && typeof userRegistry.enableHotReload === 'function') {
      userRegistry.enableHotReload();
    }
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
      voiceRegistry: voiceCatalog
    });
    this._services.set('ttsProviderAdapter', ttsProviderAdapter);

    // 5. VoiceCatalogAdapter（构造函数注入 voiceRegistry）
    const voiceCatalogAdapter = new VoiceCatalogAdapter({ voiceRegistry: voiceCatalog });
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
      await auditVoiceCoverage(officialRegistry, console);
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

    // 9.1 SynthesisQueue（合成排队系统，控制并发+排队+任务追踪）
    const { SynthesisQueue } = require('../modules/tts/infrastructure/SynthesisQueue');
    const synthesisQueue = new SynthesisQueue();
    this._services.set('synthesisQueue', synthesisQueue);

    // 10. 验证服务
    const validationService = new TtsValidationService();
    this._services.set('validationService', validationService);

    // 11. VoiceCatalog（查询门面，复用上面创建的 catalog 实例）
    const voiceCatalogQuery = voiceCatalog;
    this._services.set('voiceCatalogQuery', voiceCatalogQuery);

    // 12. VoiceResolver（音色解析器，切换到跨库 catalog）
    const voiceResolver = new VoiceResolver({ voiceCatalog, providerCatalog });
    this._services.set('voiceResolver', voiceResolver);

    // 13. 查询服务
    const queryService = new TtsQueryService({
      ttsProvider: ttsProviderAdapter,
      providerManagementService: pms,
      capabilityResolver: capabilityResolver,
      voiceCatalog: voiceCatalogAdapter,
      voiceCatalogQuery,
      voiceRegistry: voiceCatalog,
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
      synthesisQueue,
      voiceResolver,
      providerRegistry
    });
    this._services.set('synthesisService', synthesisService);

    // 16. VoiceWriteService（音色写入，供 VoiceOnboarding + voiceManageRoutes 共用）
    const { VoiceWriteService } = require('../modules/tts/application/VoiceWriteService');
    const voiceWriteService = new VoiceWriteService({ registry: userRegistry });
    this._services.set('voiceWriteService', voiceWriteService);

    // 17. VoiceRegistrationRegistry（音色克隆适配器注册表）
    const VoiceRegistrationRegistry = require('../modules/tts/voice-onboarding/VoiceRegistrationRegistry');
    const MossVoiceRegistrationAdapter = require('../modules/tts/voice-onboarding/adapters/MossVoiceRegistrationAdapter');
    const MimoVoiceRegistrationAdapter = require('../modules/tts/voice-onboarding/adapters/MimoVoiceRegistrationAdapter');
    const voiceRegRegistry = new VoiceRegistrationRegistry();
    voiceRegRegistry.register('moss', new MossVoiceRegistrationAdapter());
    voiceRegRegistry.register('mimo', new MimoVoiceRegistrationAdapter({
      audioStorage: require('../shared/utils/audioStorage').audioStorageManager
    }));
    this._services.set('voiceRegistrationRegistry', voiceRegRegistry);

    // 18. VoiceOnboardingService（音色入驻编排）
    const VoiceOnboardingService = require('../modules/tts/voice-onboarding/VoiceOnboardingService');
    const MossVoiceGenAdapter = require('../modules/tts/voice-onboarding/adapters/MossVoiceGenAdapter');
    const MimoVoiceGenAdapter = require('../modules/tts/voice-onboarding/adapters/MimoVoiceGenAdapter');
    const audioStorage = require('../shared/utils/audioStorage').audioStorageManager;
    const voiceGenAdapters = {
      moss: new MossVoiceGenAdapter({ audioStorage }),
      mimo: new MimoVoiceGenAdapter({ audioStorage })
    };
    const voiceOnboardingService = new VoiceOnboardingService({
      voiceWriteService,
      voiceRegistrationRegistry: voiceRegRegistry,
      ttsSynthesisService: synthesisService,
      credentials,
      voiceGenAdapters,
      enricher: new (require('../modules/tts/voice-onboarding/VoiceCreationEnricher').VoiceCreationEnricher)()
    });
    this._services.set('voiceOnboardingService', voiceOnboardingService);

    // 19. HTTP 适配器
    let clearAllCacheFn = null;
    try {
      const audioCache = require('../shared/utils/audioCache');
      clearAllCacheFn = audioCache.clearAllCache;
    } catch (e) { /* audioCache 可选 */ }
    const ttsHttpAdapter = new TtsHttpAdapter(synthesisService, queryService, { clearAllCache: clearAllCacheFn, providerRegistry, synthesisQueue });
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
