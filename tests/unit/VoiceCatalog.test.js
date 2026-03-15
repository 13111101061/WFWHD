/**
 * VoiceCatalog 单元测试
 *
 * 运行方式: node tests/unit/VoiceCatalog.test.js
 */

const assert = require('assert');
const path = require('path');

// 测试前准备
const { VoiceCatalog, toCatalogVoice, toDisplayDto, toDetailDto } = require('../../src/modules/tts/catalog/VoiceCatalog');
const { voiceRegistry } = require('../../src/modules/tts/core/VoiceRegistry');

// ==================== 测试数据 ====================

const mockRawVoice = {
  id: 'test-voice-001',
  provider: 'aliyun',
  service: 'qwen_http',
  displayName: '测试音色',
  name: 'TestVoice',
  sourceId: 'test-source-id',
  gender: 'female',
  languages: ['zh-CN', 'en-US'],
  description: '这是一个测试音色',
  tags: ['温柔', '自然'],
  category: 'standard',
  preview: 'https://example.com/preview.mp3',
  status: 'active',
  // runtime 层
  runtime: {
    voice: 'TestVoice',
    model: 'test-model',
    sampleRate: 24000
  },
  // 兼容旧的 ttsConfig
  ttsConfig: {
    voiceId: 'old-voice-id',
    model: 'old-model'
  },
  metadata: {
    registeredAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z'
  }
};

// ==================== toCatalogVoice 测试 ====================

console.log('\n=== toCatalogVoice 函数测试 ===\n');

// 测试 1: 正常转换
console.log('测试 1: 正常转换原始音色为目录对象');
const catalogVoice = toCatalogVoice(mockRawVoice);
assert.strictEqual(catalogVoice.profile.id, 'test-voice-001', 'profile.id 应该正确');
assert.strictEqual(catalogVoice.profile.provider, 'aliyun', 'profile.provider 应该正确');
assert.strictEqual(catalogVoice.profile.displayName, '测试音色', 'profile.displayName 应该正确');
assert.deepStrictEqual(catalogVoice.profile.tags, ['温柔', '自然'], 'profile.tags 应该正确');
console.log('✅ 通过\n');

// 测试 2: runtime 优先于 ttsConfig
console.log('测试 2: runtime 优先于 ttsConfig');
assert.strictEqual(catalogVoice.runtime.voice, 'TestVoice', 'runtime.voice 应该来自 runtime 字段');
assert.strictEqual(catalogVoice.runtime.model, 'test-model', 'runtime.model 应该来自 runtime 字段');
console.log('✅ 通过\n');

// 测试 3: 兼容 ttsConfig
console.log('测试 3: 无 runtime 时回退到 ttsConfig');
const voiceWithOnlyTtsConfig = {
  id: 'test-002',
  provider: 'tencent',
  ttsConfig: {
    voiceId: 'fallback-voice',
    model: 'fallback-model'
  }
};
const catalogVoice2 = toCatalogVoice(voiceWithOnlyTtsConfig);
assert.strictEqual(catalogVoice2.runtime.voice, 'fallback-voice', 'runtime.voice 应该回退到 ttsConfig.voiceId');
console.log('✅ 通过\n');

// 测试 4: 空输入
console.log('测试 4: 空输入返回 null');
assert.strictEqual(toCatalogVoice(null), null, 'null 输入应返回 null');
assert.strictEqual(toCatalogVoice(undefined), null, 'undefined 输入应返回 null');
console.log('✅ 通过\n');

// ==================== toDisplayDto 测试 ====================

console.log('=== toDisplayDto 函数测试 ===\n');

// 测试 5: 不包含 runtime
console.log('测试 5: 展示 DTO 不应包含 runtime 字段');
const displayDto = toDisplayDto(catalogVoice);
assert.strictEqual(displayDto.id, 'test-voice-001', 'id 应该正确');
assert.strictEqual(displayDto.runtime, undefined, '展示 DTO 不应包含 runtime');
assert.strictEqual(displayDto._raw, undefined, '展示 DTO 不应包含 _raw');
assert.ok(!('runtime' in displayDto), 'runtime 不应该在 DTO 中');
console.log('✅ 通过\n');

// 测试 6: 包含所有展示字段
console.log('测试 6: 展示 DTO 包含所有必要字段');
const expectedFields = ['id', 'provider', 'service', 'displayName', 'name', 'gender', 'languages', 'description', 'tags', 'preview', 'status'];
expectedFields.forEach(field => {
  assert.ok(field in displayDto, `字段 ${field} 应该存在`);
});
console.log('✅ 通过\n');

// ==================== toDetailDto 测试 ====================

console.log('=== toDetailDto 函数测试 ===\n');

