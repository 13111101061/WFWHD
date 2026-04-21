/**
 * VoiceCatalog 单元测试
 *
 * 运行方式: node tests/unit/VoiceCatalog.test.js
 */

const assert = require('assert');
const path = require('path');

// 测试前准备
const { VoiceCatalog, toDisplayDto, toDetailDto } = require('../../src/modules/tts/catalog/VoiceCatalog');
const { voiceRegistry } = require('../../src/modules/tts/core/VoiceRegistry');

// ==================== 测试数据 ====================

const mockStoredVoice = {
  identity: {
    id: 'test-voice-001',
    provider: 'aliyun',
    service: 'qwen_http',
    voiceCode: '002000010000005'
  },
  profile: {
    displayName: '测试音色',
    gender: 'female',
    languages: ['zh-CN', 'en-US'],
    description: '这是一个测试音色',
    tags: ['温柔', '自然'],
    category: 'standard'
  },
  runtime: {
    voiceId: 'TestVoice',
    model: 'test-model',
    sampleRate: 24000
  },
  status: 'active',
  preview: {
    url: 'https://example.com/preview.mp3'
  },
  metadata: {
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z'
  }
};

// ==================== toDisplayDto 测试 ====================

console.log('\n=== toDisplayDto 函数测试 ===\n');

// 测试 1: 正常转换为展示 DTO
console.log('测试 1: 正确转换为展示 DTO');
const displayDto = toDisplayDto(mockStoredVoice);
assert.strictEqual(displayDto.id, 'test-voice-001', 'id 应该正确');
assert.strictEqual(displayDto.provider, 'aliyun', 'provider 应该正确');
assert.strictEqual(displayDto.displayName, '测试音色', 'displayName 应该正确');
assert.deepStrictEqual(displayDto.tags, ['温柔', '自然'], 'tags 应该正确');
console.log('✅ 通过\n');

// 测试 2: 展示 DTO 不暴露敏感运行时信息
console.log('测试 2: 展示 DTO 不暴露 voiceId');
assert.strictEqual(displayDto.voiceId, undefined, 'voiceId 不应该在展示 DTO 中');
assert.ok(displayDto.runtimePreview, 'runtimePreview 应该存在');
console.log('✅ 通过\n');

// 测试 3: 展示 DTO 不包含完整 runtime
console.log('测试 3: 展示 DTO 不包含完整 runtime');
assert.strictEqual(displayDto.runtime, undefined, '展示 DTO 不应包含 runtime');
console.log('✅ 通过\n');

// ==================== toDetailDto 测试 ====================

console.log('=== toDetailDto 函数测试 ===\n');

// 测试 4: 包含 profile 和 runtimePreview
console.log('测试 4: 详情 DTO 包含 identity, profile 和 runtimePreview');
const detailDto = toDetailDto(mockStoredVoice);
assert.ok(detailDto.identity, '应该包含 identity');
assert.ok(detailDto.profile, '应该包含 profile');
assert.ok(detailDto.runtimePreview, '应该包含 runtimePreview');
console.log('✅ 通过\n');

// 测试 5: 时间戳在 meta 中
console.log('测试 5: 详情 DTO 包含 meta');
assert.ok(detailDto.meta, '应该包含 meta');
console.log('✅ 通过\n');

// ==================== VoiceCatalog 方法测试 ====================

console.log('=== VoiceCatalog 方法测试 ===\n');

// 需要先初始化 voiceRegistry
async function runCatalogTests() {
  console.log('初始化 VoiceRegistry...');
  await voiceRegistry.initialize();

  // 测试 6: get()
  console.log('测试 6: VoiceCatalog.get() 返回目录对象');
  const voice = VoiceCatalog.get('aliyun-qwen_http-cherry');
  if (voice) {
    assert.ok(voice.profile, '应该有 profile');
    assert.ok(voice.runtime, '应该有 runtime');
    console.log('✅ 通过\n');
  } else {
    console.log('⚠️  音色不存在，跳过测试\n');
  }

  // 测试 7: getRuntime()
  console.log('测试 7: VoiceCatalog.getRuntime() 返回运行时配置');
  const runtime = VoiceCatalog.getRuntime('aliyun-qwen_http-cherry');
  if (runtime) {
    assert.ok(runtime.voiceId, 'runtime 应该有 voiceId 字段');
    console.log('✅ 通过\n');
  } else {
    console.log('⚠️  音色不存在，跳过测试\n');
  }

  // 测试 8: getDisplay()
  console.log('测试 8: VoiceCatalog.getDisplay() 返回展示 DTO');
  const display = VoiceCatalog.getDisplay('aliyun-qwen_http-cherry');
  if (display) {
    assert.ok(!('runtime' in display), '展示 DTO 不应包含 runtime');
    console.log('✅ 通过\n');
  } else {
    console.log('⚠️  音色不存在，跳过测试\n');
  }

  // 测试 9: getDetail()
  console.log('测试 9: VoiceCatalog.getDetail() 返回详情 DTO');
  const detail = VoiceCatalog.getDetail('aliyun-qwen_http-cherry');
  if (detail) {
    assert.ok(detail.profile, '应该有 profile');
    assert.ok(detail.runtimePreview, '应该有 runtimePreview');
    console.log('✅ 通过\n');
  } else {
    console.log('⚠️  音色不存在，跳过测试\n');
  }

  // 测试 10: query()
  console.log('测试 10: VoiceCatalog.query() 过滤功能');
  const allVoices = VoiceCatalog.query({});
  assert.ok(Array.isArray(allVoices), '应该返回数组');
  assert.ok(allVoices.length > 0, '应该有音色');

  // 测试 provider 过滤
  const aliyunVoices = VoiceCatalog.query({ provider: 'aliyun' });
  assert.ok(Array.isArray(aliyunVoices), 'provider 过滤应该返回数组');

  // 测试 gender 过滤
  const femaleVoices = VoiceCatalog.query({ gender: 'female' });
  assert.ok(Array.isArray(femaleVoices), 'gender 过滤应该返回数组');
  console.log('✅ 通过\n');

  // 测试 11: getFiltersMeta()
  console.log('测试 11: VoiceCatalog.getFiltersMeta() 返回筛选元数据');
  const filters = VoiceCatalog.getFiltersMeta();
  assert.ok(Array.isArray(filters.providers), '应该有 providers 数组');
  assert.ok(Array.isArray(filters.genders), '应该有 genders 数组');
  assert.ok(Array.isArray(filters.tags), '应该有 tags 数组');
  console.log('✅ 通过\n');

  // 测试 12: getStats()
  console.log('测试 12: VoiceCatalog.getStats() 返回统计信息');
  const stats = VoiceCatalog.getStats();
  assert.ok(typeof stats.total === 'number', '应该有 total 数字');
  assert.ok(typeof stats.providers === 'object', 'providers 应该是对象');
  console.log(`  total: ${stats.total}, providers: ${Object.keys(stats.providers).length}个`);
  console.log('✅ 通过\n');

  console.log('========================================');
  console.log('✅ VoiceCatalog 所有测试通过！');
  console.log('========================================\n');

  // 清理
  if (voiceRegistry && voiceRegistry.close) {
    await voiceRegistry.close();
  }
  process.exit(0);
}

runCatalogTests().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
