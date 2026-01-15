const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * 音色分类自动生成脚本
 * 从 voiceIdMapping.json 生成 voiceCategories.json
 * 
 * 职责：
 * 1. 读取主数据源（voiceIdMapping.json）
 * 2. 应用分类规则（按性别、语言、标签）
 * 3. 计算热门度排序（可选）
 * 4. 原子写入生成文件
 * 
 * 配置选项：
 * - ENABLE_POPULARITY: 是否启用热门度计算（默认false）
 * - ENABLE_BADGES: 是否生成徽章（默认false）
 */

class VoiceCategoryGenerator {
  constructor(options = {}) {
    this.configDir = __dirname;
    this.mappingFile = path.join(this.configDir, 'voiceIdMapping.json');
    this.outputFile = path.join(this.configDir, 'voiceCategories.json');
    this.tempFile = path.join(this.configDir, 'voiceCategories.json.tmp');
    this.backupFile = path.join(this.configDir, 'voiceCategories.json.bak');

    // 策略开关（默认关闭，保证分类稳定）
    this.enablePopularity = options.enablePopularity || 
                           process.env.ENABLE_POPULARITY === 'true' || 
                           false;
    this.enableBadges = options.enableBadges || 
                       process.env.ENABLE_BADGES === 'true' || 
                       false;

    if (!this.enablePopularity) {
      console.log('ℹ️  热门度计算已禁用（使用字母排序）');
    }
    if (!this.enableBadges) {
      console.log('ℹ️  徽章生成已禁用');
    }
  }

  /**
   * 主执行函数
   */
  async generate() {
    try {
      console.log('🎵 开始生成音色分类文件...\n');

      // 1. 读取主数据源
      const mappingData = await this.loadMappingData();
      console.log(`✅ 加载了 ${mappingData.voices.length} 个音色模型`);

      // 2. 数据验证
      this.validateMappingData(mappingData);
      console.log('✅ 数据验证通过');

      // 3. 生成分类数据
      const categories = this.generateCategories(mappingData);
      console.log(`✅ 生成了 ${categories.categories.length} 个分类`);

      // 4. 原子写入文件
      await this.atomicWrite(categories);
      console.log('✅ 文件写入成功');

      // 5. 输出统计信息
      this.printStats(categories);

      console.log('\n🎉 音色分类文件生成完成！');
      return categories;

    } catch (error) {
      console.error('❌ 生成失败:', error.message);
      throw error;
    }
  }

  /**
   * 加载映射数据
   */
  async loadMappingData() {
    try {
      const data = await fs.readFile(this.mappingFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`无法读取映射文件: ${error.message}`);
    }
  }

  /**
   * 验证映射数据
   */
  validateMappingData(data) {
    if (!data.voices || !Array.isArray(data.voices)) {
      throw new Error('映射文件格式错误：缺少 voices 数组');
    }

    const errors = [];
    const systemIdSet = new Set();
    const providerServiceVoiceSet = new Set();

    data.voices.forEach((voice, index) => {
      const prefix = `音色 #${index + 1}`;

      if (typeof voice.id !== 'string' || voice.id.trim() === '') {
        errors.push(`${prefix} 缺少必需字段: id`);
      }
      if (typeof voice.name !== 'string' || voice.name.trim() === '') {
        errors.push(`${prefix} 缺少必需字段: name`);
      }
      if (typeof voice.provider !== 'string' || voice.provider.trim() === '') {
        errors.push(`${prefix} 缺少必需字段: provider`);
      }
      if (typeof voice.service !== 'string' || voice.service.trim() === '') {
        errors.push(`${prefix} 缺少必需字段: service`);
      }
      if (typeof voice.voiceId !== 'string' || voice.voiceId.trim() === '') {
        errors.push(`${prefix} 缺少必需字段: voiceId`);
      }
      if (!['male', 'female'].includes(voice.gender)) {
        errors.push(`${prefix} gender 必须为 male 或 female`);
      }
      if (!Array.isArray(voice.languages) || voice.languages.length === 0) {
        errors.push(`${prefix} languages 必须为非空数组`);
      }

      if (systemIdSet.has(voice.id)) {
        errors.push(`重复的 systemId: ${voice.id}`);
      } else {
        systemIdSet.add(voice.id);
      }

      const providerServiceVoiceKey = `${voice.provider}:${voice.service}:${voice.voiceId}`;
      if (providerServiceVoiceSet.has(providerServiceVoiceKey)) {
        errors.push(`重复的提供商音色: ${voice.provider}/${voice.service}/${voice.voiceId}`);
      } else {
        providerServiceVoiceSet.add(providerServiceVoiceKey);
      }
    });

    if (errors.length > 0) {
      throw new Error(`数据验证失败:\n${errors.join('\n')}`);
    }
  }

