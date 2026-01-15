const BaseTtsService = require('./BaseTtsService');
const config = require('../../../shared/config/config');

/**
 * TTS服务工厂类
 * 统一创建和管理各种TTS服务实例
 */
class TtsFactory {
  constructor() {
    this.services = new Map();
    this.configs = this.loadConfigs();
  }

  /**
   * 加载TTS服务配置
   * @returns {Object} 配置对象
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
   * @param {string} provider - 服务提供商
   * @param {string} service - 服务类型
   * @returns {BaseTtsService} TTS服务实例
   */
  createService(provider, service = null) {
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

  /**
   * 创建阿里云服务
   * @param {string} service - 服务类型
   * @returns {BaseTtsService} 服务实例
   */
  createAliyunService(service) {
    const config = this.configs.aliyun[service];
    if (!config) {
      throw new Error(`Unsupported Aliyun service: ${service}`);
    }

    switch (service) {
      case 'cosyvoice':
        return this.loadService('../services/cosyVoiceService', config);
      case 'qwen_http':
        return this.loadService('../services/qwenTtsHttpService', config);
      case 'qwen_ws':
        return this.loadService('../services/qwenTtsHttpService', config); // 暂时使用HTTP服务，后续可添加WebSocket服务
      default:
        throw new Error(`Unknown Aliyun service: ${service}`);
    }
  }

  /**
   * 创建腾讯云服务
   * @returns {BaseTtsService} 服务实例
   */
  createTencentService() {
    const config = this.configs.tencent;
    return this.loadService('../services/tencentTtsService', config);
  }

  /**
   * 创建火山引擎服务
   * @param {string} service - 服务类型
   * @returns {BaseTtsService} 服务实例
   */
  createVolcengineService(service) {
    const config = this.configs.volcengine;

    switch (service) {
      case 'volcengine_http':
        return this.loadService('../services/volcengineTtsService', config);
      case 'volcengine_ws':
        return this.loadService('../services/volcengineTtsWsService', config);
      default:
        throw new Error(`Unknown Volcengine service: ${service}`);
    }
  }

  /**
   * 创建MiniMax服务
   * @returns {BaseTtsService} 服务实例
   */
  createMinimaxService() {
    const config = this.configs.minimax;
    return this.loadService('../services/minimaxTtsService', config);
  }

  /**
   * 动态加载服务类
   * @param {string} servicePath - 服务文件路径
   * @param {Object} config - 配置对象
   * @returns {BaseTtsService} 服务实例
   */
  loadService(servicePath, config) {
    try {
      const service = require(servicePath);

      // 1. 如果导出的是实例 (Singleton pattern)
      if (typeof service === 'object') {
        // 强制检查是否实现了 synthesize 方法
        if (typeof service.synthesize !== 'function') {
           throw new Error(`Service ${servicePath} must implement synthesize method`);
        }
        
        // 注入配置 (如果实例允许)
        if (service.config) {
          service.config = { ...service.config, ...config };
        }
        
        console.log(`✅ 加载服务实例: ${servicePath}`);
        return service;
      }

      // 2. 如果导出的是类 (Class pattern)
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
   * 获取所有可用的服务提供商
   * @returns {Array} 服务提供商列表
   */
  getAvailableProviders() {
    return [
      {
        provider: 'aliyun',
        services: ['cosyvoice', 'qwen_http', 'qwen_ws'],
        description: '阿里云TTS服务'
      },
      {
        provider: 'tencent',
        services: ['tts'],
        description: '腾讯云TTS服务'
      },
      {
        provider: 'volcengine',
        services: ['volcengine_http', 'volcengine_ws'],
        description: '火山引擎TTS服务'
      },
      {
        provider: 'minimax',
        services: ['minimax_tts'],
        description: 'MiniMax TTS服务'
      }
    ];
  }

  /**
   * 检查服务是否可用
   * @param {string} provider - 服务提供商
   * @param {string} service - 服务类型
   * @returns {boolean} 是否可用
   */
  isServiceAvailable(provider, service = null) {
    try {
      this.createService(provider, service);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取服务健康状态
   * @returns {Object} 健康状态
   */
  getHealthStatus() {
    const providers = this.getAvailableProviders();
    const health = {
      overall: 'healthy',
      services: {},
      timestamp: new Date().toISOString()
    };

    for (const provider of providers) {
      health.services[provider.provider] = {
        status: 'unknown',
        services: {}
      };

      for (const service of provider.services) {
        try {
          const serviceInstance = this.createService(provider.provider, service);
          const status = serviceInstance.getStatus();
          health.services[provider.provider].services[service] = {
            status: 'healthy',
            status: status.status,
            lastCheck: new Date().toISOString()
          };
        } catch (error) {
          health.services[provider.provider].services[service] = {
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

  /**
   * 清理服务缓存
   */
  clearCache() {
    this.services.clear();
    console.log('TTS service cache cleared');
  }

  /**
   * 获取服务统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      cachedServices: this.services.size,
      availableProviders: this.getAvailableProviders().length,
      lastHealthCheck: new Date().toISOString()
    };
  }
}

// 导出单例实例
const ttsFactory = new TtsFactory();

module.exports = {
  TtsFactory,
  ttsFactory
};
