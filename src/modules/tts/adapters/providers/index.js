/**
 * TTS Providers - 提供者适配器索引
 *
 * 统一导出所有TTS提供者适配器
 */

const BaseTtsAdapter = require('./BaseTtsAdapter');

// 动态加载各提供商适配器
let AliyunCosyVoiceAdapter, AliyunQwenAdapter;
let TencentTtsAdapter;
let VolcengineTtsAdapter;
let MinimaxTtsAdapter;

try {
  AliyunCosyVoiceAdapter = require('./AliyunCosyVoiceAdapter');
} catch (e) { /* 模块可能尚未迁移 */ }

try {
  TencentTtsAdapter = require('./TencentTtsAdapter');
} catch (e) { /* 模块可能尚未迁移 */ }

try {
  VolcengineTtsAdapter = require('./VolcengineTtsAdapter');
} catch (e) { /* 模块可能尚未迁移 */ }

try {
  MinimaxTtsAdapter = require('./MinimaxTtsAdapter');
} catch (e) { /* 模块可能尚未迁移 */ }

/**
 * 创建适配器实例
 * @param {string} provider - 提供商标识
 * @param {string} serviceType - 服务类型
 * @param {Object} config - 配置
 * @returns {BaseTtsAdapter}
 */
function createAdapter(provider, serviceType, config = {}) {
  const key = serviceType ? `${provider}_${serviceType}` : provider;

  switch (key) {
    case 'aliyun_cosyvoice':
    case 'aliyun_cosy':
      if (AliyunCosyVoiceAdapter) {
        return new AliyunCosyVoiceAdapter(config);
      }
      break;

    case 'aliyun_qwen':
    case 'aliyun_qwen_http':
      if (AliyunQwenAdapter) {
        return new AliyunQwenAdapter(config);
      }
      break;

    case 'tencent':
      if (TencentTtsAdapter) {
        return new TencentTtsAdapter(config);
      }
      break;

    case 'volcengine':
    case 'volcengine_http':
      if (VolcengineTtsAdapter) {
        return new VolcengineTtsAdapter(config);
      }
      break;

    case 'minimax':
      if (MinimaxTtsAdapter) {
        return new MinimaxTtsAdapter(config);
      }
      break;

    default:
      throw new Error(`Unknown TTS provider: ${key}`);
  }

  // 如果没有找到适配器，返回基础适配器
  console.warn(`Adapter for ${key} not found, using BaseTtsAdapter`);
  return new BaseTtsAdapter({ provider, serviceType, ...config });
}

module.exports = {
  BaseTtsAdapter,
  createAdapter,

  // 各提供商适配器（可能为 undefined，取决于迁移状态）
  AliyunCosyVoiceAdapter,
  TencentTtsAdapter,
  VolcengineTtsAdapter,
  MinimaxTtsAdapter
};