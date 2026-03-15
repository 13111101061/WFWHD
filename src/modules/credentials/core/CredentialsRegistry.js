/**
 * CredentialsRegistry - 凭证注册表
 *
 * 按服务商维度管理 API Key
 * 一个服务商可以有多个服务/接口
 */

// 确保环境变量已加载
require('dotenv').config();

class CredentialsRegistry {
  constructor(options = {}) {
    this.providers = new Map();  // 服务商信息
    this.services = new Map();   // 服务映射到服务商

    this._loadDefaults();

    if (options.providers) {
      Object.entries(options.providers).forEach(([key, config]) => {
        this.registerProvider(key, config);
      });
    }
  }

  /**
   * 过滤占位符值
   */
  _filterPlaceholder(value) {
    if (!value) return null;
    const placeholders = ['your-', 'placeholder', 'xxx', 'test-', 'demo-'];
    if (placeholders.some(p => value.toLowerCase().startsWith(p))) {
      return null;
    }
    return value;
  }

  /**
   * 加载默认服务商配置
   */
  _loadDefaults() {
    // ==================== 阿里云 ====================
    this.registerProvider('aliyun', {
      name: '阿里云',
      description: '阿里云智能语音服务',
      credentials: {
        apiKey: this._filterPlaceholder(process.env.QWEN_API_KEY) ||
                this._filterPlaceholder(process.env.TTS_API_KEY)
      },
      requiredFields: ['apiKey'],
      services: {
        'cosyvoice': {
          name: 'CosyVoice',
          description: '阿里云 CosyVoice 语音合成',
          endpoint: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/'
        },
        'qwen_http': {
          name: 'Qwen HTTP',
          description: 'Qwen 语音合成 (HTTP)',
          endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
        },
        'qwen_ws': {
          name: 'Qwen WebSocket',
          description: 'Qwen 语音合成 (WebSocket)',
          endpoint: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/'
        }
      }
    });

    // ==================== 腾讯云 ====================
    this.registerProvider('tencent', {
      name: '腾讯云',
      description: '腾讯云语音合成',
      credentials: {
        secretId: this._filterPlaceholder(process.env.TENCENTCLOUD_SECRET_ID),
        secretKey: this._filterPlaceholder(process.env.TENCENTCLOUD_SECRET_KEY),
        region: process.env.TENCENTCLOUD_REGION || 'ap-guangzhou'
      },
      requiredFields: ['secretId', 'secretKey'],
      services: {
        'tts': {
          name: 'TTS',
          description: '腾讯云 TTS'
        }
      }
    });

    // ==================== 火山引擎 ====================
    this.registerProvider('volcengine', {
      name: '火山引擎',
      description: '火山引擎语音合成',
      credentials: {
        appId: this._filterPlaceholder(process.env.VOLCENGINE_APP_ID),
        token: this._filterPlaceholder(process.env.VOLCENGINE_TOKEN),
        accessKey: this._filterPlaceholder(process.env.VOLCENGINE_ACCESS_KEY),
        secretKey: this._filterPlaceholder(process.env.VOLCENGINE_SECRET_KEY)
      },
      requiredFields: ['appId', 'token'],
      services: {
        'http': {
          name: 'HTTP',
          description: '火山引擎 TTS (HTTP)'
        },
        'ws': {
          name: 'WebSocket',
          description: '火山引擎 TTS (WebSocket)'
        }
      }
    });

    // ==================== MiniMax ====================
    this.registerProvider('minimax', {
      name: 'MiniMax',
      description: 'MiniMax 语音合成',
      credentials: {
        apiKey: this._filterPlaceholder(process.env.MINIMAX_API_KEY),
        groupId: this._filterPlaceholder(process.env.MINIMAX_GROUP_ID)
      },
      requiredFields: ['apiKey'],
      services: {
        'tts': {
          name: 'TTS',
          description: 'MiniMax TTS'
        }
      }
    });

    // ==================== MOSS-TTS ====================
    this.registerProvider('moss', {
      name: 'MOSS-TTS',
      description: 'MOSS-TTS 语音合成服务',
      credentials: {
        apiKey: this._filterPlaceholder(process.env.MOSS_API_KEY)
      },
      requiredFields: ['apiKey'],
      services: {
        'tts': {
          name: 'TTS',
          description: 'MOSS-TTS 语音合成',
          endpoint: 'https://studio.mosi.cn/api/v1/audio/speech'
        }
      }
    });
  }

