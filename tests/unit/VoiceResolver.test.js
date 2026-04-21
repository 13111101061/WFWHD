/**
 * VoiceResolver unit tests (v3.0 - 重构后)
 * Run: node tests/unit/VoiceResolver.test.js
 *
 * VoiceResolver 新输出结构：
 * - serviceKey: canonical service key (如 "aliyun_qwen_http")
 * - providerKey: provider identifier (如 "aliyun")
 * - modelKey: model identifier (可选)
 * - systemId: 系统音色ID
 * - voiceCode: 15位编码
 * - providerVoiceId: 服务商真实音色ID
 * - voiceRuntime: 音色运行时配置
 */

const assert = require('assert');
const { VoiceResolver } = require('../../src/modules/tts/application/VoiceResolver');
const { voiceRegistry } = require('../../src/modules/tts/core/VoiceRegistry');

async function runTests() {
  console.log('\n=== VoiceResolver tests (v3.0 - refactored) ===\n');
  await voiceRegistry.initialize();

  console.log('Test 1: resolve known service');
  {
    const result = VoiceResolver.resolve({
      service: 'aliyun_qwen_http',
      text: 'test'
    });
    // serviceKey 是完整的 canonical key
    assert.strictEqual(result.providerKey, 'aliyun');
    assert.strictEqual(result.serviceKey, 'aliyun_qwen_http');
  }
  console.log('✅ pass\n');

  console.log('Test 2: resolve alias');
  {
    // 使用 moss 别名测试（实际有默认音色配置）
    const result = VoiceResolver.resolve({
      service: 'moss',  // 别名，对应 canonical key: moss_tts
      text: 'test'
    });
    assert.strictEqual(result.serviceKey, 'moss_tts');
    assert.strictEqual(result.providerKey, 'moss');
  }
  console.log('✅ pass\n');

  console.log('Test 3: unknown service');
  {
    let err = null;
    try {
      VoiceResolver.resolve({ service: 'unknown_service', text: 'test' });
    } catch (e) {
      err = e;
    }
    assert.ok(err);
    assert.strictEqual(err.code, 'UNKNOWN_SERVICE');
  }
  console.log('✅ pass\n');

  console.log('Test 4: explicit voiceId resolves to providerVoiceId');
  {
    const result = VoiceResolver.resolve({
      service: 'aliyun_qwen_http',
      voiceId: 'aliyun-qwen_http-cherry',  // systemId
      text: 'test'
    });
    // VoiceResolver 会将 systemId 解析为 providerVoiceId
    assert.ok(result.providerVoiceId);  // 服务商真实音色ID
    assert.ok(result.systemId);         // 系统音色ID
    assert.ok(result.voiceRuntime);
  }
  console.log('✅ pass\n');

  console.log('Test 5: voiceCode v2.0 format');
  {
    // v2.0 格式编码: PPP(3) VVVVV(5) RRRRRR(6) C(1)
    // 示例: "002000010000005" = 阿里云(provider=002) 音色序号1(voiceNumber=00001)
    const result = VoiceResolver.resolve({
      voiceCode: '002000010000005',  // v2.0 格式编码
      text: 'test'
    });

    assert.strictEqual(result.providerKey, 'aliyun');
    assert.strictEqual(result.serviceKey, 'aliyun_qwen_http');
    assert.strictEqual(result.voiceCode, '002000010000005');
    assert.ok(result.providerVoiceId);  // 应该解析出 Cherry
  }
  console.log('✅ pass\n');

  console.log('Test 6: MOSS voiceCode');
  {
    const result = VoiceResolver.resolve({
      voiceCode: '001000030000005',  // MOSS 音色
      text: 'test'
    });

    assert.strictEqual(result.providerKey, 'moss');
    assert.strictEqual(result.serviceKey, 'moss_tts');
    assert.ok(result.providerVoiceId);
  }
  console.log('✅ pass\n');

  console.log('Test 7: voice option maps to voiceId (requires lookup)');
  {
    // voice 字段会被当作 voiceId 进行查找
    // 如果要使用服务商音色ID，应该传 systemId
    const result = VoiceResolver.resolve({
      service: 'aliyun_qwen_http',
      voice: 'aliyun-qwen_http-cherry',  // systemId 格式
      text: 'test'
    });

    assert.strictEqual(result.serviceKey, 'aliyun_qwen_http');
    assert.ok(result.providerVoiceId);
    assert.strictEqual(result.systemId, 'aliyun-qwen_http-cherry');
  }
  console.log('✅ pass\n');

  console.log('Test 8: systemId resolution');
  {
    const result = VoiceResolver.resolve({
      systemId: 'aliyun-qwen_http-cherry',
      text: 'test'
    });

    assert.strictEqual(result.serviceKey, 'aliyun_qwen_http');
    assert.strictEqual(result.systemId, 'aliyun-qwen_http-cherry');
    assert.ok(result.providerVoiceId);
  }
  console.log('✅ pass\n');

  console.log('========================================');
  console.log('✅ VoiceResolver all tests passed');
  console.log('========================================\n');

  // 清理资源，确保脚本正常退出
  await cleanup();
}

/**
 * 清理测试资源
 */
async function cleanup() {
  try {
    // 关闭 VoiceRegistry（Redis 连接等）
    if (voiceRegistry && voiceRegistry.close) {
      await voiceRegistry.close();
    }

    console.log('Resource cleanup completed.\n');
  } catch (e) {
    // 清理失败不影响测试结果
    console.log('Non-fatal error during cleanup:', e.message);
  }

  // 强制退出，避免定时器/句柄未释放导致超时
  process.exit(0);
}

runTests().catch(err => {
  console.error('Tests failed:', err);
  process.exit(1);
});
