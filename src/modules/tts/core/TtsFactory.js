/**
 * TtsFactory - TTS服务工厂
 *
 * @deprecated 此类已废弃，请使用 adapters/providers 注册中心
 *
 * 迁移指南:
 * - 旧: const { ttsFactory } = require('./core/TtsFactory');
 *       const service = await ttsFactory.createService('aliyun', 'qwen_http');
 *
 * - 新: const providers = require('./adapters/providers');
 *       const adapter = providers.createProvider('aliyun_qwen_http');
 *
 * 此文件将在下一版本删除
 */
const config = require('../../../shared/config/config');
const { voiceManager } = require('./VoiceManager');

/**
 * TTS服务工厂类（v2.0）
 * 集成 VoiceManager 统一管理音色配置
 */
class TtsFactory {
  constructor() {
    this.services = new Map();
    this.configs = this.loadConfigs();
    this.initialized = false;
  }

  /**
   * 初始化工厂（异步）
   */
  async initialize() {
    if (this.initialized) return;
    
    // 初始化VoiceManager
    await voiceManager.initialize();
    this.initialized = true;
    
    console.log('✅ TtsFactory initialized with VoiceManager');
  }

  /**
   * 确保已初始化
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 加载TTS服务配置
   */
  loadConfigs() {
    return {
      aliyun: {
        cosyvoice: {
          apiKey: config.api.tts.apiKey,
          endpoint: 'https://dashscope.aliyuncs.com',
          timeout: 30000,
          maxRetries: 3
        },
        qwen_http: {
          apiKey: config.api.qwen.apiKey || config.api.tts.apiKey,
          endpoint: 'https://dashscope.aliyuncs.com',
          timeout: 30000,
          maxRetries: 3
        },
        qwen_ws: {
          apiKey: config.api.qwen.apiKey || config.api.tts.apiKey,
          endpoint: 'https://dashscope.aliyuncs.com',
          timeout: 30000,
          maxRetries: 3
        }
      },
      tencent: {
        secretId: config.api.tencent.secretId,
        secretKey: config.api.tencent.secretKey,
        endpoint: 'tts.tencentcloudapi.com',
        region: process.env.TENCENTCLOUD_REGION || 'ap-guangzhou',
        timeout: 30000,
        maxRetries: 3
      },
      volcengine: {
        appId: config.api.volcengine.appId,
        token: config.api.volcengine.token,
        secretKey: config.api.volcengine.secretKey,
        endpoint: 'openspeech.bytedance.com',
        timeout: 30000,
        maxRetries: 3
      },
      minimax: {
        apiKey: config.api.minimax.apiKey,
        endpoint: 'https://api.minimaxi.com',
        timeout: 60000,
        maxRetries: 3
      }
    };
  }

  /**
   * 创建TTS服务实例
   */
  async createService(provider, service = null) {
    await this.ensureInitialized();
    
    const key = service ? `${provider}_${service}` : provider;

    // 检查是否已创建实例
    if (this.services.has(key)) {
      return this.services.get(key);
    }

    let serviceInstance;

    switch (provider) {
      case 'aliyun':
        serviceInstance = this.createAliyunService(service);
        break;
      case 'tencent':
        serviceInstance = this.createTencentService();
        break;
      case 'volcengine':
        serviceInstance = this.createVolcengineService(service);
        break;
      case 'minimax':
        serviceInstance = this.createMinimaxService();
        break;
      default:
        throw new Error(`Unsupported TTS provider: ${provider}`);
    }

    // 缓存实例
    this.services.set(key, serviceInstance);
    return serviceInstance;
  }

  createAliyunService(service) {
    const serviceConfig = this.configs.aliyun[service];
    if (!serviceConfig) {
      throw new Error(`Unsupported Aliyun service: ${service}`);
    }

    switch (service) {
      case 'cosyvoice':
        return this.loadService('../services/cosyVoiceService', serviceConfig);
      case 'qwen_http':
        return this.loadService('../services/qwenTtsHttpService', serviceConfig);
      case 'qwen_ws':
        return this.loadService('../services/qwenTtsHttpService', serviceConfig);
      default:
        throw new Error(`Unknown Aliyun service: ${service}`);
    }
  }

