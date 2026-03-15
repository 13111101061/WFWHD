/**
 * TTS 模块整改验收测试
 *
 * 测试范围：
 * - P1-1/P1-2: Service 命名统一
 * - P2-1: update() 索引一致性
 * - P2-2/P2-3: save/reload 元数据完整性
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs').promises;

// 测试目标
const { VoiceRegistry } = require('../src/modules/tts/core/VoiceRegistry');
const { createProvider, getAdapterInfo } = require('../src/modules/tts/adapters/providers');
const credentials = require('../src/modules/credentials');
const { audioStorageManager } = require('../src/shared/utils/audioStorage');

console.log('='.repeat(60));
console.log('TTS 模块整改验收测试');
console.log('='.repeat(60));

let testsPassed = 0;
let testsFailed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}`);
    testsFailed++;
  }
}

// ==================== 测试套件 ====================

async function testServiceNaming() {
  console.log('\n--- P1: Service 命名统一测试 ---\n');

  // P1-1: Volcengine
  await runTest('P1-1: Volcengine adapter service 应为 volcengine_http', () => {
    const info = getAdapterInfo('volcengine_http');
    assert.strictEqual(info.service, 'volcengine_http', 'Adapter service 应为 volcengine_http');
  });

  await runTest('P1-1: Volcengine alias volcengine 应指向 volcengine_http', () => {
    const info = getAdapterInfo('volcengine');
    assert.strictEqual(info.service, 'volcengine_http', 'volcengine alias 应解析到 volcengine_http');
  });

  // P1-2: MiniMax
  await runTest('P1-2: MiniMax adapter service 应为 minimax_tts', () => {
    const info = getAdapterInfo('minimax_tts');
    assert.strictEqual(info.service, 'minimax_tts', 'Adapter service 应为 minimax_tts');
  });

  await runTest('P1-2: MiniMax alias minimax 应指向 minimax_tts', () => {
    const info = getAdapterInfo('minimax');
    assert.strictEqual(info.service, 'minimax_tts', 'minimax alias 应解析到 minimax_tts');
  });
}

async function testVoiceRegistryQuery() {
  console.log('\n--- P1: VoiceRegistry 查询测试 ---\n');

  // 创建测试用的 Registry
  const testRegistry = new VoiceRegistry({
    configPath: path.join(__dirname, '../voices/dist/voices.json')
  });

  await testRegistry.initialize();

  // P1-1: Volcengine 音色查询
  await runTest('P1-1: getByProviderAndService(volcengine, volcengine_http) 应返回音色', () => {
    const voices = testRegistry.getByProviderAndService('volcengine', 'volcengine_http');
    assert(voices.length > 0, '应返回 volcengine_http 音色');
    console.log(`   找到 ${voices.length} 个 volcengine_http 音色`);
  });

  // P1-2: MiniMax 音色查询
  await runTest('P1-2: getByProviderAndService(minimax, minimax_tts) 应返回音色', () => {
    const voices = testRegistry.getByProviderAndService('minimax', 'minimax_tts');
    assert(voices.length > 0, '应返回 minimax_tts 音色');
    console.log(`   找到 ${voices.length} 个 minimax_tts 音色`);
  });

  // 对比：aliyun 应该也正常
  await runTest('对照组: getByProviderAndService(aliyun, qwen_http) 应返回音色', () => {
    const voices = testRegistry.getByProviderAndService('aliyun', 'qwen_http');
    assert(voices.length > 0, '应返回 qwen_http 音色');
    console.log(`   找到 ${voices.length} 个 qwen_http 音色`);
  });
}

async function testUpdateIndexConsistency() {
  console.log('\n--- P2-1: update() 索引一致性测试 ---\n');

  const testRegistry = new VoiceRegistry();
  await testRegistry.initialize();

  // 添加测试音色
  const testVoice = {
    id: 'test-provider-service-voice1',
    provider: 'test_provider',
    service: 'test_service',
    name: 'Test Voice',
    gender: 'female'
  };

  testRegistry.add(testVoice);

  // 初始查询验证
  await runTest('P2-1a: 添加后 getByProvider 应能找到音色', () => {
    const voices = testRegistry.getByProvider('test_provider');
    assert(voices.length === 1, '应找到 1 个音色');
  });

  // 更新 provider 字段
  testRegistry.update('test-provider-service-voice1', {
    provider: 'test_provider_new'
  });

  // 验证索引更新
  await runTest('P2-1b: 更新 provider 后旧索引应清除', () => {
    const oldVoices = testRegistry.getByProvider('test_provider');
    assert(oldVoices.length === 0, '旧 provider 索引应已清除');
  });

  await runTest('P2-1c: 更新 provider 后新索引应建立', () => {
    const newVoices = testRegistry.getByProvider('test_provider_new');
    assert(newVoices.length === 1, '新 provider 索引应已建立');
    assert(newVoices[0].provider === 'test_provider_new', '音色 provider 应已更新');
  });

  // 清理
  testRegistry.remove('test-provider-service-voice1');
}

async function testSaveReloadMetadata() {
  console.log('\n--- P2-2/P2-3: save/reload 元数据完整性测试 ---\n');

  const testFilePath = path.join(__dirname, 'test-voices-temp.json');

  try {
    // 创建测试 Registry
    const testRegistry = new VoiceRegistry({
      configPath: testFilePath
    });

    // 添加测试音色
    testRegistry.add({
      id: 'test-meta-voice1',
      provider: 'meta_test',
      service: 'test_service',
      name: 'Meta Test Voice',
      gender: 'male'
    });

    testRegistry.add({
      id: 'test-meta-voice2',
      provider: 'meta_test2',
      service: 'test_service',
      name: 'Meta Test Voice 2',
      gender: 'female'
    });

    // 设置 provider 状态
    testRegistry.providerStatus.set('meta_test', { enabled: true });
    testRegistry.providerStatus.set('meta_test2', { enabled: false });

    // 保存
    await testRegistry.save();

    // 重新加载
    const newRegistry = new VoiceRegistry({
      configPath: testFilePath
    });
    await newRegistry.initialize();

    // 验证
    await runTest('P2-2a: save/reload 后音色数量应一致', () => {
      assert(newRegistry.voices.size === 2, '应有 2 个音色');
    });

    await runTest('P2-2b: save/reload 后 provider 启用状态应保持', () => {
      const isEnabled = newRegistry.isProviderEnabled('meta_test');
      assert(isEnabled === true, 'meta_test 应仍为启用状态');
    });

    await runTest('P2-2c: save/reload 后 provider 禁用状态应保持', () => {
      const isEnabled = newRegistry.isProviderEnabled('meta_test2');
      assert(isEnabled === false, 'meta_test2 应仍为禁用状态');
    });

  } finally {
    // 清理临时文件
    try {
      await fs.unlink(testFilePath);
    } catch (e) {
      // 忽略
    }
  }
}

async function testCredentialsAliasSupport() {
  console.log('\n--- Credentials Alias 支持测试 ---\n');

  await runTest('Credentials: volcengine.http alias 应能解析', () => {
    const config = credentials.getRegistry().getServiceConfig('volcengine', 'http');
    assert(config !== null, 'http alias 应能解析');
    assert(config.canonicalKey === 'volcengine_http', '应指向 canonical key volcengine_http');
  });

  await runTest('Credentials: minimax.tts alias 应能解析', () => {
    const config = credentials.getRegistry().getServiceConfig('minimax', 'tts');
    assert(config !== null, 'tts alias 应能解析');
    assert(config.canonicalKey === 'minimax_tts', '应指向 canonical key minimax_tts');
  });
}

// ==================== 运行测试 ====================

async function main() {
  try {
    await testServiceNaming();
    await testVoiceRegistryQuery();
    await testUpdateIndexConsistency();
    await testSaveReloadMetadata();
    await testCredentialsAliasSupport();

    console.log('\n' + '='.repeat(60));
    console.log(`测试结果: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('='.repeat(60));

    // 释放资源：停止定时器，允许进程正常退出
    audioStorageManager.stopCleanup();

    if (testsFailed > 0) {
      process.exit(1);
    } else {
      // 显式退出（确保进程结束）
      process.exit(0);
    }
  } catch (error) {
    console.error('测试执行失败:', error);
    audioStorageManager.stopCleanup();
    process.exit(1);
  }
}

main();