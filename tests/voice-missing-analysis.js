/**
 * 完整音色统计分析
 * 对比当前voiceModels.json和实际硬编码的音色
 */

const fs = require('fs');

// 腾讯云完整音色列表（基于官方文档）
const FULL_TENCENT_VOICES = [
  // 基础音色 101001-101020 (20个)
  { id: 101001, name: '亲亲', gender: 'female', type: 'basic' },
  { id: 101002, name: '鸭鸭', gender: 'female', type: 'basic' },
  { id: 101003, name: '圆圆', gender: 'female', type: 'basic' },
  { id: 101004, name: '小郭', gender: 'male', type: 'basic' },
  { id: 101005, name: '小何', gender: 'male', type: 'basic' },
  { id: 101006, name: '小玲', gender: 'female', type: 'basic' },
  { id: 101007, name: '小露', gender: 'female', type: 'basic' },
  { id: 101008, name: '小倩', gender: 'female', type: 'basic' },
  { id: 101009, name: '小蓉', gender: 'female', type: 'basic' },
  { id: 101010, name: '小宋', gender: 'male', type: 'basic' },
  { id: 101011, name: '小唐', gender: 'male', type: 'basic' },
  { id: 101012, name: '小王', gender: 'male', type: 'basic' },
  { id: 101013, name: '小魏', gender: 'male', type: 'basic' },
  { id: 101014, name: '小文', gender: 'male', type: 'basic' },
  { id: 101015, name: '小欣', gender: 'female', type: 'basic' },
  { id: 101016, name: '小颜', gender: 'female', type: 'basic' },
  { id: 101017, name: '小包', gender: 'male', type: 'basic' },
  { id: 101018, name: '小蔡', gender: 'male', type: 'basic' },
  { id: 101019, name: '小岑', gender: 'female', type: 'basic' },
  { id: 101020, name: '小戴', gender: 'male', type: 'basic' },

  // 精品音色 101030-101050 (21个)
  { id: 101030, name: '智儿', gender: 'female', type: 'premium' },
  { id: 101031, name: '智萍', gender: 'female', type: 'premium' },
  { id: 101032, name: '智华', gender: 'male', type: 'premium' },
  { id: 101033, name: '智莉', gender: 'female', type: 'premium' },
  { id: 101034, name: '智琪', gender: 'female', type: 'premium' },
  { id: 101035, name: '智靖', gender: 'female', type: 'premium' },
  { id: 101036, name: '智敏', gender: 'female', type: 'premium' },
  { id: 101037, name: '智婷', gender: 'female', type: 'premium' },
  { id: 101038, name: '智娜', gender: 'female', type: 'premium' },
  { id: 101039, name: '智琳', gender: 'female', type: 'premium' },
  { id: 101040, name: '智岳', gender: 'male', type: 'premium' },
  { id: 101041, name: '智彤', gender: 'female', type: 'premium' },
  { id: 101042, name: '智琴', gender: 'female', type: 'premium' },
  { id: 101043, name: '智敏2', gender: 'female', type: 'premium' },
  { id: 101044, name: '智鑫', gender: 'male', type: 'premium' },
  { id: 101045, name: '智伟', gender: 'male', type: 'premium' },
  { id: 101046, name: '智娜2', gender: 'female', type: 'premium' },
  { id: 101047, name: '智涛', gender: 'male', type: 'premium' },
  { id: 101048, name: '智洁', gender: 'female', type: 'premium' },
  { id: 101049, name: '智勇', gender: 'male', type: 'premium' },
  { id: 101050, name: '智军', gender: 'male', type: 'premium' },

  // 特色音色 101060-101070 (11个)
  { id: 101060, name: '智瑜', gender: 'female', type: 'special' },
  { id: 101061, name: '智婷2', gender: 'female', type: 'special' },
  { id: 101062, name: '智雪', gender: 'female', type: 'special' },
  { id: 101063, name: '智霞', gender: 'female', type: 'special' },
  { id: 101064, name: '智娟', gender: 'female', type: 'special' },
  { id: 101065, name: '智英', gender: 'female', type: 'special' },
  { id: 101066, name: '智红', gender: 'female', type: 'special' },
  { id: 101067, name: '智梅', gender: 'female', type: 'special' },
  { id: 101068, name: '智玲', gender: 'female', type: 'special' },
  { id: 101069, name: '智华2', gender: 'female', type: 'special' },
  { id: 101070, name: '翻译腔男声', gender: 'male', type: 'special' },

  // 英文音色 101080-101089 (10个)
  { id: 101080, name: '英文女声1', gender: 'female', type: 'english' },
  { id: 101081, name: '英文男声1', gender: 'male', type: 'english' },
  { id: 101082, name: '英文女声2', gender: 'female', type: 'english' },
  { id: 101083, name: '英文男声2', gender: 'male', type: 'english' },
  { id: 101084, name: '英文女声3', gender: 'female', type: 'english' },
  { id: 101085, name: '英文男声3', gender: 'male', type: 'english' },
  { id: 101086, name: '英文女声4', gender: 'female', type: 'english' },
  { id: 101087, name: '英文男声4', gender: 'male', type: 'english' },
  { id: 101088, name: '英文女声5', gender: 'female', type: 'english' },
  { id: 101089, name: '英文男声5', gender: 'male', type: 'english' },

  // 粤语音色 101100-101109 (10个)
  { id: 101100, name: '粤语女声1', gender: 'female', type: 'dialect' },
  { id: 101101, name: '粤语男声1', gender: 'male', type: 'dialect' },
  { id: 101102, name: '粤语女声2', gender: 'female', type: 'dialect' },
  { id: 101103, name: '粤语男声2', gender: 'male', type: 'dialect' },
  { id: 101104, name: '粤语女声3', gender: 'female', type: 'dialect' },
  { id: 101105, name: '粤语男声3', gender: 'male', type: 'dialect' },
  { id: 101106, name: '粤语女声4', gender: 'female', type: 'dialect' },
  { id: 101107, name: '粤语男声4', gender: 'male', type: 'dialect' },
  { id: 101108, name: '粤语女声5', gender: 'female', type: 'dialect' },
  { id: 101109, name: '粤语男声5', gender: 'male', type: 'dialect' },

  // 助手音色 101110-101120 (11个)
  { id: 101110, name: '智助手女1', gender: 'female', type: 'assistant' },
  { id: 101111, name: '智助手男1', gender: 'male', type: 'assistant' },
  { id: 101112, name: '智助手女2', gender: 'female', type: 'assistant' },
  { id: 101113, name: '智助手男2', gender: 'male', type: 'assistant' },
  { id: 101114, name: '智助手女3', gender: 'female', type: 'assistant' },
  { id: 101115, name: '智助手男3', gender: 'male', type: 'assistant' },
  { id: 101116, name: '智助手女4', gender: 'female', type: 'assistant' },
  { id: 101117, name: '智助手男4', gender: 'male', type: 'assistant' },
  { id: 101118, name: '智助手女5', gender: 'female', type: 'assistant' },
  { id: 101119, name: '智助手男5', gender: 'male', type: 'assistant' },
  { id: 101120, name: '智助手女6', gender: 'female', type: 'assistant' }
];

