#!/usr/bin/env node
/**
 * 新增服务商自检脚本
 *
 * 用法: node scripts/check-provider.js <providerKey>
 * 示例: node scripts/check-provider.js aliyun
 *
 * 检查项：
 * 1. Manifest 是否加载、校验是否通过
 * 2. 每个 service 的 adapter/api 是否注册
 * 3. Credentials 是否就绪（service 级）
 * 4. Voice 数据是否存在
 * 5. Capability 是否编译成功
 * 6. Default voice 是否存在
 * 7. 动态路由
 */

require('dotenv').config();

const serviceContainer = require('../src/config/ServiceContainer');
const { ProviderManifest } = require('../src/modules/tts/providers/manifests/ProviderManifest');
const credentials = require('../src/modules/credentials');

const C = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
  reset: '\x1b[0m'
};

function ok(msg) { return `${C.green}✓${C.reset} ${msg}`; }
function fail(msg) { return `${C.red}✗${C.reset} ${msg}`; }
function warn(msg) { return `${C.yellow}⚠${C.reset} ${msg}`; }

async function checkProvider(providerKey) {
  console.log(`\n${C.bold}🔍 检查服务商: ${providerKey}${C.reset}\n`);

  await serviceContainer.initialize();
  const voiceRegistry = serviceContainer.get('voiceRegistry');
  const providerRegistry = serviceContainer.get('providerRegistry');
  const pms = serviceContainer.get('providerManagementService');
  const capabilityResolver = serviceContainer.get('capabilityResolver');

  // 1. Manifest
  console.log(`${C.blue}── Manifest${C.reset}`);
  const providerMeta = ProviderManifest.getProviderMeta(providerKey);
  if (!providerMeta) {
    console.log(`  ${fail('未找到 provider')}`);
    return process.exit(1);
  }
  console.log(`  ${ok(`displayName: ${providerMeta.displayName}`)}`);
  console.log(`  ${ok(`credentialMode: ${providerMeta.credentialMode || '未声明'}`)}`);

  const voiceCodeCfg = ProviderManifest.getVoiceCodeConfig(providerKey);
  if (voiceCodeCfg?.providerCode) {
    console.log(`  ${ok(`voiceCode.providerCode: ${voiceCodeCfg.providerCode}`)}`);
  } else {
    console.log(`  ${fail('voiceCode.providerCode 缺失')}`);
  }

  const svcKeys = ProviderManifest.getProviderServices(providerKey).map(s => s.key);
  console.log(`  Services: ${svcKeys.length} → ${svcKeys.join(', ')}`);

  // 2. 逐 service 检查
  for (const serviceKey of svcKeys) {
    console.log(`\n  ${C.blue}── ${serviceKey}${C.reset}`);

    // adapter/api
    if (providerRegistry.hasAdapterClass(serviceKey)) {
      console.log(`    ${ok('adapter/api: 已注册')}`);
      try {
        const adapter = pms.getAdapter(serviceKey);
        console.log(`    ${ok(`adapter instance: ${adapter.constructor.name}`)}`);
      } catch (e) {
        console.log(`    ${fail(`adapter 实例化失败: ${e.message}`)}`);
      }
    } else {
      console.log(`    ${fail('adapter/api: 未注册')}`);
    }

    // Capability
    try {
      const ctx = capabilityResolver.resolve(serviceKey);
      if (ctx?.compiled) {
        const digest = ctx.compiled.capabilityDigest;
        console.log(`    ${ok(`capability: 已编译 (digest=${digest})`)}`);
      } else {
        console.log(`    ${fail('capability: 编译失败')}`);
      }
    } catch (e) {
      console.log(`    ${fail(`capability: ${e.message}`)}`);
    }

    // Credentials (service-aware)
    const serviceType = serviceKey.slice(providerKey.length + 1);
    const credOk = credentials.isServiceAvailable(providerKey, serviceType);
    if (credOk) {
      console.log(`    ${ok(`credentials: ${providerKey}/${serviceType} 可用`)}`);
    } else {
      console.log(`    ${warn(`credentials: ${providerKey}/${serviceType} 未配置或不可用`)}`);
    }

    // Voices
    const voices = voiceRegistry.getByProviderAndService(providerKey, serviceType);
    if (voices.length > 0) {
      console.log(`    ${ok(`voices: ${voices.length} 个`)}`);
    } else {
      console.log(`    ${warn('voices: 无音色数据')}`);
    }

    // Default voice
    const svcCfg = ProviderManifest.getServiceConfig(serviceKey);
    const defaultVoiceId = svcCfg?.defaultVoiceId;
    if (defaultVoiceId) {
      const dv = voiceRegistry.get(defaultVoiceId);
      if (dv) {
        console.log(`    ${ok(`defaultVoiceId: ${defaultVoiceId} 存在`)}`);
      } else {
        console.log(`    ${fail(`defaultVoiceId: ${defaultVoiceId} 不存在于 voice registry`)}`);
      }
    }

    // 动态路由
    const parts = serviceKey.split('_');
    const pk = parts[0];
    const suffix = parts.slice(1).join('_');
    console.log(`    Routes:`);
    console.log(`      POST /api/tts/${pk}/${suffix}`);
    const aliases = svcCfg?.aliases || [];
    if (aliases.length > 0) {
      for (const alias of aliases) {
        console.log(`      POST /api/tts/${alias.replace(/_/g, '/')}`);
      }
    }
  }

  // 3. Voice ↔ manifest 交叉检查
  console.log(`\n${C.blue}── Voice ↔ Manifest 交叉检查${C.reset}`);
  let mismatches = 0;
  for (const voice of voiceRegistry.getAll()) {
    const vProvider = voice.identity?.provider;
    const vService = voice.identity?.service;
    if (vProvider !== providerKey) continue;

    const canonical = `${vProvider}_${vService}`;
    if (!ProviderManifest.getServiceConfig(canonical)) {
      console.log(`  ${warn(`voice.${voice.identity?.id} 的 service "${canonical}" 不在 manifest 中`)}`);
      mismatches++;
    }
  }
  if (mismatches > 0) {
    console.log(`  ${fail(`${mismatches} 个音色的 service 与 manifest 不匹配`)}`);
  } else {
    console.log(`  ${ok('所有 voice service 均匹配 manifest')}`);
  }

  console.log(`\n${C.bold}检查完成${C.reset}\n`);
  process.exit(0);
}

const providerKey = process.argv[2];
if (!providerKey) {
  console.log('用法: node scripts/check-provider.js <providerKey>');
  console.log('示例: node scripts/check-provider.js aliyun');
  console.log('可用 providerKey:');
  ProviderManifest._ensureLoaded();
  ProviderManifest.getAllProviders().forEach(p => console.log(`  - ${p.key}`));
  process.exit(1);
}

checkProvider(providerKey).catch(e => {
  console.error(e);
  process.exit(1);
});
