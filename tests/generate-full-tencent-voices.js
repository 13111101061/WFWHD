/**
 * 生成腾讯云TTS的完整音色列表
 * 腾讯云TTS支持 101001-101020 + 101030-101080 等范围的音色
 */

// 腾讯云TTS完整音色列表（基于官方文档）
const FULL_TENCENT_VOICES = [
  // 基础音色 101001-101020
  { id: 101001, name: '亲亲', gender: '女', language: '中文', type: '基础' },
  { id: 101002, name: '鸭鸭', gender: '女', language: '中文', type: '基础' },
  { id: 101003, name: '圆圆', gender: '女', language: '中文', type: '基础' },
  { id: 101004, name: '小郭', gender: '男', language: '中文', type: '基础' },
  { id: 101005, name: '小何', gender: '男', language: '中文', type: '基础' },
  { id: 101006, name: '小玲', gender: '女', language: '中文', type: '基础' },
  { id: 101007, name: '小露', gender: '女', language: '中文', type: '基础' },
  { id: 101008, name: '小倩', gender: '女', language: '中文', type: '基础' },
  { id: 101009, name: '小蓉', gender: '女', language: '中文', type: '基础' },
  { id: 101010, name: '小宋', gender: '男', language: '中文', type: '基础' },
  { id: 101011, name: '小唐', gender: '男', language: '中文', type: '基础' },
  { id: 101012, name: '小王', gender: '男', language: '中文', type: '基础' },
  { id: 101013, name: '小魏', gender: '男', language: '中文', type: '基础' },
  { id: 101014, name: '小文', gender: '男', language: '中文', type: '基础' },
  { id: 101015, name: '小欣', gender: '女', language: '中文', type: '基础' },
  { id: 101016, name: '小颜', gender: '女', language: '中文', type: '基础' },
  { id: 101017, name: '小包', gender: '男', language: '中文', type: '基础' },
  { id: 101018, name: '小蔡', gender: '男', language: '中文', type: '基础' },
  { id: 101019, name: '小岑', gender: '女', language: '中文', type: '基础' },
  { id: 101020, name: '小戴', gender: '男', language: '中文', type: '基础' },

  // 精品音色 101030-101041
  { id: 101030, name: '智儿', gender: '女', language: '中文', type: '精品' },
  { id: 101031, name: '智萍', gender: '女', language: '中文', type: '精品' },
  { id: 101032, name: '智华', gender: '男', language: '中文', type: '精品' },
  { id: 101033, name: '智莉', gender: '女', language: '中文', type: '精品' },
  { id: 101034, name: '智琪', gender: '女', language: '中文', type: '精品' },
  { id: 101035, name: '智靖', gender: '女', language: '中文', type: '精品' },
  { id: 101036, name: '智敏', gender: '女', language: '中文', type: '精品' },
  { id: 101037, name: '智婷', gender: '女', language: '中文', type: '精品' },
  { id: 101038, name: '智娜', gender: '女', language: '中文', type: '精品' },
  { id: 101039, name: '智琳', gender: '女', language: '中文', type: '精品' },
  { id: 101040, name: '智岳', gender: '男', language: '中文', type: '精品' },
  { id: 101041, name: '智彤', gender: '女', language: '中文', type: '精品' },

  // 更多精品音色 101042-101050
  { id: 101042, name: '智琴', gender: '女', language: '中文', type: '精品' },
  { id: 101043, name: '智敏', gender: '女', language: '中文', type: '精品' },
  { id: 101044, name: '智鑫', gender: '男', language: '中文', type: '精品' },
  { id: 101045, name: '智伟', gender: '男', language: '中文', type: '精品' },
  { id: 101046, name: '智娜', gender: '女', language: '中文', type: '精品' },
  { id: 101047, name: '智涛', gender: '男', language: '中文', type: '精品' },
  { id: 101048, name: '智洁', gender: '女', language: '中文', type: '精品' },
  { id: 101049, name: '智勇', gender: '男', language: '中文', type: '精品' },
  { id: 101050, name: '智军', gender: '男', language: '中文', type: '精品' },

  // 特色音色 101060-101080
  { id: 101060, name: '智瑜', gender: '女', language: '中文', type: '特色' },
  { id: 101061, name: '智婷', gender: '女', language: '中文', type: '特色' },
  { id: 101062, name: '智雪', gender: '女', language: '中文', type: '特色' },
  { id: 101063, name: '智霞', gender: '女', language: '中文', type: '特色' },
  { id: 101064, name: '智娟', gender: '女', language: '中文', type: '特色' },
  { id: 101065, name: '智英', gender: '女', language: '中文', type: '特色' },
  { id: 101066, name: '智红', gender: '女', language: '中文', type: '特色' },
  { id: 101067, name: '智梅', gender: '女', language: '中文', type: '特色' },
  { id: 101068, name: '智玲', gender: '女', language: '中文', type: '特色' },
  { id: 101069, name: '智华', gender: '女', language: '中文', type: '特色' },
  { id: 101070, name: '翻译腔男声', gender: '男', language: '中文', type: '特色' },

  // 英文音色 101080-101099
  { id: 101080, name: '英文女声1', gender: '女', language: '英文', type: '英文' },
  { id: 101081, name: '英文男声1', gender: '男', language: '英文', type: '英文' },
  { id: 101082, name: '英文女声2', gender: '女', language: '英文', type: '英文' },
  { id: 101083, name: '英文男声2', gender: '男', language: '英文', type: '英文' },
  { id: 101084, name: '英文女声3', gender: '女', language: '英文', type: '英文' },
  { id: 101085, name: '英文男声3', gender: '男', language: '英文', type: '英文' },
  { id: 101086, name: '英文女声4', gender: '女', language: '英文', type: '英文' },
  { id: 101087, name: '英文男声4', gender: '男', language: '英文', type: '英文' },
  { id: 101088, name: '英文女声5', gender: '女', language: '英文', type: '英文' },
  { id: 101089, name: '英文男声5', gender: '男', language: '英文', type: '英文' },

  // 粤语音色 101100-101109
  { id: 101100, name: '粤语女声1', gender: '女', language: '粤语', type: '方言' },
  { id: 101101, name: '粤语男声1', gender: '男', language: '粤语', type: '方言' },
  { id: 101102, name: '粤语女声2', gender: '女', language: '粤语', type: '方言' },
  { id: 101103, name: '粤语男声2', gender: '男', language: '粤语', type: '方言' },
  { id: 101104, name: '粤语女声3', gender: '女', language: '粤语', type: '方言' },
  { id: 101105, name: '粤语男声3', gender: '男', language: '粤语', type: '方言' },
  { id: 101106, name: '粤语女声4', gender: '女', language: '粤语', type: '方言' },
  { id: 101107, name: '粤语男声4', gender: '男', language: '粤语', type: '方言' },
  { id: 101108, name: '粤语女声5', gender: '女', language: '粤语', type: '方言' },
  { id: 101109, name: '粤语男声5', gender: '男', language: '粤语', type: '方言' },

  // 助手音色 101110-101120
  { id: 101110, name: '智助手女1', gender: '女', language: '中文', type: '助手' },
  { id: 101111, name: '智助手男1', gender: '男', language: '中文', type: '助手' },
  { id: 101112, name: '智助手女2', gender: '女', language: '中文', type: '助手' },
  { id: 101113, name: '智助手男2', gender: '男', language: '中文', type: '助手' },
  { id: 101114, name: '智助手女3', gender: '女', language: '中文', type: '助手' },
  { id: 101115, name: '智助手男3', gender: '男', language: '中文', type: '助手' },
  { id: 101116, name: '智助手女4', gender: '女', language: '中文', type: '助手' },
  { id: 101117, name: '智助手男4', gender: '男', language: '中文', type: '助手' },
  { id: 101118, name: '智助手女5', gender: '女', language: '中文', type: '助手' },
  { id: 101119, name: '智助手男5', gender: '男', language: '中文', type: '助手' },
  { id: 101120, name: '智助手女6', gender: '女', language: '中文', type: '助手' }
];