  /**
   * 生成分类数据
   */
  generateCategories(mappingData) {
    const voices = mappingData.voices;
    const categories = [];

    // 计算源文件指纹
    const sourceFingerprint = this.calculateFingerprint(JSON.stringify(mappingData));

    // 1. 按性别分类
    categories.push(...this.categorizeByGender(voices));

    // 2. 按语言分类
    categories.push(...this.categorizeByLanguage(voices));

    // 3. 按服务商分类
    categories.push(...this.categorizeByProvider(voices));

    // 4. 按标签分类（热门、双语等）
    categories.push(...this.categorizeByTags(voices));

    // 构建最终输出
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      source: {
        mappingVersion: mappingData.version || 1,
        sourceFingerprint: sourceFingerprint,
        totalVoices: voices.length
      },
      categories: this.sortCategories(categories)
    };
  }

  /**
   * 按性别分类
   */
  categorizeByGender(voices) {
    const genderMap = {
      female: { key: 'gender_female', title: '女声', icon: '👩', order: 1 },
      male: { key: 'gender_male', title: '男声', icon: '👨', order: 2 }
    };

    return Object.entries(genderMap).map(([gender, config]) => {
      const items = voices
        .filter(v => v.gender === gender)
        .map(v => this.createCategoryItem(v))
        .sort((a, b) => this.compareByPopularity(a, b));

      return {
        key: config.key,
        title: config.title,
        icon: config.icon,
        order: config.order,
        count: items.length,
        items: items
      };
    });
  }

  /**
   * 按语言分类
   */
  categorizeByLanguage(voices) {
    const languageMap = {
      'zh-CN': { key: 'lang_zh_cn', title: '中文', icon: '🇨🇳', order: 10 },
      'en-US': { key: 'lang_en_us', title: '英文', icon: '🇺🇸', order: 11 },
      'en-GB': { key: 'lang_en_gb', title: '英式英文', icon: '🇬🇧', order: 12 }
    };

    const categories = [];

    Object.entries(languageMap).forEach(([lang, config]) => {
      const items = voices
        .filter(v => v.languages && v.languages.includes(lang))
        .map(v => this.createCategoryItem(v))
        .sort((a, b) => this.compareByPopularity(a, b));

      if (items.length > 0) {
        categories.push({
          key: config.key,
          title: config.title,
          icon: config.icon,
          order: config.order,
          count: items.length,
          items: items
        });
      }
    });

    return categories;
  }

  /**
   * 按服务商分类
   */
  categorizeByProvider(voices) {
    const providerMap = {
      aliyun: { key: 'provider_aliyun', title: '阿里云', icon: '☁️', order: 20 },
      tencent: { key: 'provider_tencent', title: '腾讯云', icon: '🐧', order: 21 },
      volcengine: { key: 'provider_volcengine', title: '火山引擎', icon: '🌋', order: 22 },
      minimax: { key: 'provider_minimax', title: 'MiniMax', icon: '🤖', order: 23 }
    };

    return Object.entries(providerMap).map(([provider, config]) => {
      const items = voices
        .filter(v => v.provider === provider)
        .map(v => this.createCategoryItem(v))
        .sort((a, b) => this.compareByPopularity(a, b));

      return {
        key: config.key,
        title: config.title,
        icon: config.icon,
        order: config.order,
        count: items.length,
        items: items
      };
    });
  }

  /**
   * 按标签分类
   */
  categorizeByTags(voices) {
    const tagMap = {
      popular: { key: 'tag_popular', title: '热门推荐', icon: '🔥', order: 30 },
      bilingual: { key: 'tag_bilingual', title: '双语音色', icon: '🌐', order: 31 },
      sweet: { key: 'tag_sweet', title: '甜美音色', icon: '🍬', order: 32 },
      professional: { key: 'tag_professional', title: '专业音色', icon: '💼', order: 33 },
      storytelling: { key: 'tag_storytelling', title: '讲故事', icon: '📖', order: 34 },
      dialect: { key: 'tag_dialect', title: '方言音色', icon: '🗣️', order: 35 }
    };

    const categories = [];

    Object.entries(tagMap).forEach(([tag, config]) => {
      const items = voices
        .filter(v => v.tags && v.tags.includes(tag))
        .map(v => this.createCategoryItem(v))
        .sort((a, b) => this.compareByPopularity(a, b));

      if (items.length > 0) {
        categories.push({
          key: config.key,
          title: config.title,
          icon: config.icon,
          order: config.order,
          count: items.length,
          items: items
        });
      }
    });

    return categories;
  }

  /**
   * 创建分类项
   */
  createCategoryItem(voice) {
    const item = {
      systemId: voice.id,
      title: voice.name,
      provider: voice.provider,
      service: voice.service,
      gender: voice.gender,
      languages: voice.languages
    };

    // 可选：添加徽章（默认关闭）
    if (this.enableBadges) {
      item.badges = this.generateBadges(voice);
    }

    // 可选：添加热门度（默认关闭）
    if (this.enablePopularity) {
      item.popularity = this.calculatePopularity(voice);
    }

    return item;
  }

  /**
   * 计算热门度评分（仅在启用时使用）
   */
  calculatePopularity(voice) {
    if (!this.enablePopularity) return 0;

    let score = 0;

    // 基础分
    score += 10;

    // 标签加分
    if (voice.tags) {
      if (voice.tags.includes('popular')) score += 50;
      if (voice.tags.includes('sweet')) score += 20;
      if (voice.tags.includes('bilingual')) score += 30;
      if (voice.tags.includes('professional')) score += 15;
      if (voice.tags.includes('storytelling')) score += 10;
    }

    // 语言加分（多语言更受欢迎）
    if (voice.languages && voice.languages.length > 1) {
      score += 25;
    }

    // 服务商加分（某些服务商质量更高）
    if (voice.provider === 'aliyun') score += 10;
    if (voice.service === 'cosyvoice') score += 15;

    return score;
  }

  /**
   * 生成徽章（仅在启用时使用）
   */
  generateBadges(voice) {
    if (!this.enableBadges) return [];

    const badges = [];

    if (voice.tags) {
      if (voice.tags.includes('popular')) badges.push('热门');
      if (voice.tags.includes('sweet')) badges.push('甜美');
      if (voice.tags.includes('bilingual')) badges.push('双语');
      if (voice.tags.includes('professional')) badges.push('专业');
      if (voice.tags.includes('storytelling')) badges.push('讲故事');
      if (voice.tags.includes('dialect')) badges.push('方言');
      if (voice.tags.includes('english')) badges.push('英文');
    }

    // 多语言徽章
    if (voice.languages && voice.languages.length > 1) {
      badges.push('多语言');
    }

    return badges;
  }

  /**
   * 按热门度或字母顺序比较
   */
  compareByPopularity(a, b) {
    if (this.enablePopularity && a.popularity !== undefined && b.popularity !== undefined) {
      // 启用热门度：先按热门度降序
      if (b.popularity !== a.popularity) {
        return b.popularity - a.popularity;
      }
    }
    
    // 热门度相同或未启用，按名称排序（确保稳定排序）
    return a.title.localeCompare(b.title, 'zh-CN');
  }

  /**
   * 排序分类
   */
  sortCategories(categories) {
    return categories.sort((a, b) => a.order - b.order);
  }

  /**
   * 计算指纹
   */
  calculateFingerprint(content) {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * 原子写入文件
   */
  async atomicWrite(data) {
    try {
      const content = JSON.stringify(data, null, 2);

      // 1. 写入临时文件
      await fs.writeFile(this.tempFile, content, 'utf8');

      // 2. 备份现有文件（如果存在）
      try {
        await fs.access(this.outputFile);
        try {
          await fs.unlink(this.backupFile);
        } catch (error) {
          // 备份文件不存在，跳过
        }
        await fs.rename(this.outputFile, this.backupFile);
      } catch (error) {
        // 文件不存在，跳过备份
      }

      // 3. 将临时文件重命名为正式文件
      await fs.rename(this.tempFile, this.outputFile);

    } catch (error) {
      // 写入失败，尝试恢复备份
      try {
        await fs.access(this.backupFile);
        try {
          await fs.unlink(this.outputFile);
        } catch (unlinkError) {
          // 忽略删除失败
        }
        await fs.rename(this.backupFile, this.outputFile);
        console.warn('⚠️  写入失败，已恢复备份文件');
      } catch (restoreError) {
        // 恢复失败
      }

      throw new Error(`文件写入失败: ${error.message}`);
    }
  }

  /**
   * 打印统计信息
   */
  printStats(categories) {
    console.log('\n📊 生成统计:');
    console.log(`  - 总分类数: ${categories.categories.length}`);
    console.log(`  - 总音色数: ${categories.source.totalVoices}`);
    console.log(`  - 生成时间: ${categories.generatedAt}`);
    console.log(`  - 源文件指纹: ${categories.source.sourceFingerprint}`);

    console.log('\n📋 分类详情:');
    categories.categories.forEach(cat => {
      console.log(`  - ${cat.icon} ${cat.title}: ${cat.count} 个音色`);
    });
  }
}

// 主执行函数
async function main() {
  // 从环境变量或命令行参数读取配置
  const options = {
    enablePopularity: process.env.ENABLE_POPULARITY === 'true',
    enableBadges: process.env.ENABLE_BADGES === 'true'
  };

  const generator = new VoiceCategoryGenerator(options);
  
  try {
    await generator.generate();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 生成失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

// 导出供其他模块使用
module.exports = {
  VoiceCategoryGenerator,
  generate: async (options = {}) => {
    const generator = new VoiceCategoryGenerator(options);
    return await generator.generate();
  }
};
