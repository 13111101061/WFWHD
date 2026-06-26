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
const path = require('path');
const redisPool = require('./redis');
const credentials = require('../modules/credentials');
const { audit, auditVoiceCoverage } = require('../modules/tts/config/ConfigConsistencyChecker');
const { RedisVoiceRegistry } = require('../modules/tts/application/RedisVoiceRegistry');
const { ProviderRegistry, ProviderManagementService, setProviderRegistry } = require('../modules/tts/provider-management');
const FieldDefinitionSystem = require('../modules/tts/config/FieldDefinitionSystem');
const { SynthesisQueue } = require('../modules/tts/infrastructure/SynthesisQueue');
const { ProviderMetricsCollector } = require('../modules/tts/infrastructure/ProviderMetricsCollector');
const { ProviderFallbackChain } = require('../modules/tts/infrastructure/ProviderFallbackChain');
const { ParameterResolutionService } = require('../modules/tts/application/ParameterResolutionService');
const { VoiceWriteService } = require('../modules/tts/application/VoiceWriteService');
const VoiceCreationRegistry = require('../modules/tts/voice-onboarding/VoiceCreationRegistry');
const MossVoiceCreationAdapter = require('../modules/tts/voice-onboarding/adapters/MossVoiceCreationAdapter');
const MimoVoiceCreationAdapter = require('../modules/tts/voice-onboarding/adapters/MimoVoiceCreationAdapter');
const VoiceOnboardingService = require('../modules/tts/voice-onboarding/VoiceOnboardingService');
const { VoiceCreationEnricher } = require('../modules/tts/voice-onboarding/VoiceCreationEnricher');
const { audioStorageManager } = require('../shared/utils/audioStorage');
let audioCache = null;
try { audioCache = require('../shared/utils/audioCache'); } catch (_e) { /* audioCache 可选 */ }
const { ManifestWatcher } = require('../modules/tts/config/ManifestWatcher');

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

    this._initManifestAndAudit();
    await this._initVoiceRegistries();
    this._initProviderStack();
    await this._initCapabilityStack();
    this._initResilienceStack();
    this._initSynthesisStack();
    this._initVoiceManagementStack();
    this._initHttpAdapter();
    this._initHotReload();

    this._initialized = true;
    console.log('[ServiceContainer] Services initialized successfully');
    return this;
  }

  // ==================== 初始化阶段 ====================

  /** 阶段 0: Manifest 加载 + 配置审计 */
  _initManifestAndAudit() {
    ProviderManifest._ensureLoaded();
    this._services.set('providerManifest', ProviderManifest);

    if (process.env.CONFIG_AUDIT !== 'false') {
      try {
        audit();
      } catch (e) {
        console.error('[ServiceContainer] Config audit failed:', e.message);
        if (process.env.CONFIG_MODE === 'strict') throw e;
      }
    }
  }

  /** 阶段 0.2: 音色注册表（官方只读 + 用户 Redis/文件 + VoiceCatalog） */
  async _initVoiceRegistries() {
    const officialRegistry = new VoiceRegistry({
      storagePath: path.join(__dirname, '../../voices/dist/voices.json'),
      readOnly: true
    });
    await officialRegistry.initialize();
    this._services.set('officialVoiceRegistry', officialRegistry);
    setVoiceRegistry(officialRegistry);

    await redisPool.initialize();

    let userRegistry;
    if (redisPool.isReady()) {
      userRegistry = new RedisVoiceRegistry({
        redis: redisPool.getPrimary(),
        sub: redisPool.getSubscriber(),
        hashKey: 'tts:voices:user',
        channel: 'tts:voices:channel',
        seedPath: path.join(__dirname, '../../voices/dist/user-voices.seed.json')
      });
      await userRegistry.initialize();
    } else {
      console.warn('[ServiceContainer] Redis unavailable — user voices fallback to file');
      userRegistry = new VoiceRegistry({
        storagePath: path.join(__dirname, '../../voices/dist/user-voices.json'),
        readOnly: false
      });
      try { await userRegistry.initialize(); } catch (e) {
        console.warn('[ServiceContainer] User voice registry init skipped:', e.message);
      }
      // enableHotReload 移至 _initProviderStack 统一调用，避免重复触发
    }
    this._services.set('userVoiceRegistry', userRegistry);

    const voiceCatalog = new VoiceCatalog({ registries: [officialRegistry, userRegistry] });
    this._services.set('voiceCatalog', voiceCatalog);
  }

  /** 阶段 1-2: ProviderRegistry + ProviderManagementService */
  _initProviderStack() {
    const voiceCatalog = this._services.get('voiceCatalog');
    const userRegistry = this._services.get('userVoiceRegistry');

    const providerRegistry = new ProviderRegistry({ voiceRegistry: voiceCatalog });
    providerRegistry.initialize();

    // 开发环境自动启用热监听（幂等守卫：仅在 enableHotReload 可用时调用一次）
    if (
      (process.env.VOICE_HOT_RELOAD === 'true' || process.env.NODE_ENV !== 'production') &&
      typeof userRegistry.enableHotReload === 'function'
    ) {
      userRegistry.enableHotReload();
    }

    setProviderRegistry(providerRegistry);
    this._services.set('providerRegistry', providerRegistry);

    const pms = new ProviderManagementService({ providerRegistry, credentials });
    this._services.set('providerManagementService', pms);
  }

  /** 阶段 3-8: FieldDefinitionSystem + 适配器 + CapabilityResolver */
  async _initCapabilityStack() {
    const voiceCatalog = this._services.get('voiceCatalog');
    const providerRegistry = this._services.get('providerRegistry');
    const pms = this._services.get('providerManagementService');

    await FieldDefinitionSystem.initialize({ providerRegistry });
    this._services.set('fieldDefinitionSystem', FieldDefinitionSystem);

    const ttsProviderAdapter = new TtsProviderAdapter({
      providerManagementService: pms,
      voiceRegistry: voiceCatalog
    });
    this._services.set('ttsProviderAdapter', ttsProviderAdapter);

    const voiceCatalogAdapter = new VoiceCatalogAdapter({ voiceRegistry: voiceCatalog });
    await voiceCatalogAdapter.initialize();
    this._services.set('voiceCatalogAdapter', voiceCatalogAdapter);

    const providerCatalog = new ProviderCatalog({ providerRegistry });
    this._services.set('providerCatalog', providerCatalog);

    const capabilityResolver = new CapabilityResolver({
      getCompiledCapability: FieldDefinitionSystem.getCompiledCapability,
      providerRegistry
    });
    FieldDefinitionSystem.onReload(() => capabilityResolver.clearCache());
    this._services.set('capabilityResolver', capabilityResolver);

    await ttsProviderAdapter.initialize();

    if (process.env.CONFIG_AUDIT !== 'false') {
      const officialRegistry = this._services.get('officialVoiceRegistry');
      await auditVoiceCoverage(officialRegistry, console);
    }
  }

  /** 阶段 9-10.2: ExecutionPolicy + SynthesisQueue + MetricsCollector + FallbackChain */
  _initResilienceStack() {
    const capabilityResolver = this._services.get('capabilityResolver');
    const pms = this._services.get('providerManagementService');

    const executionPolicy = new ExecutionPolicy();
    for (const serviceKey of ProviderManifest.getAllServiceKeys()) {
      const svcConfig = ProviderManifest.getServiceConfig(serviceKey);
      if (svcConfig?.executionPolicy) {
        executionPolicy.registerServiceConfig(serviceKey, svcConfig.executionPolicy);
      }
    }
    this._services.set('executionPolicy', executionPolicy);

    const synthesisQueue = new SynthesisQueue();
    this._services.set('synthesisQueue', synthesisQueue);

    const metricsCollector = new ProviderMetricsCollector({
      redis: redisPool.isReady() ? redisPool.getPrimary() : null,
      windowSeconds: 3600
    });
    this._services.set('metricsCollector', metricsCollector);

    const fallbackChain = new ProviderFallbackChain({
      executionPolicy,
      capabilityResolver,
      providerManagementService: pms
    });
    this._services.set('fallbackChain', fallbackChain);
  }

  /** 阶段 10-15: Validation + VoiceResolver + QueryService + SynthesisService */
  _initSynthesisStack() {
    const voiceCatalog = this._services.get('voiceCatalog');
    const ttsProviderAdapter = this._services.get('ttsProviderAdapter');
    const capabilityResolver = this._services.get('capabilityResolver');
    const providerRegistry = this._services.get('providerRegistry');
    const providerCatalog = this._services.get('providerCatalog');
    const voiceCatalogAdapter = this._services.get('voiceCatalogAdapter');
    const executionPolicy = this._services.get('executionPolicy');
    const synthesisQueue = this._services.get('synthesisQueue');
    const metricsCollector = this._services.get('metricsCollector');
    const fallbackChain = this._services.get('fallbackChain');
    const pms = this._services.get('providerManagementService');

    const validationService = new TtsValidationService();
    this._services.set('validationService', validationService);

    const voiceResolver = new VoiceResolver({ voiceCatalog, providerCatalog });
    this._services.set('voiceResolver', voiceResolver);

    const queryService = new TtsQueryService({
      ttsProvider: ttsProviderAdapter,
      providerManagementService: pms,
      capabilityResolver,
      voiceCatalog: voiceCatalogAdapter,
      voiceCatalogQuery: voiceCatalog,
      voiceRegistry: voiceCatalog,
      providerRegistry
    });
    this._services.set('queryService', queryService);

    const parameterResolutionService = new ParameterResolutionService();
    this._services.set('parameterResolutionService', parameterResolutionService);

    const synthesisService = new TtsSynthesisService({
      ttsProvider: ttsProviderAdapter,
      validator: validationService,
      capabilityResolver,
      parameterResolutionService,
      executionPolicy,
      synthesisQueue,
      voiceResolver,
      providerRegistry,
      metricsCollector,
      fallbackChain
    });
    this._services.set('synthesisService', synthesisService);
  }

  /** 阶段 16-18: VoiceWriteService + VoiceCreationRegistry + VoiceOnboardingService */
  _initVoiceManagementStack() {
    const userRegistry = this._services.get('userVoiceRegistry');
    const synthesisService = this._services.get('synthesisService');

    const voiceWriteService = new VoiceWriteService({ registry: userRegistry });
    this._services.set('voiceWriteService', voiceWriteService);

    // 统一音色创建注册表：每个 Provider 一个 Adapter（克隆 + 指令生成合一），
    // 能力路由（forClone / forInstruction）+ manifest 配置读取均由 Registry 承担。
    const voiceCreationRegistry = new VoiceCreationRegistry();
    voiceCreationRegistry.register(new MossVoiceCreationAdapter({ audioStorage: audioStorageManager }));
    voiceCreationRegistry.register(new MimoVoiceCreationAdapter({ audioStorage: audioStorageManager }));
    this._services.set('voiceCreationRegistry', voiceCreationRegistry);

    const voiceOnboardingService = new VoiceOnboardingService({
      voiceWriteService,
      voiceCreationRegistry,
      ttsSynthesisService: synthesisService,
      credentials,
      enricher: new VoiceCreationEnricher({ registry: voiceCreationRegistry })
    });
    this._services.set('voiceOnboardingService', voiceOnboardingService);
  }

  /** 阶段 19: HTTP 适配器实例化 */
  _initHttpAdapter() {
    const synthesisService = this._services.get('synthesisService');
    const queryService = this._services.get('queryService');
    const providerRegistry = this._services.get('providerRegistry');
    const synthesisQueue = this._services.get('synthesisQueue');
    const metricsCollector = this._services.get('metricsCollector');

    const clearAllCacheFn = audioCache?.clearAllCache || null;
    const ttsHttpAdapter = new TtsHttpAdapter(synthesisService, queryService, {
      clearAllCache: clearAllCacheFn,
      providerRegistry,
      synthesisQueue,
      metricsCollector
    });
    this._services.set('ttsHttpAdapter', ttsHttpAdapter);
  }

  /** 阶段 20: ManifestWatcher（仅开发环境） */
  _initHotReload() {
    if (process.env.MANIFEST_HOT_RELOAD === 'true' ||
        (process.env.NODE_ENV !== 'production' && process.env.MANIFEST_HOT_RELOAD !== 'false')) {
      const manifestWatcher = new ManifestWatcher({
        providerManifest: ProviderManifest,
        fieldDefinitionSystem: this._services.get('fieldDefinitionSystem'),
        providerRegistry: this._services.get('providerRegistry'),
        capabilityResolver: this._services.get('capabilityResolver')
      });
      manifestWatcher.start();
      this._services.set('manifestWatcher', manifestWatcher);
    }
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