  createTencentService() {
    const serviceConfig = this.configs.tencent;
    return this.loadService('../services/tencentTtsService', serviceConfig);
  }

  createVolcengineService(service) {
    const serviceConfig = this.configs.volcengine;

    switch (service) {
      case 'volcengine_http':
        return this.loadService('../services/volcengineTtsService', serviceConfig);
      case 'volcengine_ws':
        return this.loadService('../services/volcengineTtsWsService', serviceConfig);
      default:
        throw new Error(`Unknown Volcengine service: ${service}`);
    }
  }

  createMinimaxService() {
    const serviceConfig = this.configs.minimax;
    return this.loadService('../services/minimaxTtsService', serviceConfig);
  }

  loadService(servicePath, config) {
    try {
      const service = require(servicePath);

      if (typeof service === 'object') {
        if (typeof service.synthesize !== 'function') {
           throw new Error(`Service ${servicePath} must implement synthesize method`);
        }
        
        if (service.config) {
          service.config = { ...service.config, ...config };
        }
        
        console.log(`✅ 加载服务实例: ${servicePath}`);
        return service;
      }

      if (typeof service === 'function' && service.prototype) {
        console.log(`✅ 加载服务类: ${servicePath}`);
        return new service(config);
      }

      throw new Error(`Invalid service export: ${servicePath}`);

    } catch (error) {
      console.error(`Failed to load service ${servicePath}:`, error);
      throw new Error(`Service not available: ${servicePath}`);
    }
  }

  /**
   * 获取音色列表（通过VoiceManager）
   */
  async getVoices(provider, serviceType = null) {
    await this.ensureInitialized();
    
    // 从VoiceManager获取
    let voices = voiceManager.getByProvider(provider);
    
    if (serviceType) {
      voices = voices.filter(v => v.service === serviceType);
    }
    
    // 映射为兼容格式
    return voices.map(v => ({
      id: v.sourceId,
      systemId: v.id,
      name: v.displayName,
      gender: v.gender,
      language: v.languages?.[0] || 'zh-CN',
      languages: v.languages,
      tags: v.tags || [],
      description: v.description,
      ttsConfig: v.ttsConfig,
      _modelInfo: v
    }));
  }

  getAvailableProviders() {
    return [
      { provider: 'aliyun', services: ['cosyvoice', 'qwen_http', 'qwen_ws'], description: '阿里云TTS服务' },
      { provider: 'tencent', services: ['tts'], description: '腾讯云TTS服务' },
      { provider: 'volcengine', services: ['volcengine_http', 'volcengine_ws'], description: '火山引擎TTS服务' },
      { provider: 'minimax', services: ['minimax_tts'], description: 'MiniMax TTS服务' }
    ];
  }

  async isServiceAvailable(provider, service = null) {
    try {
      await this.createService(provider, service);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getHealthStatus() {
    await this.ensureInitialized();
    
    const vmHealth = voiceManager.getHealth();
    const providers = this.getAvailableProviders();
    const health = {
      overall: vmHealth.status === 'healthy' ? 'healthy' : 'degraded',
      voiceManager: vmHealth,
      services: {},
      timestamp: new Date().toISOString()
    };

    for (const p of providers) {
      health.services[p.provider] = {
        status: 'unknown',
        services: {}
      };

      for (const service of p.services) {
        try {
          const instance = await this.createService(p.provider, service);
          const status = instance.getStatus ? instance.getStatus() : { status: 'active' };
          health.services[p.provider].services[service] = {
            status: 'healthy',
            ...status,
            lastCheck: new Date().toISOString()
          };
        } catch (error) {
          health.services[p.provider].services[service] = {
            status: 'unhealthy',
            error: error.message,
            lastCheck: new Date().toISOString()
          };
          health.overall = 'degraded';
        }
      }
    }

    return health;
  }

  clearCache() {
    this.services.clear();
    console.log('TTS service cache cleared');
  }

  async getStats() {
    await this.ensureInitialized();
    
    return {
      cachedServices: this.services.size,
      availableProviders: this.getAvailableProviders().length,
      voiceManager: voiceManager.getStats(),
      lastHealthCheck: new Date().toISOString()
    };
  }
}

// 导出单例实例（延迟初始化）
const ttsFactory = new TtsFactory();

module.exports = {
  TtsFactory,
  ttsFactory
};