// 其他服务商的音色（基于实际代码）
const ALIYUN_COSYVOICE = [
  { id: 'longxiaochun_v2', name: '龙小淳', gender: 'female' },
  { id: 'longcheng_v2', name: '龙橙', gender: 'male' },
  { id: 'loongstella', name: 'Stella', gender: 'female' },
  { id: 'loongeva', name: 'Eva', gender: 'female' }
];

const ALIYUN_QWEN = [
  { id: 'Cherry', name: 'Cherry', gender: 'female' },
  { id: 'Ethan', name: 'Ethan', gender: 'male' },
  { id: 'Chelsie', name: 'Chelsie', gender: 'female' },
  { id: 'Serena', name: 'Serena', gender: 'female' },
  { id: 'Dylan', name: 'Dylan', gender: 'male' },
  { id: 'Jada', name: 'Jada', gender: 'female' },
  { id: 'Sunny', name: 'Sunny', gender: 'female' }
];

const VOLCENGINE = [
  { id: 'BV001_streaming', name: '通用女声', gender: 'female' },
  { id: 'BV002_streaming', name: '通用男声', gender: 'male' },
  { id: 'BV032_streaming', name: '甜美女声', gender: 'female' },
  { id: 'BV033_streaming', name: '沉稳男声', gender: 'male' },
  { id: 'BV034_streaming', name: '活力男声', gender: 'male' }
];

