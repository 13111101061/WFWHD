/**
 * 声音模型数据结构规范
 */

/**
 * 标准的模型信息结构
 */
const ModelSchema = {
  // 必需字段
  required: [
    'id',           // 唯一标识符，格式: provider-service-model-voiceId
    'name',         // 显示名称
    'provider',     // 服务提供商 (aliyun, tencent, volcengine, minimax)
    'service',      // 服务类型 (cosyvoice, qwen, tts)
    'model',        // 模型名称 (cosyvoice-v1, cosyvoice-v2, qwen-tts-v1)
    'voiceId',      // 厂商内部的音色ID
    'category',     // 分类 (female, male, child, character)
    'gender',       // 性别 (female, male)
    'languages',    // 支持的语言数组
    'status'        // 状态 (active, deprecated, experimental)
  ],

  // 可选字段
  optional: {
    age: 'young|adult|mature|elderly',           // 年龄段
    style: 'gentle|energetic|professional|casual|elegant', // 风格
    characteristics: [],                          // 特征标签数组
    tags: [],                                     // 业务标签数组
    description: '',                              // 描述信息
    useCases: [],                                 // 使用场景
    sampleRate: [],                               // 支持的采样率
    formats: [],                                  // 支持的音频格式

    // 扩展信息
    popularity: 0,                                // 热门度 (0-100)
    quality: 'standard|premium|elite',           // 质量等级
    version: '',                                  // 版本号
    releaseDate: '',                              // 发布日期

    // 兼容性
    compatibility: {
      realtime: false,                            // 是否支持实时合成
      batch: true,                                // 是否支持批量合成
      streaming: false                            // 是否支持流式合成
    },

    // 性能信息
    performance: {
      averageLatency: 0,                          // 平均延迟 (ms)
      processingSpeed: 0,                         // 处理速度 (字符/秒)
      reliability: 0                              // 可靠性评分 (0-100)
    },

    // 预览信息
    preview: {
      audioUrl: '',                               // 预览音频URL
      textSample: '',                             // 示例文本
      duration: 0                                 // 预览时长
    },

    // 成本信息
    pricing: {
      tier: 'standard|premium|enterprise',        // 定价等级
      costPerChar: 0,                             // 每字符成本
      currency: 'CNY|USD'                         // 货币单位
    },

    // 限制信息
    limitations: {
      maxLength: 0,                               // 最大文本长度
      minSampleRate: 0,                           // 最小采样率
      maxSampleRate: 0,                           // 最大采样率
      supportedFormats: []                        // 支持的格式列表
    },

    // 元数据
    metadata: {
      registeredAt: '',                           // 注册时间
      updatedAt: '',                              // 更新时间
      registeredBy: '',                           // 注册者
      notes: '',                                  // 备注
      dataSource: 'manual|api|import'             // 数据来源
    }
  }
};

/**
 * 分类配置结构
 */
const CategorySchema = {
  required: ['name', 'description'],
  optional: {
    icon: '',
    color: '',
    order: 0
  }
};

/**
 * 标签配置结构
 */
const TagSchema = {
  required: ['name'],
  optional: {
    color: '',
    description: '',
    category: '',
    order: 0
  }
};

/**
 * 验证模型数据
 * @param {Object} model 模型数据
 * @returns {Object} 验证结果
 */
function validateModel(model) {
  const errors = [];
  const warnings = [];

  // 检查必需字段
  ModelSchema.required.forEach(field => {
    if (!model[field]) {
      errors.push(`缺少必需字段: ${field}`);
    }
  });

  // 检查ID格式
  if (model.id && !model.id.match(/^[a-z0-9]+-[a-z0-9]+-[a-z0-9-]+$/)) {
    errors.push('ID格式不正确，应为: provider-service-model-voiceId');
  }

  // 检查语言代码格式
  if (model.languages) {
    model.languages.forEach(lang => {
      if (!lang.match(/^[a-z]{2}(-[A-Z]{2})?$/)) {
        warnings.push(`语言代码格式可能不正确: ${lang}`);
      }
    });
  }

  // 检查必需数组字段
  const arrayFields = ['languages', 'characteristics', 'tags', 'useCases'];
  arrayFields.forEach(field => {
    if (model[field] && !Array.isArray(model[field])) {
      errors.push(`${field} 必须是数组类型`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 生成模型ID
 * @param {string} provider 提供商
 * @param {string} service 服务
 * @param {string} model 模型
 * @param {string} voiceId 音色ID
 * @returns {string} 生成的ID
 */
function generateModelId(provider, service, model, voiceId) {
  return `${provider}-${service}-${model}-${voiceId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/**
 * 标准化模型数据
 * @param {Object} rawData 原始数据
 * @returns {Object} 标准化后的数据
 */
function normalizeModelData(rawData) {
  const normalized = {
    // 基础字段
    id: rawData.id || generateModelId(
      rawData.provider,
      rawData.service,
      rawData.model,
      rawData.voiceId
    ),
    name: rawData.name || rawData.voiceId || '',
    provider: rawData.provider || '',
    service: rawData.service || '',
    model: rawData.model || '',
    voiceId: rawData.voiceId || '',
    category: rawData.category || 'character',
    gender: rawData.gender || '',
    languages: Array.isArray(rawData.languages) ? rawData.languages : ['zh-CN'],
    status: rawData.status || 'active',

    // 元数据
    metadata: {
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...rawData.metadata
    }
  };

  // 复制可选字段
  Object.keys(ModelSchema.optional).forEach(key => {
    if (rawData[key] !== undefined) {
      normalized[key] = rawData[key];
    }
  });

  return normalized;
}

module.exports = {
  ModelSchema,
  CategorySchema,
  TagSchema,
  validateModel,
  generateModelId,
  normalizeModelData
};