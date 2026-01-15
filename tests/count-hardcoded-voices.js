/**
 * 统计所有服务商中硬编码的音色数量
 */
const fs = require('fs');
const path = require('path');

// 服务商文件列表
const serviceFiles = [
  'src/modules/tts/services/cosyVoiceService.js',
  'src/modules/tts/services/qwenTtsHttpService.js',
  'src/modules/tts/services/qwenTtsService.js',
  'src/modules/tts/services/tencentTtsService.js',
  'src/modules/tts/services/volcengineTtsService.js',
  'src/modules/tts/services/volcengineTtsWsService.js',
  'src/modules/tts/services/minimaxTtsService.js',
  'src/modules/tts/services/minimaxTtsService.refactored.js'
];

/**
 * 从服务类文件中提取getAvailableVoices方法中的音色
 */
function extractVoicesFromService(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // 查找getAvailableVoices方法
    const methodMatch = content.match(/getAvailableVoices\(\)\s*{[\s\S]*?return\s*\[([\s\S]*?)\];\s*}/);

    if (!methodMatch) {
      return {
        file: path.basename(filePath),
        count: 0,
        voices: [],
        error: '未找到getAvailableVoices方法'
      };
    }

    const voicesArray = methodMatch[1];

    // 提取所有的id和name
    const voiceRegex =/{\s*id:\s*([^,}]+),\s*name:\s*['"]([^'"]+)['"]/g;
    const voices = [];
    let match;

    while ((match = voiceRegex.exec(voicesArray)) !== null) {
      voices.push({
        id: match[1].trim(),
        name: match[2].trim()
      });
    }

    return {
      file: path.basename(filePath),
      count: voices.length,
      voices: voices
    };

  } catch (error) {
    return {
      file: path.basename(filePath),
      count: 0,
      voices: [],
      error: error.message
    };
  }
}

// 统计所有服务
console.log('🔍 统计各服务商硬编码的音色数量\n');
console.log('='.repeat(80));

let totalVoices = 0;
const results = [];

serviceFiles.forEach(filePath => {
  const result = extractVoicesFromService(filePath);
  results.push(result);
  totalVoices += result.count;

  console.log(`\n📁 ${result.file}`);
  console.log(`   音色数量: ${result.count}`);

  if (result.error) {
    console.log(`   ⚠️  ${result.error}`);
  } else {
    // 显示前3个和后3个音色
    if (result.voices.length > 0) {
      console.log(`   示例音色:`);
      const displayCount = Math.min(3, result.voices.length);
      for (let i = 0; i < displayCount; i++) {
        console.log(`     - ${result.voices[i].id} (${result.voices[i].name})`);
      }
      if (result.voices.length > 6) {
        console.log(`     ... (省略 ${result.voices.length - 6} 个)`);
        for (let i = result.voices.length - 3; i < result.voices.length; i++) {
          console.log(`     - ${result.voices[i].id} (${result.voices[i].name})`);
        }
      } else if (result.voices.length > 3) {
        for (let i = 3; i < result.voices.length; i++) {
          console.log(`     - ${result.voices[i].id} (${result.voices[i].name})`);
        }
      }
    }
  }
});

console.log('\n' + '='.repeat(80));
console.log(`\n📊 统计汇总:`);
console.log(`   总计硬编码音色数量: ${totalVoices}`);
console.log(`   服务商文件数量: ${serviceFiles.length}`);

// 对比voiceModels.json
console.log(`\n📋 voiceModels.json中的音色数量: 53`);

console.log(`\n💡 结论:`);
if (totalVoices > 53) {
  const diff = totalVoices - 53;
  console.log(`   ⚠️  硬编码音色总数 (${totalVoices}) 比 voiceModels.json (53) 多 ${diff} 个`);
  console.log(`   🔧 需要将缺失的音色添加到 voiceModels.json`);
} else if (totalVoices < 53) {
  const diff = 53 - totalVoices;
  console.log(`   ✅ voiceModels.json (53) 比硬编码总数 (${totalVoices}) 多 ${diff} 个`);
  console.log(`   📝 voiceModels.json 已包含更多音色`);
} else {
  console.log(`   ✅ 数量一致`);
}

// 详细对比
console.log(`\n🔍 详细分析:`);

// 检查哪些服务有硬编码但未迁移
const servicesWithHardcoded = results.filter(r => r.count > 0 && !r.error);
console.log(`\n需要迁移的服务商:`);

servicesWithHardcoded.forEach(result => {
  // 从文件名提取服务商名
  const serviceName = result.file
    .replace('Service.js', '')
    .replace('TtsService.js', '')
    .replace('.js', '');

  console.log(`  - ${serviceName}: ${result.count} 个硬编码音色`);
});

console.log('\n' + '='.repeat(80));
