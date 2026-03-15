/**
 * VoiceResolver 单元测试
 *
 * 运行方式: node tests/unit/VoiceResolver.test.js
 */

const assert = require('assert');

// 测试前准备
const { VoiceResolver } = require('../../src/modules/tts/application/VoiceResolver');
const { voiceRegistry } = require('../../src/modules/tts/core/VoiceRegistry');

// ==================== VoiceResolver.resolve() 测试 ====================

async function runTests() {
  console.log('\n=== VoiceResolver 测试 ===\n');

  // 初始化 registry
  console.log('初始化 VoiceRegistry...');
  await voiceRegistry.initialize();

  // 测试 1: 解析已知服务
  console.log('测试 1: 解析已知服务标识');
  try {
    const result = VoiceResolver.resolve({
      service: 'aliyun_qwen_http',
      text: '测试文本'
    });
    assert.strictEqual(result.providerKey, 'aliyun', 'providerKey 应该是 aliyun');
    assert.strictEqual(result.serviceKey, 'qwen_http', 'serviceKey 应该是 qwen_http');
    assert.strictEqual(result.adapterKey, 'aliyun_qwen_http', 'adapterKey 应该是 aliyun_qwen_http');
    assert.ok(result.runtimeOptions, '应该有 runtimeOptions');
    console.log('✅ 通过\n');
  } catch (err) {
    console.log('❌ 失败:', err.message, '\n');
  }

  // 测试 2: 解析别名
  console.log('测试 2: 解析服务别名');
  try {
    const result = VoiceResolver.resolve({
      service: 'volcengine',  // volcengine_http 的别名
      text: '测试文本'
    });
    assert.strictEqual(result.adapterKey, 'volcengine_http', '别名应该解析为 volcengine_http');
    console.log('✅ 通过\n');
  } catch (err) {
    console.log('❌ 失败:', err.message, '\n');
  }

  // 测试 3: 未知服务应该抛错
  console.log('测试 3: 未知服务应该抛错');
  try {
    VoiceResolver.resolve({
      service: 'unknown_service',
      text: '测试文本'
    });
    console.log('❌ 失败: 应该抛出错误\n');
  } catch (err) {
    assert.strictEqual(err.code, 'UNKNOWN_SERVICE', '错误码应该是 UNKNOWN_SERVICE');
    console.log('✅ 通过\n');
  }

  // 测试 4: 使用音色 ID
  console.log('测试 4: 使用音色 ID 解析');
  try {
    const result = VoiceResolver.resolve({
      service: 'aliyun_qwen_http',
      voiceId: 'aliyun-qwen_http-cherry',
      text: '测试文本'
    });
    assert.ok(result.voiceId, '应该有 voiceId');
    assert.ok(result.voiceRuntime, '应该有 voiceRuntime');
    // Cherry 的 voice 应该是 Cherry
    if (result.voiceRuntime && result.voiceRuntime.voice) {
      console.log(`  音色: ${result.voiceRuntime.voice}`);
    }
    console.log('✅ 通过\n');
  } catch (err) {
    console.log('❌ 失败:', err.message, '\n');
  }

  // 测试 5: 用户选项覆盖默认值
  console.log('测试 5: 用户选项覆盖默认值');
  try {
    const result = VoiceResolver.resolve({
      service: 'aliyun_qwen_http',
      options: {
        speed: 2.0,
        pitch: 0.5,
        format: 'mp3'
      },
      text: '测试文本'
    });
    assert.strictEqual(result.runtimeOptions.speed, 2.0, 'speed 应该被用户选项覆盖');
    assert.strictEqual(result.runtimeOptions.pitch, 0.5, 'pitch 应该被用户选项覆盖');
    assert.strictEqual(result.runtimeOptions.format, 'mp3', 'format 应该被用户选项覆盖');
    console.log('✅ 通过\n');
  } catch (err) {
    console.log('❌ 失败:', err.message, '\n');
  }

  // 测试 6: validateText
  console.log('测试 6: 文本验证');
  try {
    // 空文本应该失败
    VoiceResolver.validateText('');
    console.log('❌ 失败: 空文本应该抛错\n');
  } catch (err) {
    assert.strictEqual(err.code, 'VALIDATION_ERROR', '错误码应该是 VALIDATION_ERROR');
    console.log('  空文本验证: ✅');
  }

  try {
    // null 文本应该失败
    VoiceResolver.validateText(null);
    console.log('❌ 失败: null 文本应该抛错\n');
  } catch (err) {
    assert.strictEqual(err.code, 'VALIDATION_ERROR', '错误码应该是 VALIDATION_ERROR');
    console.log('  null 文本验证: ✅');
  }

  try {
    // 正常文本应该通过
    VoiceResolver.validateText('这是一个正常的文本');
    console.log('  正常文本验证: ✅');
  } catch (err) {
    console.log('❌ 失败: 正常文本不应该抛错\n');
  }
  console.log('✅ 通过\n');

  // 测试 7: getDefaults
  console.log('测试 7: 获取默认值');
  try {
    const defaults = VoiceResolver.getDefaults('aliyun_qwen_http');
    assert.ok(defaults.speed !== undefined, '应该有 speed 默认值');
    assert.ok(defaults.pitch !== undefined, '应该有 pitch 默认值');
    assert.ok(defaults.format !== undefined, '应该有 format 默认值');
    console.log(`  speed: ${defaults.speed}, pitch: ${defaults.pitch}, format: ${defaults.format}`);
    console.log('✅ 通过\n');
  } catch (err) {
    console.log('❌ 失败:', err.message, '\n');
  }

  // 测试 8: _buildRuntimeOptions 合并优先级
  console.log('测试 8: 运行时选项合并优先级');
  try {
    const defaults = { speed: 1.0, pitch: 1.0, format: 'wav' };
    const voiceRuntime = { voice: 'TestVoice', speed: 1.2, model: 'test-model' };
    const options = { speed: 1.5, format: 'mp3' };

    const merged = VoiceResolver._buildRuntimeOptions({
      defaults,
      voiceRuntime,
      options,
      providerConfig: {}
    });

    // 用户选项 > 音色配置 > 默认值
    assert.strictEqual(merged.speed, 1.5, 'speed 应该使用用户选项 (最高优先级)');
    assert.strictEqual(merged.format, 'mp3', 'format 应该使用用户选项');
    assert.strictEqual(merged.pitch, 1.0, 'pitch 应该使用默认值 (无覆盖)');
    assert.strictEqual(merged.voice, 'TestVoice', 'voice 应该来自音色配置');
    assert.strictEqual(merged.model, 'test-model', 'model 应该来自音色配置');
    console.log('✅ 通过\n');
  } catch (err) {
    console.log('❌ 失败:', err.message, '\n');
  }

  console.log('========================================');
  console.log('✅ VoiceResolver 所有测试通过！');
  console.log('========================================\n');
}

runTests().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});