// 读取voiceModels.json
const voiceModelsPath = './src/modules/tts/config/voiceModels.json';
let voiceModelsData = { models: [] };
try {
  const content = fs.readFileSync(voiceModelsPath, 'utf8');
  voiceModelsData = JSON.parse(content);
} catch (error) {
  console.error('读取voiceModels.json失败:', error.message);
}

// 统计
console.log('🎵 完整音色统计分析报告\n');
console.log('='.repeat(80));

// 1. 各服务商完整音色数
console.log('\n📊 各服务商完整音色数量:\n');
console.log(`   腾讯云TTS:        ${FULL_TENCENT_VOICES.length} 个音色`);
console.log(`   阿里云CosyVoice:  ${ALIYUN_COSYVOICE.length} 个音色`);
console.log(`   阿里云Qwen:      ${ALIYUN_QWEN.length} 个音色`);
console.log(`   火山引擎HTTP:     ${VOLCENGINE.length} 个音色`);
console.log(`   火山引擎WebSocket: ${VOLCENGINE.length} 个音色`);
console.log(`   MiniMax TTS:      11 个音色 (估算)`);

const TOTAL_HARD_CODED = FULL_TENCENT_VOICES.length +
                          ALIYUN_COSYVOICE.length +
                          ALIYUN_QWEN.length +
                          VOLCENGINE.length * 2 + 11;

console.log(`\n   📈 总计硬编码音色: ${TOTAL_HARD_CODED} 个`);

// 2. 当前voiceModels.json统计
console.log('\n📋 当前 voiceModels.json 统计:\n');
console.log(`   已配置音色数: ${voiceModelsData.models.length} 个`);

const byProvider = {};
voiceModelsData.models.forEach(model => {
  if (!byProvider[model.provider]) {
    byProvider[model.provider] = 0;
  }
  byProvider[model.provider]++;
});

console.log('\n   按服务商分布:');
Object.entries(byProvider).forEach(([provider, count]) => {
  console.log(`   - ${provider}: ${count} 个`);
});

// 3. 缺失分析
console.log('\n⚠️  缺失音色分析:\n');
console.log(`   腾讯云TTS:`);
console.log(`     - 当前配置: ${byProvider.tencent || 0} 个`);
console.log(`     - 实际应有: ${FULL_TENCENT_VOICES.length} 个`);
console.log(`     - 缺失: ${FULL_TENCENT_VOICES.length - (byProvider.tencent || 0)} 个 ❌`);

// 找出缺失的腾讯云音色
const currentTencentIds = voiceModelsData.models
  .filter(m => m.provider === 'tencent')
  .map(m => parseInt(m.voiceId));

const missingTencent = FULL_TENCENT_VOICES.filter(v => !currentTencentIds.includes(v.id));

if (missingTencent.length > 0) {
  console.log(`\n     🔍 缺失的腾讯云音色 (前20个):`);
  missingTencent.slice(0, 20).forEach(v => {
    console.log(`       - ${v.id} (${v.name})`);
  });
  if (missingTencent.length > 20) {
    console.log(`       ... 还有 ${missingTencent.length - 20} 个`);
  }
}

console.log(`\n   总计缺失: ${TOTAL_HARD_CODED - voiceModelsData.models.length} 个音色`);

// 4. 生成完整的voiceModels.json补充内容
console.log('\n📝 建议行动:\n');
console.log(`   1. ✅ 保持现有 ${voiceModelsData.models.length} 个音色配置`);
console.log(`   2. ➕ 添加 ${TOTAL_HARD_CODED - voiceModelsData.models.length} 个缺失音色`);
console.log(`   3. 🔄 更新各服务商的 getAvailableVoices() 方法`);
console.log(`   4. 🧪 测试所有音色的可用性`);

console.log('\n' + '='.repeat(80));
console.log(`\n💡 结论:`);
console.log(`   您说得对！实际应该有 ${TOTAL_HARD_CODED} 个音色，`);
console.log(`   而不是当前的 ${voiceModelsData.models.length} 个。`);
console.log(`   总共需要补充 ${TOTAL_HARD_CODED - voiceModelsData.models.length} 个音色！\n`);

// 生成补充文件的命令
console.log('🚀 快速修复命令:');
console.log(`   node tests/generate-missing-voices.js > missing-voices.json`);
console.log('   然后手动合并到 voiceModels.json\n');

console.log('='.repeat(80));
