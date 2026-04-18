/**
 * VoiceResolver unit tests (v2.0 格式)
 * Run: node tests/unit/VoiceResolver.test.js
 */

const assert = require('assert');
const { VoiceResolver } = require('../../src/modules/tts/application/VoiceResolver');
const { voiceRegistry } = require('../../src/modules/tts/core/VoiceRegistry');

async function runTests() {
  console.log('\n=== VoiceResolver tests (VoiceCode v2.0) ===\n');
  await voiceRegistry.initialize();

  console.log('Test 1: resolve known service');
  {
    const result = VoiceResolver.resolve({
      service: 'aliyun_qwen_http',
      text: 'test'
    });
    assert.strictEqual(result.providerKey, 'aliyun');
    assert.strictEqual(result.serviceKey, 'qwen_http');
    assert.strictEqual(result.adapterKey, 'aliyun_qwen_http');
    assert.ok(result.runtimeOptions);
  }
  console.log('✅ pass\n');

  console.log('Test 2: resolve alias');
  {
    // 使用 moss 别名测试（实际有默认音色配置）
    const result = VoiceResolver.resolve({
      service: 'moss',  // 别名，对应 canonical key: moss_tts
      text: 'test'
    });
    assert.strictEqual(result.adapterKey, 'moss_tts');
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

  console.log('Test 4: explicit voiceId');
  {
    const result = VoiceResolver.resolve({
      service: 'aliyun_qwen_http',
      voiceId: 'aliyun-qwen_http-cherry',  // systemId
      text: 'test'
    });
    // VoiceResolver 会将 systemId 解析为 providerVoiceId（如 "Cherry"）
    assert.ok(result.voiceId);  // 返回 provider 真实 voiceId
    assert.ok(result.systemId);   // 返回 systemId
    assert.ok(result.voiceRuntime);
  }
  console.log('✅ pass\n');

  console.log('Test 5: option override');
  {
    const result = VoiceResolver.resolve({
      service: 'aliyun_qwen_http',
      options: { speed: 2.0, pitch: 0.5, format: 'mp3' },
      text: 'test'
    });
    assert.strictEqual(result.runtimeOptions.speed, 2.0);
    assert.strictEqual(result.runtimeOptions.pitch, 0.5);
    assert.strictEqual(result.runtimeOptions.format, 'mp3');
  }
  console.log('✅ pass\n');

  console.log('Test 6: validateText');
  {
    assert.throws(() => VoiceResolver.validateText(''), /Missing required parameter: text|Text must be a non-empty string/);
    assert.throws(() => VoiceResolver.validateText(null), /Missing required parameter: text/);
    assert.doesNotThrow(() => VoiceResolver.validateText('正常文本'));
  }
  console.log('✅ pass\n');

  console.log('Test 7: getDefaults');
  {
    const defaults = VoiceResolver.getDefaults('aliyun_qwen_http');
    assert.ok(defaults.speed !== undefined);
    assert.ok(defaults.pitch !== undefined);
    assert.ok(defaults.format !== undefined);
  }
  console.log('✅ pass\n');

  console.log('Test 8: _buildRuntimeOptions priority and provider options flatten');
  {
    const defaults = { speed: 1.0, pitch: 1.0, format: 'wav' };
    const voiceRuntime = {
      voiceId: 'TestVoice',
      speed: 1.2,
      model: 'test-model',
      providerOptions: {
        samplingParams: {
          temperature: 1.7,
          top_p: 0.8,
          top_k: 25
        }
      }
    };
    const options = { speed: 1.5, format: 'mp3' };

    const merged = VoiceResolver._buildRuntimeOptions({
      defaults,
      voiceRuntime,
      options
    });

    assert.strictEqual(merged.speed, 1.5);
    assert.strictEqual(merged.format, 'mp3');
    assert.strictEqual(merged.pitch, 1.0);
    assert.strictEqual(merged.voice, 'TestVoice');
    assert.strictEqual(merged.voiceId, 'TestVoice');
    assert.strictEqual(merged.model, 'test-model');
    assert.ok(merged.samplingParams);
  }
  console.log('✅ pass\n');

  console.log('Test 9: normalizeRequest legacy compatibility');
  {
    const normalized = VoiceResolver.normalizeRequest({
      text: 'test',
      service: 'aliyun_qwen_http',
      voice: 'aliyun-qwen_http-kai',
      speed: 1.25,
      options: { format: 'wav' }
    });

    assert.strictEqual(normalized.voiceId, 'aliyun-qwen_http-kai');
    assert.strictEqual(normalized.options.speed, 1.25);
    assert.strictEqual(normalized.options.format, 'wav');
  }
  console.log('✅ pass\n');

  console.log('Test 10: VoiceCode v2.0 format - resolve with voiceCode');
  {
    // v2.0 格式编码: PPP(3) VVVVV(5) RRRRRR(6) C(1)
    // 示例: "002000010000005" = 阿里云(provider=002) 音色序号1(voiceNumber=00001)
    const result = VoiceResolver.resolve({
      voiceCode: '002000010000005',  // v2.0 格式编码
      text: 'test'
    });
    
    assert.strictEqual(result.providerKey, 'aliyun');
    assert.strictEqual(result.serviceKey, 'qwen_http');
    assert.strictEqual(result.adapterKey, 'aliyun_qwen_http');
    assert.strictEqual(result.voiceCode, '002000010000005');
    assert.ok(result.voiceId);  // 应该解析出 Cherry
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
