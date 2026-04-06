/**
 * CredentialsRegistry - 凭证注册表
 *
 * 按服务商维度管理 API Key
 * 支持单账号模式（.env）和多账号池化模式（YAML）
 */

// 确保环境变量已加载
require('dotenv').config();

const { CredentialPool, HealthStatus, SelectionStrategy } = require('./CredentialPool');
const { loadAllProviders, hasYamlConfig, createDefaultAccount } = require('../config/loader');

class CredentialsRegistry {
  constructor(options = {}) {
    this.providers = new Map();  // 服务商信息（旧格式，向后兼容）
    this.services = new Map();   // 服务映射到服务商
    this.pools = new Map();      // CredentialPool 实例

    // 检测运行模式
    this.poolMode = false;

    // 先尝试加载 YAML 配置
    this._loadYamlConfig();

    // 如果没有 YAML 配置，加载 .env 默认配置
    if (!this.poolMode) {
      this._loadDefaults();
    }

    // 加载额外的 providers（从 options）
    if (options.providers) {
      Object.entries(options.providers).forEach(([key, config]) => {
        this.registerProvider(key, config);
      });
    }
  }

  /**
   * 加载 YAML 配置（池化模式）
   */
  _loadYamlConfig() {
    if (!hasYamlConfig()) {
      return;
    }

    const providers = loadAllProviders();

    if (providers.size === 0) {
      return;
    }

    this.poolMode = true;

    for (const [key, config] of providers) {
      // 创建 CredentialPool
      const pool = new CredentialPool(config);
      this.pools.set(key, pool);

      // 同时存储旧格式（向后兼容）
      this.providers.set(key, {
        key,
        name: config.name,
        description: config.description,
        credentials: pool.getFirstValidCredentials(),
        requiredFields: config.requiredFields,
        services: this._extractServices(config.accounts)
      });

      // 建立服务映射
      this._buildServiceMappings(key, this.providers.get(key).services);
    }
  }

  /**
   * 从账号中提取服务列表
   * @param {Array<Object>} accounts
   * @returns {Object}
   */
  _extractServices(accounts) {
    const services = {};
    const seen = new Set();

    for (const account of accounts) {
      for (const serviceKey of account.services || []) {
        if (!seen.has(serviceKey)) {
          services[serviceKey] = {
            name: serviceKey,
            description: `Service: ${serviceKey}`
          };
          seen.add(serviceKey);
        }
      }
    }

    return services;
  }

