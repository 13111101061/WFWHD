#!/usr/bin/env node

/**
 * TTS模型管理工具
 * 提供模型添加、删除、修改、批量操作等功能
 */

const fs = require('fs').promises;
const path = require('path');
const { validateModel, normalizeModelData } = require('../src/modules/tts/config/ModelSchema');

const CONFIG_PATH = path.join(__dirname, '../src/modules/tts/config/voiceModels.json');

class ModelManager {
  constructor() {
    this.config = null;
  }

  /**
   * 加载配置文件
   */
  async loadConfig() {
    try {
      const data = await fs.readFile(CONFIG_PATH, 'utf8');
      this.config = JSON.parse(data);
      return this.config;
    } catch (error) {
      console.error('加载配置文件失败:', error);
      process.exit(1);
    }
  }

  /**
   * 保存配置文件
   */
  async saveConfig() {
    try {
      const data = JSON.stringify(this.config, null, 2);
      await fs.writeFile(CONFIG_PATH, data, 'utf8');
      console.log('✅ 配置文件已保存');
    } catch (error) {
      console.error('保存配置文件失败:', error);
      process.exit(1);
    }
  }

  /**
   * 列出所有模型
   */
  listModels() {
    if (!this.config) return;

    console.log(`\n📋 当前模型列表 (共 ${this.config.models.length} 个):\n`);
    this.config.models.forEach((model, index) => {
      console.log(`${index + 1}. ${model.name} (${model.id})`);
      console.log(`   提供商: ${model.provider} | 语言: ${model.languages.join(', ')}`);
      console.log(`   标签: ${model.tags?.join(', ') || '无'}\n`);
    });
  }

  /**
   * 添加新模型
   */
  addModel(modelData) {
    if (!this.config) return;

    try {
      // 标准化数据
      const normalizedModel = normalizeModelData(modelData);

      // 验证数据
      const validation = validateModel(normalizedModel);
      if (!validation.valid) {
        console.error('❌ 模型数据验证失败:');
        validation.errors.forEach(error => console.error(`  - ${error}`));
        return false;
      }

      // 检查是否已存在
      const existingIndex = this.config.models.findIndex(m => m.id === normalizedModel.id);
      if (existingIndex !== -1) {
        console.warn(`⚠️  模型 ${normalizedModel.id} 已存在，将被覆盖`);
        this.config.models[existingIndex] = normalizedModel;
      } else {
        this.config.models.push(normalizedModel);
        console.log(`✅ 模型 ${normalizedModel.id} 添加成功`);
      }

      return true;
    } catch (error) {
      console.error('❌ 添加模型失败:', error.message);
      return false;
    }
  }

  /**
   * 删除模型
   */
  removeModel(modelId) {
    if (!this.config) return;

    const index = this.config.models.findIndex(m => m.id === modelId);
    if (index === -1) {
      console.error(`❌ 模型 ${modelId} 不存在`);
      return false;
    }

    const removedModel = this.config.models.splice(index, 1)[0];
    console.log(`✅ 模型 ${removedModel.name} (${modelId}) 已删除`);
    return true;
  }

  /**
   * 修改模型状态
   */
  updateModelStatus(modelId, status) {
    if (!this.config) return;

    const model = this.config.models.find(m => m.id === modelId);
    if (!model) {
      console.error(`❌ 模型 ${modelId} 不存在`);
      return false;
    }

    const validStatuses = ['active', 'inactive', 'deprecated'];
    if (!validStatuses.includes(status)) {
      console.error(`❌ 无效的状态: ${status}，有效值: ${validStatuses.join(', ')}`);
      return false;
    }

    model.status = status;
    console.log(`✅ 模型 ${model.name} 状态已更新为: ${status}`);
    return true;
  }

  /**
   * 搜索模型
   */
  searchModels(query) {
    if (!this.config) return [];

    const searchTerm = query.toLowerCase();
    return this.config.models.filter(model => {
      return (
        model.name.toLowerCase().includes(searchTerm) ||
        model.description?.toLowerCase().includes(searchTerm) ||
        model.id.toLowerCase().includes(searchTerm) ||
        model.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    });
  }

  /**
   * 批量导入模型
   */
  async importFromFile(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const models = JSON.parse(data);

      if (!Array.isArray(models)) {
        console.error('❌ 文件格式错误：需要一个模型数组');
        return false;
      }

      let successCount = 0;
      for (const modelData of models) {
        if (this.addModel(modelData)) {
          successCount++;
        }
      }

      console.log(`✅ 批量导入完成：${successCount}/${models.length} 个模型成功`);
      return successCount > 0;

    } catch (error) {
      console.error('❌ 导入文件失败:', error.message);
      return false;
    }
  }

