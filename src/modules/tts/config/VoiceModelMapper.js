const { voiceModelRegistry } = require('./VoiceModelRegistry');
const TtsException = require('../core/TtsException');

/**
 * 音色模型映射器
 * 负责系统ID和提供商ID之间的转换
 */
class VoiceModelMapper {
  constructor() {
    this.registry = voiceModelRegistry;
  }

  /**
   * 初始化映射器
   */
  async initialize() {
    await this.registry.initialize();
  }

  /**
   * 系统ID转提供商参数
   * @param {string} systemId - 系统ID
   * @returns {Object} 提供商参数
   */
  systemIdToProviderParams(systemId) {
    const model = this.registry.getModel(systemId);

    if (!model) {
      throw TtsException.NotFound(`Voice model not found: ${systemId}`);
    }

    return {
      provider: model.provider,
      serviceType: model.service,
      voice: model.providerVoiceId || model.voiceId,
      model: model.modelVersion || model.model,
      systemId: systemId
    };
  }

  /**
   * 提供商ID转系统ID（优化版，使用 voiceId 索引）
   * @param {string} providerVoiceId - 提供商音色ID
   * @param {string} provider - 提供商名称（可选，用于加速查找）
   * @returns {string|null} 系统ID
   */
  providerIdToSystemId(providerVoiceId, provider = null) {
    // 如果提供了 provider，使用新的 O(1) 索引查询
    if (provider) {
      const model = this.registry.getModelByProviderVoiceId(provider, providerVoiceId);
      return model ? model.systemId : null;
    }

    // 兜底：如果没有 provider，回退到全表扫描
    const models = this.registry.getAllModels();
    const model = models.find(m =>
      (m.providerVoiceId || m.voiceId) === providerVoiceId
    );

    return model ? model.systemId : null;
  }

  /**
   * 批量转换系统ID为提供商参数
   * @param {Array<string>} systemIds - 系统ID数组
   * @returns {Array<Object>} 提供商参数数组
   */
  batchSystemIdToProviderParams(systemIds) {
    return systemIds.map(systemId =>
      this.systemIdToProviderParams(systemId)
    );
  }

  /**
   * 验证系统ID是否存在
   * @param {string} systemId - 系统ID
   * @returns {boolean} 是否存在
   */
  validateSystemId(systemId) {
    try {
      this.systemIdToProviderParams(systemId);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取音色的完整信息
   * @param {string} systemId - 系统ID
   * @returns {Object} 完整的模型信息
   */
  getModelInfo(systemId) {
    return this.registry.getModel(systemId);
  }

  /**
   * 根据提供商和音色ID查找系统ID（优化版，使用 O(1) 索引）
   * @param {string} provider - 提供商名称
   * @param {string} providerVoiceId - 提供商音色ID
   * @returns {string|null} 系统ID
   */
  findSystemIdByProvider(provider, providerVoiceId) {
    const model = this.registry.getModelByProviderVoiceId(provider, providerVoiceId);
    return model ? model.systemId : null;
  }

  /**
   * 获取所有可用的系统ID列表
   * @param {Object} filters - 过滤条件
   * @returns {Array<string>} 系统ID列表
   */
  getAvailableSystemIds(filters = {}) {
    let models = this.registry.getAllModels();

    if (filters.provider) {
      models = models.filter(m => m.provider === filters.provider);
    }

    if (filters.gender) {
      models = models.filter(m => m.gender === filters.gender);
    }

    if (filters.language) {
      models = models.filter(m =>
        m.languages && m.languages.includes(filters.language)
      );
    }

    if (filters.category) {
      models = models.filter(m => m.category === filters.category);
    }

    return models.map(m => m.systemId);  // 现在 systemId 已经在注册时明确设置
  }
}

// 导出单例
const voiceModelMapper = new VoiceModelMapper();

module.exports = {
  VoiceModelMapper,
  voiceModelMapper
};