// 测试 7: 包含 profile 和 runtime
console.log('测试 7: 详情 DTO 包含 profile 和 runtime');
const detailDto = toDetailDto(catalogVoice);
assert.ok('profile' in detailDto, '应该包含 profile');
assert.ok('runtime' in detailDto, '应该包含 runtime');
assert.ok('metadata' in detailDto, '应该包含 metadata');
console.log('✅ 通过\n');

// 测试 8: 时间戳字段
console.log('测试 8: 详情 DTO 包含时间戳');
assert.strictEqual(detailDto.createdAt, '2024-01-01T00:00:00Z', 'createdAt 应该正确');
assert.strictEqual(detailDto.updatedAt, '2024-06-01T00:00:00Z', 'updatedAt 应该正确');
console.log('✅ 通过\n');

// ==================== VoiceCatalog 方法测试 ====================

console.log('=== VoiceCatalog 方法测试 ===\n');

// 需要先初始化 voiceRegistry
async function runCatalogTests() {
  console.log('初始化 VoiceRegistry...');
  await voiceRegistry.initialize();

  // 测试 9: get()
  console.log('测试 9: VoiceCatalog.get() 返回目录对象');
  const voice = VoiceCatalog.get('aliyun-qwen_http-cherry');
  if (voice) {
    assert.ok(voice.profile, '应该有 profile');
    assert.ok(voice.runtime, '应该有 runtime');
    console.log('✅ 通过\n');
  } else {
    console.log('⚠️  音色不存在，跳过测试\n');
  }

  // 测试 10: getRuntime()
  console.log('测试 10: VoiceCatalog.getRuntime() 返回运行时配置');
  const runtime = VoiceCatalog.getRuntime('aliyun-qwen_http-cherry');
  if (runtime) {
    assert.ok(runtime.voice, 'runtime 应该有 voice 字段');
    console.log('✅ 通过\n');
  } else {
    console.log('⚠️  音色不存在，跳过测试\n');
  }

  // 测试 11: getDisplay()
  console.log('测试 11: VoiceCatalog.getDisplay() 返回展示 DTO');
  const display = VoiceCatalog.getDisplay('aliyun-qwen_http-cherry');
  if (display) {
    assert.ok(!('runtime' in display), '展示 DTO 不应包含 runtime');
    console.log('✅ 通过\n');
  } else {
    console.log('⚠️  音色不存在，跳过测试\n');
  }

  // 测试 12: getDetail()
  console.log('测试 12: VoiceCatalog.getDetail() 返回详情 DTO');
  const detail = VoiceCatalog.getDetail('aliyun-qwen_http-cherry');
  if (detail) {
    assert.ok(detail.profile, '应该有 profile');
    assert.ok(detail.runtime, '应该有 runtime');
    console.log('✅ 通过\n');
  } else {
    console.log('⚠️  音色不存在，跳过测试\n');
  }

  // 测试 13: query()
  console.log('测试 13: VoiceCatalog.query() 过滤功能');
  const allVoices = VoiceCatalog.query({});
  assert.ok(Array.isArray(allVoices), '应该返回数组');
  assert.ok(allVoices.length > 0, '应该有音色');

  // 测试 provider 过滤
  const aliyunVoices = VoiceCatalog.query({ provider: 'aliyun' });
  assert.ok(Array.isArray(aliyunVoices), 'provider 过滤应该返回数组');

  // 测试 gender 过滤
  const femaleVoices = VoiceCatalog.query({ gender: 'female' });
  assert.ok(Array.isArray(femaleVoices), 'gender 过滤应该返回数组');
  femaleVoices.forEach(v => {
    assert.strictEqual(v.gender, 'female', '所有结果应该是女性音色');
  });
  console.log('✅ 通过\n');

  // 测试 14: getFiltersMeta()
  console.log('测试 14: VoiceCatalog.getFiltersMeta() 返回筛选元数据');
  const filters = VoiceCatalog.getFiltersMeta();
  assert.ok(Array.isArray(filters.providers), '应该有 providers 数组');
  assert.ok(Array.isArray(filters.genders), '应该有 genders 数组');
  assert.ok(Array.isArray(filters.tags), '应该有 tags 数组');
  console.log('✅ 通过\n');

  // 测试 15: getStats()
  console.log('测试 15: VoiceCatalog.getStats() 返回统计信息');
  const stats = VoiceCatalog.getStats();
  assert.ok(typeof stats.total === 'number', '应该有 total 数字');
  assert.ok(typeof stats.providers === 'object', 'providers 应该是对象');
  console.log(`  total: ${stats.total}, providers: ${Object.keys(stats.providers).length}个`);
  console.log('✅ 通过\n');

  console.log('========================================');
  console.log('✅ VoiceCatalog 所有测试通过！');
  console.log('========================================\n');
}

runCatalogTests().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});