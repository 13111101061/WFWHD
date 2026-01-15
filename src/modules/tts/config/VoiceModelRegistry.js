const fs = require('fs').promises;
const path = require('path');

/**
 * 声音模型注册中心
 * 提供统一的模型信息管理和查询功能
 */
class VoiceModelRegistry {
  constructor() {
    this.models = new Map();
    this.providers = new Map();
    this.tags = new Map();
    this.voiceIndex = new Map();
    this.providerServiceVoiceIndex = new Map();
    this.isLoaded = false;
  }

  /**
   * 初始化注册中心
   */
  async initialize() {
    if (this.isLoaded) return;

    try {
      await this.loadModelsFromConfig();
      await this.buildIndexes();
      this.isLoaded = true;
      console.log(`🎵 VoiceModelRegistry 初始化完成，加载了 ${this.models.size} 个模型`);
    } catch (error) {
      console.error('VoiceModelRegistry 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 从配置文件加载模型数据
   * 支持新旧两种数据源（过渡期）
   */
  async loadModelsFromConfig() {
    // 优先使用新的映射文件
    const mappingPath = path.join(__dirname, 'voiceIdMapping.json');
    const oldConfigPath = path.join(__dirname, 'voiceModels.json');

    try {
      // 尝试加载新的映射文件
      try {
        const mappingData = await fs.readFile(mappingPath, 'utf8');
        const mapping = JSON.parse(mappingData);

        if (mapping.voices && Array.isArray(mapping.voices)) {
          console.log('✅ 使用新的 voiceIdMapping.json 数据源');
          mapping.voices.forEach(model => {
            this.registerModel(model);
          });
          return; // 成功加载新文件，直接返回
        } else {
          console.warn('⚠️  voiceIdMapping.json 格式不正确：缺少 voices 数组');
        }
      } catch (mappingError) {
        console.warn('⚠️  新映射文件不可用:', mappingError.message);
      }

      // 兜底：使用旧的配置文件
      const configData = await fs.readFile(oldConfigPath, 'utf8');
      const config = JSON.parse(configData);

      console.log('⚠️  使用旧的 voiceModels.json 数据源（建议迁移到新格式）');

      // 加载模型数据
      if (config.models && Array.isArray(config.models)) {
        config.models.forEach(model => {
          this.registerModel(model);
        });
      }

      // 加载标签配置
      if (config.tags) {
        Object.entries(config.tags).forEach(([key, tag]) => {
          this.tags.set(key, {
            ...tag,
            models: new Set() // 确保有models Set
          });
        });
      }

    } catch (error) {
      console.error('❌ 所有配置文件加载失败:', error.message);
      this.loadDefaultModels();
    }
  }

  /**
   * 加载默认模型数据（向后兼容）
   */
  loadDefaultModels() {
    // 这里可以加载一些基础的默认模型
    // 或者从现有的服务文件中提取
    console.log('使用默认模型配置');
  }

  /**
   * 注册单个模型（带强校验）
   */
  registerModel(model) {
    const modelId = model.id;

    if (!modelId) {
      const error = new Error('模型缺少ID，拒绝注册');
      console.error('❌', error.message, model);
      throw error; // 强制失败，不静默跳过
    }

    // 强校验：验证模型数据（失败即报警）
    try {
      this.validateModel(model);
    } catch (error) {
      console.error(`❌ 模型验证失败，拒绝注册: ${modelId}`, error.message);
      throw error; // 强制失败，不静默跳过
    }

    // 唯一性检查：systemId
    if (this.models.has(modelId)) {
      const error = new Error(`重复的 systemId: ${modelId}`);
      console.error('❌', error.message);
      throw error; // 强制失败
    }

    // 唯一性检查：(provider, service, voiceId)
    const providerServiceVoiceKey = `${model.provider}:${model.service}:${model.voiceId}`;
    if (this.providerServiceVoiceIndex.has(providerServiceVoiceKey)) {
      const existingId = this.providerServiceVoiceIndex.get(providerServiceVoiceKey);
      const error = new Error(
        `重复的提供商音色组合: ${providerServiceVoiceKey}\n` +
        `  已存在: ${existingId}\n` +
        `  新模型: ${modelId}`
      );
      console.error('❌', error.message);
      throw error;
    }

    // 唯一性检查：(provider, voiceId)
    // 该索引被 providerIdToSystemId(provider, voiceId) 依赖，必须严格唯一。
    const providerVoiceKey = `${model.provider}:${model.voiceId}`;
    if (this.voiceIndex.has(providerVoiceKey)) {
      const existingId = this.voiceIndex.get(providerVoiceKey);
      const error = new Error(
        `重复的提供商音色: ${providerVoiceKey}\n` +
        `  已存在: ${existingId}\n` +
        `  新模型: ${modelId}`
      );
      console.error('❌', error.message);
      throw error;
    }

    // 标准化模型对象，明确设置 systemId = id
    const normalizedModel = {
      ...model,
      systemId: modelId,  // 明确设置 systemId，避免后续混淆
      registeredAt: new Date().toISOString()
    };

    this.models.set(modelId, normalizedModel);

    this.providerServiceVoiceIndex.set(providerServiceVoiceKey, modelId);
    this.voiceIndex.set(providerVoiceKey, modelId);
  }

  /**
   * 构建索引
   */
  async buildIndexes() {
    // 构建提供商索引
    this.models.forEach((model, modelId) => {
      if (!this.providers.has(model.provider)) {
        this.providers.set(model.provider, new Set());
      }
      this.providers.get(model.provider).add(modelId);
    });

    // 构建标签索引
    this.models.forEach((model, modelId) => {
      if (model.tags && Array.isArray(model.tags)) {
        model.tags.forEach(tag => {
          if (!this.tags.has(tag)) {
            this.tags.set(tag, {
              name: tag,
              models: new Set()
            });
          }
          this.tags.get(tag).models.add(modelId);
        });
      }
    });

    // voiceIndex 与 providerServiceVoiceIndex 在 registerModel 时构建
  }

  /**
   * 获取所有模型
   */
  getAllModels() {
    return Array.from(this.models.values());
  }

  /**
   * 根据ID获取模型
   */
  getModel(id) {
    return this.models.get(id);
  }

  /**
   * 根据提供商获取模型
   */
  getModelsByProvider(provider) {
    const modelIds = this.providers.get(provider);
    if (!modelIds) return [];

    return Array.from(modelIds).map(id => this.models.get(id)).filter(Boolean);
  }

  /**
   * 根据系统ID获取音色（别名方法）
   */
  getVoiceById(systemId) {
    return this.getModel(systemId);
  }

  /**
   * 根据提供商和音色ID获取系统ID
   */
  providerIdToSystemId(provider, voiceId) {
    const voiceKey = `${provider}:${voiceId}`;
    return this.voiceIndex.get(voiceKey) || null;
  }

  /**
   * 根据标签获取模型
   */
  getModelsByTag(tag) {
    const tagInfo = this.tags.get(tag);
    if (!tagInfo || !tagInfo.models) return [];

    return Array.from(tagInfo.models).map(id => this.models.get(id)).filter(Boolean);
  }

  /**
   * 获取所有提供商
   */
  getProviders() {
    return Array.from(this.providers.keys());
  }

  /**
   * 获取所有标签
   */
  getTags() {
    const result = {};
    this.tags.forEach((tag, key) => {
      result[key] = {
        name: tag.name || key,
        count: tag.models ? tag.models.size : 0
      };
    });
    return result;
  }

  /**
   * 搜索模型
   */
  searchModels(query) {
    const searchTerm = query.toLowerCase();
    return Array.from(this.models.values()).filter(model => {
      return (
        (model.name && model.name.toLowerCase().includes(searchTerm)) ||
        (model.description && model.description.toLowerCase().includes(searchTerm)) ||
        (model.voiceId && model.voiceId.toLowerCase().includes(searchTerm)) ||
        (model.tags && model.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
      );
    });
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalModels: this.models.size,
      totalProviders: this.providers.size,
      totalTags: this.tags.size,
      totalVoiceIndex: this.voiceIndex.size,
      totalProviderServiceVoiceIndex: this.providerServiceVoiceIndex.size,
      isLoaded: this.isLoaded,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * 根据提供商和 voiceId 快速查找模型（O(1) 复杂度）
   * @param {string} provider - 提供商
   * @param {string} voiceId - 厂商音色ID
   * @returns {Object|null} 模型对象或 null
   */
  getModelByProviderVoiceId(provider, voiceId) {
    const voiceKey = `${provider}:${voiceId}`;
    const modelId = this.voiceIndex.get(voiceKey);
    return modelId ? this.models.get(modelId) : null;
  }

  /**
   * 重新加载配置
   */
  async reload() {
    this.models.clear();
    this.providers.clear();
    this.tags.clear();
    this.voiceIndex.clear();
    this.providerServiceVoiceIndex.clear();
    this.isLoaded = false;
    await this.initialize();
  }

  /**
   * 验证模型数据
   */
  validateModel(model) {
    const requiredFields = ['id', 'name', 'provider', 'service', 'voiceId', 'gender', 'languages'];
    const missingFields = requiredFields.filter(field => !model[field]);

    if (missingFields.length > 0) {
      throw new Error(`模型缺少必需字段: ${missingFields.join(', ')}`);
    }

    if (!Array.isArray(model.languages) || model.languages.length === 0) {
      throw new Error('模型 languages 必须为非空数组');
    }

    if (!['male', 'female'].includes(model.gender)) {
      throw new Error('模型 gender 必须为 male 或 female');
    }

    return true;
  }
}

// 创建单例实例
const voiceModelRegistry = new VoiceModelRegistry();

module.exports = {
  VoiceModelRegistry,
  voiceModelRegistry
};
