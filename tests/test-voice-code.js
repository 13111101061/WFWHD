/**
 * VoiceCode 回归测试
 * 
 * 测试内容：
 * 1. VoiceCodeGenerator 生成与校验
 * 2. voiceCode 解析
 * 3. 兼容映射加载
 * 4. VoiceResolver 解析（新 voiceCode + 旧 systemId）
 * 5. SynthesisRequest voiceCode 字段
 * 
 * 运行方式：
 *   node tests/test-voice-code.js
 */

const path = require('path');

const VoiceCodeGenerator = require('../src/modules/tts/config/VoiceCodeGenerator');
const SynthesisRequest = require('../src/modules/tts/domain/SynthesisRequest');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}`);
    console.log(`   错误: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function runTests() {
  console.log('\n🧪 VoiceCode 回归测试\n');
  console.log('='.repeat(50));

  // ==================== 1. VoiceCodeGenerator 测试 ====================
  console.log('\n📦 VoiceCodeGenerator 测试\n');

  test('生成 voiceCode 格式正确', () => {
    const code = VoiceCodeGenerator.generate({
      providerKey: 'moss',
      modelKey: 'moss_tts',
      voiceNumber: 3
    });
    assert(code.length === 15, `长度应为15，实际 ${code.length}`);
    assert(/^\d{15}$/.test(code), '应为15位纯数字');
    console.log(`   生成: ${code}`);
  });

  test('Luhn 校验位正确', () => {
    const code = VoiceCodeGenerator.generate({
      providerKey: 'moss',
      modelKey: 'moss_tts',
      voiceNumber: 3
    });
    assert(VoiceCodeGenerator.isValid(code), '校验位应通过');
  });

  test('无效 voiceCode 应拒绝', () => {
    assert(!VoiceCodeGenerator.isValid('123456789012345'), '全1应拒绝');
    assert(!VoiceCodeGenerator.isValid('001000300100000'), '错误校验位应拒绝');
    assert(!VoiceCodeGenerator.isValid('abc'), '非数字应拒绝');
    assert(!VoiceCodeGenerator.isValid('123'), '长度不足应拒绝');
  });

  test('解析 voiceCode', () => {
    const code = VoiceCodeGenerator.generate({
      providerKey: 'moss',
      modelKey: 'moss_tts',
      voiceNumber: 3
    });
    const parsed = VoiceCodeGenerator.parse(code);
    assert(parsed !== null, '解析不应为null');
    assert(parsed.providerKey === 'moss', `providerKey 应为 moss，实际 ${parsed.providerKey}`);
    assert(parsed.modelKey === 'moss_tts', `modelKey 应为 moss_tts，实际 ${parsed.modelKey}`);
    assert(parsed.voiceNumber === 3, `voiceNumber 应为 3，实际 ${parsed.voiceNumber}`);
    console.log(`   解析结果: provider=${parsed.providerKey}, model=${parsed.modelKey}, #${parsed.voiceNumber}`);
  });

  test('阿里云 voiceCode 生成', () => {
    const code = VoiceCodeGenerator.generate({
      providerKey: 'aliyun',
      modelKey: 'qwen_http',
      voiceNumber: 1
    });
    const parsed = VoiceCodeGenerator.parse(code);
    assert(parsed.providerKey === 'aliyun', 'providerKey 应为 aliyun');
    assert(parsed.modelKey === 'qwen_http', 'modelKey 应为 qwen_http');
    console.log(`   生成: ${code} → ${parsed.providerDisplayName} / ${parsed.modelDisplayName}`);
  });

  // ==================== 2. 兼容映射测试 ====================
  console.log('\n📦 兼容映射测试\n');

  const compatMap = require('../src/modules/tts/config/VoiceCodeCompatMap.json');

  test('兼容映射文件可加载', () => {
    assert(compatMap.legacyToVoiceCode, '应有 legacyToVoiceCode 字段');
    assert(compatMap.voiceCodeIndex, '应有 voiceCodeIndex 字段');
    const legacyCount = Object.keys(compatMap.legacyToVoiceCode).length;
    const indexCount = Object.keys(compatMap.voiceCodeIndex).length;
    console.log(`   legacy 映射: ${legacyCount} 条, voiceCode 索引: ${indexCount} 条`);
    assert(legacyCount > 0, 'legacy 映射不应为空');
    assert(indexCount > 0, 'voiceCode 索引不应为空');
  });

  test('moss-tts-ashui 可映射到 voiceCode', () => {
    const code = compatMap.legacyToVoiceCode['moss-tts-ashui'];
    assert(code, 'moss-tts-ashui 应有 voiceCode 映射');
    assert(code.length === 15, `voiceCode 长度应为15，实际 ${code.length}`);
    console.log(`   moss-tts-ashui → ${code}`);
  });

  test('voiceCode 索引可查询', () => {
    const ashuiCode = compatMap.legacyToVoiceCode['moss-tts-ashui'];
    const voiceInfo = compatMap.voiceCodeIndex[ashuiCode];
    assert(voiceInfo, 'voiceCode 索引应可查询');
    assert(voiceInfo.id === 'moss-tts-ashui', `id 应为 moss-tts-ashui，实际 ${voiceInfo.id}`);
    console.log(`   ${ashuiCode} → ${voiceInfo.id} (${voiceInfo.displayName})`);
  });

  // ==================== 3. SynthesisRequest 测试 ====================
  console.log('\n📦 SynthesisRequest 测试\n');

  test('SynthesisRequest 支持 voiceCode', () => {
    const ashuiCode = compatMap.legacyToVoiceCode['moss-tts-ashui'];
    
    const request = SynthesisRequest.fromJSON({
      text: '测试文本',
      service: 'moss_tts',
      voiceCode: ashuiCode
    });
    
    assert(request.voiceCode === ashuiCode, `voiceCode 应为 ${ashuiCode}`);
    assert(request.text === '测试文本', 'text 应正确');
    assert(request.service === 'moss_tts', 'service 应正确');
    console.log(`   voiceCode: ${request.voiceCode}`);
  });

  test('SynthesisRequest 验证 voiceCode 格式', () => {
    const request = SynthesisRequest.fromJSON({
      text: '测试文本',
      service: 'moss_tts',
      voiceCode: '123456789012345'
    });
    
    const validation = request.validate();
    assert(!validation.valid, '无效 voiceCode 应验证失败');
    assert(validation.errors.some(e => e.includes('voiceCode')), '应包含 voiceCode 错误');
    console.log(`   验证失败: ${validation.errors.join('; ')}`);
  });

  test('SynthesisRequest 兼容旧 systemId', () => {
    const request = SynthesisRequest.fromJSON({
      text: '测试文本',
      service: 'moss_tts',
      systemId: 'moss-tts-ashui'
    });
    
    assert(request.systemId === 'moss-tts-ashui', 'systemId 应正确');
    assert(!request.voiceCode, 'voiceCode 应为空');
    console.log(`   systemId: ${request.systemId}`);
  });

  // ==================== 4. VoiceResolver 测试 ====================
  console.log('\n📦 VoiceResolver 测试\n');

  // 初始化 VoiceRegistry
  const { voiceRegistry } = require('../src/modules/tts/core/VoiceRegistry');
  await voiceRegistry.initialize();
  console.log(`   VoiceRegistry 已加载: ${voiceRegistry.getStats().total} 个音色\n`);

  const { VoiceResolver } = require('../src/modules/tts/application/VoiceResolver');

  test('VoiceResolver 解析 voiceCode（新标准）', () => {
    const ashuiCode = compatMap.legacyToVoiceCode['moss-tts-ashui'];
    
    const resolved = VoiceResolver.resolve({
      text: '测试文本',
      service: 'moss',
      voiceCode: ashuiCode
    });
    
    assert(resolved.providerKey === 'moss', `providerKey 应为 moss，实际 ${resolved.providerKey}`);
    assert(resolved.serviceKey === 'tts', `serviceKey 应为 tts，实际 ${resolved.serviceKey}`);
    assert(resolved.voiceCode === ashuiCode, 'voiceCode 应正确');
    assert(resolved.systemId === 'moss-tts-ashui', `systemId 应为 moss-tts-ashui，实际 ${resolved.systemId}`);
    assert(resolved.voiceId, 'voiceId (provider_voice_id) 应存在');
    console.log(`   voiceCode ${ashuiCode} → provider=${resolved.providerKey}, voiceId=${resolved.voiceId}`);
  });

  test('VoiceResolver 解析 systemId（兼容）', () => {
    const resolved = VoiceResolver.resolve({
      text: '测试文本',
      service: 'moss',
      voice: 'moss-tts-ashui'
    });
    
    assert(resolved.systemId === 'moss-tts-ashui', 'systemId 应正确');
    assert(resolved.voiceId, 'voiceId (provider_voice_id) 应存在');
    assert(resolved.voiceCode, 'voiceCode 应自动填充');
    console.log(`   systemId moss-tts-ashui → voiceId=${resolved.voiceId}, voiceCode=${resolved.voiceCode}`);
  });

  test('VoiceResolver 阿里云音色解析', () => {
    const cherryCode = compatMap.legacyToVoiceCode['aliyun-qwen_http-cherry'];
    
    const resolved = VoiceResolver.resolve({
      text: '测试文本',
      service: 'aliyun_qwen',
      voiceCode: cherryCode
    });
    
    assert(resolved.providerKey === 'aliyun', 'providerKey 应为 aliyun');
    assert(resolved.serviceKey === 'qwen_http', 'serviceKey 应为 qwen_http');
    assert(resolved.voiceId === 'Cherry', `voiceId 应为 Cherry，实际 ${resolved.voiceId}`);
    console.log(`   voiceCode ${cherryCode} → provider=${resolved.providerKey}, voiceId=${resolved.voiceId}`);
  });

  // ==================== 结果 ====================
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 测试结果: ${passed} 通过, ${failed} 失败\n`);

  if (failed > 0) {
    console.log('❌ 部分测试失败，请检查');
    process.exit(1);
  } else {
    console.log('✅ 所有测试通过！\n');
  }
}

runTests().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
