/**
 * VoiceCode 迁移脚本 - v1.0 → v2.0
 * 
 * 旧格式: PPP VVVV MMM RRRR C (15位)
 * 新格式: PPP VVVVV RRRRRR C (15位)
 * 
 * 转换规则:
 * - providerCode (3位) 保持不变
 * - voiceNumber 从4位扩展到5位 (前面补0)
 * - 去掉 modelCode (3位)
 * - reserved 从4位扩展到6位 (补00)
 * - 重新计算 Luhn 校验位
 * 
 * 注意: 这是破坏性变更，需要同步更新所有引用 voiceCode 的地方
 */

const fs = require('fs');
const path = require('path');
const VoiceCodeGenerator = require('../src/modules/tts/config/VoiceCodeGenerator.js');

// 加载 voices.json
const voicesPath = path.join(__dirname, '../voices/dist/voices.json');
const voicesData = JSON.parse(fs.readFileSync(voicesPath, 'utf8'));

// 加载旧版兼容映射
const compatMapPath = path.join(__dirname, '../src/modules/tts/config/VoiceCodeCompatMap.json');
const compatMap = JSON.parse(fs.readFileSync(compatMapPath, 'utf8'));

console.log('=== VoiceCode Migration: v1.0 → v2.0 ===\n');

// 统计信息
let converted = 0;
let errors = [];

// 新旧编码映射 (用于更新 compatMap)
const oldToNew = {};

// 1. 转换 voices.json 中的编码
voicesData.voices.forEach((voice, index) => {
  const oldCode = voice.voiceCode;
  
  if (!oldCode || oldCode.length !== 15) {
    errors.push({ id: voice.id, error: 'Invalid old voiceCode', code: oldCode });
    return;
  }
  
  try {
    // 解析旧编码
    const providerCode = oldCode.substring(0, 3);
    const oldVoiceNumber = parseInt(oldCode.substring(3, 7), 10);
    
    // 获取 providerKey (从 VoiceCodeConfig)
    const providerInfo = VoiceCodeGenerator.getProviderCodes()[providerCode];
    if (!providerInfo) {
      errors.push({ id: voice.id, error: `Unknown providerCode: ${providerCode}` });
      return;
    }
    
    const providerKey = providerInfo.providerKey;
    
    // 生成新编码 (v2.0 格式: voiceNumber 保持原序号，自动转为5位)
    const newCode = VoiceCodeGenerator.generate({
      providerKey,
      voiceNumber: oldVoiceNumber
    });
    
    // 更新 voice 对象
    const oldVoiceCode = voice.voiceCode;
    voice.voiceCode = newCode;
    
    // 更新 voiceCodeMeta (v2.0 格式没有 modelCode)
    voice.voiceCodeMeta = {
      providerCode,
      voiceNumber: oldVoiceNumber,
      providerKey
    };
    
    // 记录映射
    oldToNew[oldCode] = newCode;
    
    console.log(`✓ [${voice.provider}] ${voice.id}`);
    console.log(`  ${oldCode} → ${newCode}`);
    
    converted++;
    
  } catch (e) {
    errors.push({ id: voice.id, error: e.message });
  }
});

console.log(`\n=== Conversion Summary ===`);
console.log(`Total: ${voicesData.voices.length}`);
console.log(`Converted: ${converted}`);
console.log(`Errors: ${errors.length}`);

if (errors.length > 0) {
  console.log('\nErrors:');
  errors.forEach(e => console.log(`  - ${e.id}: ${e.error}`));
}

// 2. 更新 compatMap
console.log('\n=== Updating CompatMap ===');

const newCompatMap = {
  version: "2.0.0",
  generatedAt: new Date().toISOString(),
  description: "legacy system_id -> voice_code 兼容映射 (v2.0 格式)",
  legacyToVoiceCode: {},
  voiceCodeIndex: {}
};

// 转换 legacyToVoiceCode
Object.entries(compatMap.legacyToVoiceCode).forEach(([legacyId, oldCode]) => {
  const newCode = oldToNew[oldCode];
  if (newCode) {
    newCompatMap.legacyToVoiceCode[legacyId] = newCode;
  }
});

// 重建 voiceCodeIndex
voicesData.voices.forEach(voice => {
  newCompatMap.voiceCodeIndex[voice.voiceCode] = {
    id: voice.id,
    provider: voice.provider,
    service: voice.service,
    displayName: voice.displayName,
    providerVoiceId: voice.runtime?.voiceId || voice.ttsConfig?.voiceId || voice.ttsConfig?.sourceId
  };
});

console.log(`Updated ${Object.keys(newCompatMap.legacyToVoiceCode).length} legacy mappings`);
console.log(`Built ${Object.keys(newCompatMap.voiceCodeIndex).length} voiceCode index entries`);

// 3. 保存文件
console.log('\n=== Saving Files ===');

// 保存 voices.json
voicesData._meta.voiceCodeVersion = "2.0.0";
voicesData._meta.migratedAt = new Date().toISOString();
fs.writeFileSync(voicesPath, JSON.stringify(voicesData, null, 2));
console.log(`✓ Saved: ${voicesPath}`);

// 保存 compatMap
fs.writeFileSync(compatMapPath, JSON.stringify(newCompatMap, null, 2));
console.log(`✓ Saved: ${compatMapPath}`);

// 4. 生成迁移报告
const report = {
  timestamp: new Date().toISOString(),
  fromVersion: "1.0.0",
  toVersion: "2.0.0",
  summary: {
    total: voicesData.voices.length,
    converted,
    errors: errors.length
  },
  mapping: oldToNew,
  errors: errors
};

const reportPath = path.join(__dirname, '../voicecode-migration-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`✓ Saved: ${reportPath}`);

console.log('\n=== Migration Complete ===');
console.log('\n重要提示:');
console.log('1. 所有编码已转换为 v2.0 格式 (PPP VVVVV RRRRRR C)');
console.log('2. 音色序号从4位扩展到5位，支持最大99999个音色');
console.log('3. 已移除 modelCode，serviceKey 直接关联到 providerCode');
console.log('4. 请确保所有使用 voiceCode 的代码已更新到 v2.0 格式');
console.log('5. 建议运行测试验证: node tests/unit/VoiceResolver.test.js');
