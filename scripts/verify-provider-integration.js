/**
 * Provider 接入验证脚本
 *
 * 用法: node scripts/verify-provider-integration.js <serviceKey>
 * 示例: node scripts/verify-provider-integration.js aliyun_qwen_http
 *
 * 检查项：
 * 1. CapabilitySchema 中是否有服务定义
 * 2. Adapter 是否已注册
 * 3. 音色数据是否完整
 * 4. 参数映射配置是否完整（可选）
 */

const path = require('path');

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, ...args) {
  console.log(colors[color], ...args, colors.reset);
}

async function verifyProvider(serviceKey) {
  console.log(`\n${'='.repeat(60)}`);
  log('blue', `验证服务商: ${serviceKey}`);
  console.log(`${'='.repeat(60)}\n`);

  const results = {
    passed: [],
    warnings: [],
    failed: []
  };

  // 1. 检查 CapabilitySchema
  console.log('📋 检查 CapabilitySchema...');
  try {
    const { CapabilitySchema } = require('../src/modules/tts/schema/CapabilitySchema');
    const serviceConfig = CapabilitySchema.services[serviceKey];

    if (serviceConfig) {
      results.passed.push('CapabilitySchema 服务定义存在');

      // 检查必要字段
      const requiredFields = ['capabilities', 'defaults', 'parameters', 'lockedParams'];
      const missingFields = requiredFields.filter(f => !serviceConfig[f]);

      if (missingFields.length === 0) {
        results.passed.push('CapabilitySchema 必要字段完整');
      } else {
        results.warnings.push(`CapabilitySchema 缺少字段: ${missingFields.join(', ')}`);
      }

      // 检查 defaultVoiceId
      if (serviceConfig.defaultVoiceId) {
        results.passed.push(`defaultVoiceId 已配置: ${serviceConfig.defaultVoiceId}`);
      } else {
        results.warnings.push('defaultVoiceId 未配置');
      }
    } else {
      results.failed.push('CapabilitySchema 中未找到服务定义');
    }
  } catch (e) {
    results.failed.push(`CapabilitySchema 加载失败: ${e.message}`);
  }

  // 2. 检查 ProviderCatalog
  console.log('📚 检查 ProviderCatalog...');
  try {
    const { ProviderCatalog } = require('../src/modules/tts/catalog/ProviderCatalog');
    const catalogConfig = ProviderCatalog.get(serviceKey);

    if (catalogConfig) {
      results.passed.push('ProviderCatalog 配置存在');

      // 检查不应有 capabilities 字段（已迁移）
      if (catalogConfig.capabilities) {
        results.warnings.push('ProviderCatalog 仍有 capabilities 字段（应已迁移到 CapabilitySchema）');
      }
    } else {
      results.failed.push('ProviderCatalog 中未找到服务定义');
    }
  } catch (e) {
    results.failed.push(`ProviderCatalog 加载失败: ${e.message}`);
  }

  // 3. 检查 Adapter
  console.log('🔌 检查 Adapter...');
  try {
    const adapters = require('../src/modules/tts/adapters/providers');

    if (adapters.hasProvider(serviceKey)) {
      results.passed.push('Adapter 已注册');

      // 检查适配器信息
      const info = adapters.getAdapterInfo(serviceKey);
      if (info) {
        results.passed.push(`Adapter: ${info.adapterName}`);
      }

      // 尝试创建实例检查 synthesize 方法
      try {
        const instance = adapters.createProvider(serviceKey);
        if (typeof instance.synthesize === 'function') {
          results.passed.push('Adapter.synthesize() 方法存在');
        } else {
          results.failed.push('Adapter 缺少 synthesize() 方法');
        }
      } catch (e) {
        results.warnings.push(`Adapter 实例化失败: ${e.message}`);
      }
    } else {
      results.failed.push('Adapter 未注册');
    }
  } catch (e) {
    results.failed.push(`Adapter 加载失败: ${e.message}`);
  }

  // 4. 检查音色数据
  console.log('🎤 检查音色数据...');
  try {
    const { voiceRegistry } = require('../src/modules/tts/core/VoiceRegistry');

    // 同步初始化（如果尚未初始化）
    if (!voiceRegistry.isInitialized) {
      await voiceRegistry.initialize();
    }

    const allVoices = voiceRegistry.getAll();

    // 解析 provider 和 service
    const parts = serviceKey.split('_');
    const provider = parts[0];
    const service = parts.slice(1).join('_');

    // 筛选该服务的音色
    const serviceVoices = allVoices.filter(v => {
      const voiceProvider = v.identity?.provider || v.provider;
      const voiceService = v.identity?.service || v.service;
      return voiceProvider === provider && voiceService === service;
    });

    if (serviceVoices.length > 0) {
      results.passed.push(`音色数据存在: ${serviceVoices.length} 个音色`);

      // 检查是否有启用的音色
      const enabledVoices = serviceVoices.filter(v => v.status !== 'disabled');
      if (enabledVoices.length > 0) {
        results.passed.push(`可用音色: ${enabledVoices.length} 个`);
      } else {
        results.warnings.push('所有音色已禁用');
      }
    } else {
      results.warnings.push('未找到音色数据');
    }
  } catch (e) {
    results.warnings.push(`音色数据检查失败: ${e.message}`);
  }

  // 5. 检查 CapabilityResolver
  console.log('⚙️  检查 CapabilityResolver...');
  try {
    const { capabilityResolver } = require('../src/modules/tts/application/CapabilityResolver');
    const context = capabilityResolver.resolve(serviceKey);

    if (context) {
      results.passed.push('CapabilityResolver 可解析服务');

      // 检查新结构字段
      if (context.resolvedDefaults) {
        results.passed.push('resolvedDefaults 字段存在');
      } else {
        results.warnings.push('resolvedDefaults 字段缺失');
      }

      if (context.metadata) {
        results.passed.push('metadata 字段存在');
      } else {
        results.warnings.push('metadata 字段缺失');
      }

      if (context.parameterSupport) {
        results.passed.push('parameterSupport 字段存在');
      } else {
        results.warnings.push('parameterSupport 字段缺失');
      }
    } else {
      results.failed.push('CapabilityResolver 解析失败');
    }
  } catch (e) {
    results.failed.push(`CapabilityResolver 检查失败: ${e.message}`);
  }

  // 6. 检查凭证配置（可选）
  console.log('🔑 检查凭证配置...');
  try {
    const credentials = require('../src/modules/credentials');
    const parts = serviceKey.split('_');
    const provider = parts[0];

    if (credentials.isConfigured(provider)) {
      results.passed.push('凭证已配置');
    } else {
      results.warnings.push('凭证未配置（需要配置后才能调用）');
    }
  } catch (e) {
    results.warnings.push(`凭证检查失败: ${e.message}`);
  }

  // 输出结果
  console.log(`\n${'─'.repeat(60)}`);
  console.log('验证结果:\n');

  if (results.passed.length > 0) {
    log('green', '✅ 通过:');
    results.passed.forEach(item => console.log(`   ✓ ${item}`));
  }

  if (results.warnings.length > 0) {
    console.log('');
    log('yellow', '⚠️  警告:');
    results.warnings.forEach(item => console.log(`   ! ${item}`));
  }

  if (results.failed.length > 0) {
    console.log('');
    log('red', '❌ 失败:');
    results.failed.forEach(item => console.log(`   ✗ ${item}`));
  }

  console.log(`\n${'─'.repeat(60)}`);

  // 总结
  const total = results.passed.length + results.warnings.length + results.failed.length;
  const passRate = Math.round(results.passed.length / total * 100);

  if (results.failed.length === 0) {
    log('green', `\n✅ 验证通过 (${results.passed.length}/${total}，${passRate}%)\n`);
    return true;
  } else {
    log('red', `\n❌ 验证失败 (${results.failed.length} 项未通过)\n`);
    return false;
  }
}

// 主入口
async function main() {
  const serviceKey = process.argv[2];

  if (!serviceKey) {
    console.log('用法: node scripts/verify-provider-integration.js <serviceKey>');
    console.log('示例: node scripts/verify-provider-integration.js aliyun_qwen_http');
    console.log('\n可用的 serviceKey:');
    console.log('  - aliyun_qwen_http');
    console.log('  - aliyun_cosyvoice');
    console.log('  - tencent_tts');
    console.log('  - volcengine_http');
    console.log('  - minimax_tts');
    console.log('  - moss_tts');
    process.exit(1);
  }

  const success = await verifyProvider(serviceKey);
  process.exit(success ? 0 : 1);
}

main().catch(e => {
  console.error('脚本执行失败:', e);
  process.exit(1);
});