  /**
   * 建立服务映射
   * @param {string} providerKey
   * @param {Object} services
   */
  _buildServiceMappings(providerKey, services) {
    for (const serviceKey of Object.keys(services)) {
      this.services.set(`${providerKey}.${serviceKey}`, {
        providerKey,
        serviceKey,
        ...services[serviceKey]
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
   * 加载默认服务商配置（.env 模式）
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
        'volcengine_http': {
          name: 'HTTP',
          description: '火山引擎 TTS (HTTP)',
          aliases: ['http']
        },
        'volcengine_ws': {
          name: 'WebSocket',
          description: '火山引擎 TTS (WebSocket)',
          aliases: ['ws']
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
        'minimax_tts': {
          name: 'TTS',
          description: 'MiniMax TTS',
          aliases: ['tts']
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

    // 建立服务 -> 服务商的映射（包含 alias 支持）
    if (services) {
      Object.keys(services).forEach(serviceKey => {
        const serviceConfig = services[serviceKey];

        // 注册 canonical key
        this.services.set(`${providerKey}.${serviceKey}`, {
          providerKey,
          serviceKey,
          canonicalKey: serviceKey,
          ...serviceConfig
        });

        // 注册 alias
        if (serviceConfig.aliases && Array.isArray(serviceConfig.aliases)) {
          serviceConfig.aliases.forEach(alias => {
            this.services.set(`${providerKey}.${alias}`, {
              providerKey,
              serviceKey: alias,
              canonicalKey: serviceKey,
              isAlias: true,
              ...serviceConfig
            });
          });
        }
      });
    }

    // 如果没有 pool，为 .env 模式创建默认 pool
    if (!this.pools.has(providerKey) && credentials) {
      const poolConfig = createDefaultAccount(providerKey, credentials, services);
      if (poolConfig) {
        this.pools.set(providerKey, new CredentialPool(poolConfig));
      }
    }
  }

  // ==================== 现有接口（保持兼容） ====================

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
    if (!provider || !provider.credentials) return false;

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
        poolMode: this.pools.has(key),
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

  /**
   * 获取所有服务商详情
   */
  listAll() {
    const result = [];
    for (const [key, provider] of this.providers) {
      const validation = this.validate(key);

      result.push({
        key,
        name: provider.name,
        description: provider.description,
        configured: validation.valid,
        missing: validation.missing,
        services: Object.keys(provider.services)
      });
    }
    return result;
  }

  // ==================== 新增：池化接口 ====================

  /**
   * 选择凭证（池化模式）
   * 同步选择最佳账号，支持健康检查和熔断
   *
   * @param {string} providerKey - 服务商标识
   * @param {string} serviceKey - 服务标识
   * @param {Object} context - 选择上下文
   * @returns {Object|null} - { credentials, accountId, account }
   */
  selectCredentials(providerKey, serviceKey, context = {}) {
    const pool = this.pools.get(providerKey);
    if (!pool) {
      // 回退到旧接口
      const credentials = this.getCredentials(providerKey);
      if (credentials) {
        return {
          credentials,
          accountId: 'default',
          account: { id: 'default', name: '默认账号' }
        };
      }
      return null;
    }

    return pool.selectCredentials(serviceKey, context);
  }

  /**
   * 报告成功
   * @param {string} providerKey
   * @param {string} accountId
   * @param {string} serviceKey
   */
  reportSuccess(providerKey, accountId, serviceKey) {
    const pool = this.pools.get(providerKey);
    if (pool) {
      pool.reportSuccess(accountId, serviceKey);
    }
  }

  /**
   * 报告失败
   * @param {string} providerKey
   * @param {string} accountId
   * @param {string} serviceKey
   * @param {Error} error
   */
  reportFailure(providerKey, accountId, serviceKey, error) {
    const pool = this.pools.get(providerKey);
    if (pool) {
      pool.reportFailure(accountId, serviceKey, error);
    }
  }

  /**
   * 获取服务商账号列表
   * @param {string} providerKey
   * @returns {Array<Object>}
   */
  getProviderAccounts(providerKey) {
    const pool = this.pools.get(providerKey);
    if (!pool) {
      return [];
    }
    return pool.getAccountsWithHealth();
  }

  /**
   * 获取单个账号（公开信息，不含凭证）
   * @param {string} providerKey
   * @param {string} accountId
   * @returns {Object|null}
   */
  getAccount(providerKey, accountId) {
    const pool = this.pools.get(providerKey);
    if (!pool) {
      return null;
    }
    return pool.getAccountPublic(accountId);
  }

  /**
   * 获取账号凭证（内部使用）
   * 仅用于凭证选择，不对外暴露
   * @param {string} providerKey
   * @param {string} accountId
   * @returns {Object|null}
   */
  _getAccountCredentials(providerKey, accountId) {
    const pool = this.pools.get(providerKey);
    if (!pool) {
      return null;
    }
    const account = pool.getAccount(accountId);
    return account?.credentials || null;
  }

  /**
   * 启用账号
   * @param {string} providerKey
   * @param {string} accountId
   */
  enableAccount(providerKey, accountId) {
    const pool = this.pools.get(providerKey);
    if (pool) {
      pool.enableAccount(accountId);
    }
  }

  /**
   * 禁用账号
   * @param {string} providerKey
   * @param {string} accountId
   */
  disableAccount(providerKey, accountId) {
    const pool = this.pools.get(providerKey);
    if (pool) {
      pool.disableAccount(accountId);
    }
  }

  /**
   * 重置账号熔断状态
   * @param {string} providerKey
   * @param {string} accountId
   */
  resetCircuit(providerKey, accountId) {
    const pool = this.pools.get(providerKey);
    if (pool) {
      pool.resetCircuit(accountId);
    }
  }

  /**
   * 获取健康状态
   * @param {string} providerKey
   * @returns {Object|null}
   */
  getHealthStatus(providerKey) {
    const pool = this.pools.get(providerKey);
    if (!pool) {
      return null;
    }
    return pool.getHealthStatus();
  }

  /**
   * 检查是否为池化模式
   * @returns {boolean}
   */
  isPoolMode() {
    return this.poolMode;
  }

  /**
   * 获取所有 pool
   * @returns {Map<string, CredentialPool>}
   */
  getPools() {
    return this.pools;
  }
}

module.exports = CredentialsRegistry;