  /**
   * 注册服务商
   * @param {string} providerKey - 服务商标识
   * @param {Object} config - 配置
   * @param {string} config.name - 服务商名称
   * @param {string} config.description - 描述
   * @param {Object} config.credentials - 凭证
   * @param {string[]} config.requiredFields - 必填字段
   * @param {Object} config.services - 服务列表
   */
  registerProvider(providerKey, config) {
    const { name, description, credentials, requiredFields, services } = config;

    // 存储服务商信息
    this.providers.set(providerKey, {
      key: providerKey,
      name,
      description,
      credentials,
      requiredFields: requiredFields || [],
      services: services || {}
    });

    // 建立服务 -> 服务商的映射
    if (services) {
      Object.keys(services).forEach(serviceKey => {
        this.services.set(`${providerKey}.${serviceKey}`, {
          providerKey,
          serviceKey,
          ...services[serviceKey]
        });
      });
    }
  }

  /**
   * 获取服务商凭证
   * @param {string} providerKey - 服务商标识
   * @returns {Object|null}
   */
  getCredentials(providerKey) {
    const provider = this.providers.get(providerKey);
    return provider?.credentials || null;
  }

  /**
   * 通过服务标识获取凭证
   * @param {string} providerKey - 服务商标识
   * @param {string} serviceKey - 服务标识
   * @returns {Object|null}
   */
  getCredentialsByService(providerKey, serviceKey) {
    return this.getCredentials(providerKey);
  }

  /**
   * 获取服务配置
   * @param {string} providerKey
   * @param {string} serviceKey
   */
  getServiceConfig(providerKey, serviceKey) {
    return this.services.get(`${providerKey}.${serviceKey}`) || null;
  }

  /**
   * 检查服务商是否已配置
   */
  hasProvider(providerKey) {
    const provider = this.providers.get(providerKey);
    if (!provider) return false;

    return provider.requiredFields.every(field => {
      const value = provider.credentials[field];
      return value && value !== '';
    });
  }

  /**
   * 检查服务是否可用
   */
  hasService(providerKey, serviceKey) {
    return this.hasProvider(providerKey) && this.services.has(`${providerKey}.${serviceKey}`);
  }

  /**
   * 获取所有服务商状态
   */
  listProviders() {
    const result = [];
    for (const [key, provider] of this.providers) {
      const configured = this.hasProvider(key);
      const serviceList = Object.keys(provider.services);

      result.push({
        key,
        name: provider.name,
        description: provider.description,
        configured,
        services: serviceList.map(s => ({
          key: s,
          name: provider.services[s].name,
          available: configured
        }))
      });
    }
    return result;
  }

  /**
   * 获取已配置的服务商
   */
  listConfigured() {
    return this.listProviders().filter(p => p.configured).map(p => p.key);
  }

  /**
   * 更新服务商凭证
   */
  updateCredentials(providerKey, updates) {
    const provider = this.providers.get(providerKey);
    if (!provider) {
      throw new Error(`Provider "${providerKey}" not registered`);
    }
    provider.credentials = { ...provider.credentials, ...updates };
  }

  /**
   * 验证服务商凭证
   */
  validate(providerKey) {
    const provider = this.providers.get(providerKey);
    if (!provider) {
      return { valid: false, error: 'Provider not registered' };
    }

    const missing = provider.requiredFields.filter(field => {
      const value = provider.credentials[field];
      return !value || value === '';
    });

    return {
      valid: missing.length === 0,
      providerKey,
      name: provider.name,
      missing
    };
  }

  /**
   * 验证所有
   */
  validateAll() {
    const results = [];
    for (const [key] of this.providers) {
      results.push(this.validate(key));
    }
    return results;
  }
}

module.exports = CredentialsRegistry;