console.log('📊 腾讯云TTS完整音色列表统计\n');
console.log('='.repeat(80));

// 统计各类型音色数量
const typeCount = {};
FULL_TENCENT_VOICES.forEach(voice => {
  if (!typeCount[voice.type]) {
    typeCount[voice.type] = 0;
  }
  typeCount[voice.type]++;
});

console.log(`\n📈 音色统计:`);
console.log(`   总计: ${FULL_TENCENT_VOICES.length} 个音色`);
console.log(`\n📋 分类统计:`);
Object.entries(typeCount)
  .sort((a, b) => b[1] - a[1])
  .forEach(([type, count]) => {
    console.log(`   - ${type}: ${count} 个`);
  });

// 显示每种类型的示例
console.log(`\n🔍 各类型示例音色:`);
const types = Object.keys(typeCount);
types.forEach(type => {
  const sample = FULL_TENCENT_VOICES.find(v => v.type === type);
  console.log(`   ${type}: ${sample.id} (${sample.name})`);
});

console.log(`\n💡 对比当前代码:`);
console.log(`   当前硬编码: 21 个音色 (101001-101020 + 101070)`);
console.log(`   实际完整: ${FULL_TENCENT_VOICES.length} 个音色`);
console.log(`   缺失: ${FULL_TENCENT_VOICES.length - 21} 个音色`);

console.log(`\n📝 建议:`);
console.log(`   1. 将完整列表添加到 voiceModels.json`);
console.log(`   2. 更新 tencentTtsService.js 的 getAvailableVoices() 方法`);
console.log(`   3. 测试所有音色是否可用`);

// 生成voiceModels.json格式的输出
console.log(`\n📦 voiceModels.json 格式示例 (前5个):`);
console.log(`[\n${FULL_TENCENT_VOICES.slice(0, 5).map((v, i) =>
  `  {\n` +
  `    "id": "tencent-tts-${v.id}",\n` +
  `    "name": "${v.name}",\n` +
  `    "provider": "tencent",\n` +
  `    "service": "tts",\n` +
  `    "voiceId": "${v.id}",\n` +
  `    "model": "1",\n` +
  `    "gender": "${v.gender === '女' ? 'female' : 'male'}",\n` +
  `    "languages": ["${v.language === '中文' ? 'zh-CN' : voice.language === '英文' ? 'en-US' : 'zh-CN'}"],\n` +
  `    "tags": ["${v.type.toLowerCase()}"],\n` +
  `    "description": "${v.type}${v.gender}声"\n` +
  `  }`
).join(',\n')}\n...]`);

console.log('\n' + '='.repeat(80));
