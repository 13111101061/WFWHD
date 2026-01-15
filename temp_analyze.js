const fs = require('fs');
const data = JSON.parse(fs.readFileSync('src/modules/tts/config/voiceIdMapping.json', 'utf8'));

// 分类统计
const stats = {
  total: data.voices.length,
  byProvider: {},
  byGender: { male: 0, female: 0 },
  byService: {},
  allTags: {},
  tagCombinations: {}
};

data.voices.forEach(voice => {
  // 按服务商统计
  if (!stats.byProvider[voice.provider]) stats.byProvider[voice.provider] = 0;
  stats.byProvider[voice.provider]++;

  // 按服务类型统计
  if (!stats.byService[voice.service]) stats.byService[voice.service] = 0;
  stats.byService[voice.service]++;

  // 按性别统计
  stats.byGender[voice.gender]++;

  // 统计所有标签
  if (voice.tags) {
    voice.tags.forEach(tag => {
      if (!stats.allTags[tag]) stats.allTags[tag] = 0;
      stats.allTags[tag]++;
    });

    // 标签组合
    const combo = voice.tags.sort().join(' + ');
    if (!stats.tagCombinations[combo]) stats.tagCombinations[combo] = [];
    stats.tagCombinations[combo].push(voice.name);
  }
});

console.log('=== 总体统计 ===');
console.log('总音色数:', stats.total);
console.log('\n按服务商:');
Object.entries(stats.byProvider).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
console.log('\n按服务类型:');
Object.entries(stats.byService).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
console.log('\n按性别:');
Object.entries(stats.byGender).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

console.log('\n=== 所有标签 (出现次数) ===');
Object.entries(stats.allTags)
  .sort((a, b) => b[1] - a[1])
  .forEach(([tag, count]) => console.log(`  ${tag}:${count}`));

console.log('\n=== 标签组合统计 ===');
Object.entries(stats.tagCombinations)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 30)
  .forEach(([combo, voices]) => console.log(`  [${voices.length}个] ${combo}`));

console.log('\n=== Qwen音色详细列表 ===');
const qwenVoices = data.voices.filter(v => v.provider === 'aliyun' && v.service === 'qwen_http');
qwenVoices.forEach((voice, index) => {
  console.log(`${index + 1}. ${voice.name} (${voice.gender})`);
  console.log(`   语言: ${voice.languages.join(', ')}`);
  console.log(`   标签: ${voice.tags ? voice.tags.join(', ') : '无'}`);
  console.log('');
});