  /**
   * 导出模型到文件
   */
  async exportToFile(filePath, filters = {}) {
    try {
      let models = [...this.config.models];

      // 应用过滤器
      if (filters.provider) {
        models = models.filter(m => m.provider === filters.provider);
      }
      if (filters.status) {
        models = models.filter(m => m.status === filters.status);
      }

      const data = JSON.stringify(models, null, 2);
      await fs.writeFile(filePath, data, 'utf8');
      console.log(`✅ 已导出 ${models.length} 个模型到: ${filePath}`);
      return true;

    } catch (error) {
      console.error('❌ 导出文件失败:', error.message);
      return false;
    }
  }

  /**
   * 显示统计信息
   */
  showStats() {
    if (!this.config) return;

    const stats = {
      total: this.config.models.length,
      byProvider: {},
      byLanguage: {},
      byGender: {},
      byStatus: {}
    };

    this.config.models.forEach(model => {
      // 按提供商统计
      stats.byProvider[model.provider] = (stats.byProvider[model.provider] || 0) + 1;

      // 按语言统计
      model.languages.forEach(lang => {
        stats.byLanguage[lang] = (stats.byLanguage[lang] || 0) + 1;
      });

      // 按性别统计
      stats.byGender[model.gender] = (stats.byGender[model.gender] || 0) + 1;

      // 按状态统计
      stats.byStatus[model.status] = (stats.byStatus[model.status] || 0) + 1;
    });

    console.log('\n📊 模型统计信息:');
    console.log(`总模型数: ${stats.total}`);
    console.log('\n按提供商:');
    Object.entries(stats.byProvider).forEach(([provider, count]) => {
      console.log(`  ${provider}: ${count}`);
    });
    console.log('\n按语言:');
    Object.entries(stats.byLanguage).forEach(([lang, count]) => {
      console.log(`  ${lang}: ${count}`);
    });
    console.log('\n按性别:');
    Object.entries(stats.byGender).forEach(([gender, count]) => {
      console.log(`  ${gender}: ${count}`);
    });
    console.log('\n按状态:');
    Object.entries(stats.byStatus).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
  }
}

// 命令行界面
async function main() {
  const args = process.argv.slice(2);
  const manager = new ModelManager();

  await manager.loadConfig();

  const command = args[0];

  switch (command) {
    case 'list':
      manager.listModels();
      break;

    case 'add':
      if (args.length < 2) {
        console.log('用法: node model-manager.js add <model-json>');
        process.exit(1);
      }
      const modelData = JSON.parse(args[1]);
      if (manager.addModel(modelData)) {
        await manager.saveConfig();
      }
      break;

    case 'remove':
      if (args.length < 2) {
        console.log('用法: node model-manager.js remove <model-id>');
        process.exit(1);
      }
      if (manager.removeModel(args[1])) {
        await manager.saveConfig();
      }
      break;

    case 'update-status':
      if (args.length < 3) {
        console.log('用法: node model-manager.js update-status <model-id> <status>');
        process.exit(1);
      }
      if (manager.updateModelStatus(args[1], args[2])) {
        await manager.saveConfig();
      }
      break;

    case 'search':
      if (args.length < 2) {
        console.log('用法: node model-manager.js search <query>');
        process.exit(1);
      }
      const results = manager.searchModels(args[1]);
      console.log(`\n🔍 搜索结果 (共 ${results.length} 个):\n`);
      results.forEach(model => {
        console.log(`- ${model.name} (${model.id})`);
        console.log(`  ${model.description || '无描述'}\n`);
      });
      break;

    case 'import':
      if (args.length < 2) {
        console.log('用法: node model-manager.js import <file-path>');
        process.exit(1);
      }
      if (await manager.importFromFile(args[1])) {
        await manager.saveConfig();
      }
      break;

    case 'export':
      if (args.length < 2) {
        console.log('用法: node model-manager.js export <file-path> [--provider=xxx] [--status=xxx]');
        process.exit(1);
      }
      const filters = {};
      args.slice(2).forEach(arg => {
        if (arg.startsWith('--provider=')) {
          filters.provider = arg.split('=')[1];
        } else if (arg.startsWith('--status=')) {
          filters.status = arg.split('=')[1];
        }
      });
      await manager.exportToFile(args[1], filters);
      break;

    case 'stats':
      manager.showStats();
      break;

    default:
      console.log(`
🎵 TTS模型管理工具

用法:
  node model-manager.js <command> [options]

命令:
  list                           - 列出所有模型
  add <model-json>              - 添加新模型
  remove <model-id>             - 删除模型
  update-status <model-id> <status> - 更新模型状态
  search <query>                - 搜索模型
  import <file-path>            - 从文件批量导入
  export <file-path> [filters]  - 导出到文件
  stats                         - 显示统计信息

示例:
  node model-manager.js list
  node model-manager.js add '{"id":"test-1","name":"测试",...}'
  node model-manager.js remove cosyvoice-oldvoice-v1
  node model-manager.js update-status cosyvoice-oldvoice-v1 deprecated
  node model-manager.js search "女声"
  node model-manager.js import models.json
  node model-manager.js export backup.json --provider=aliyun
      `);
      process.exit(0);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ModelManager;