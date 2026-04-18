/**
 * 音色编码迁移脚本
 * 
 * 功能：
 * 1. 读取现有 voices/dist/voices.json
 * 2. 为每个音色生成 15 位 voice_code
 * 3. 写入新的 voiceCode 字段
 * 4. 生成 legacy_system_id -> voice_code 兼容映射文件
 * 
 * 运行方式：
 *   node scripts/migrate-voice-codes.js
 */

const fs = require('fs').promises;
const path = require('path');
const VoiceCodeGenerator = require('../src/modules/tts/config/VoiceCodeGenerator');

const VOICES_FILE = path.join(__dirname, '../voices/dist/voices.json');
const COMPAT_MAP_FILE = path.join(__dirname, '../src/modules/tts/config/VoiceCodeCompatMap.json');

/**
 * 根据音色信息确定 modelKey
 */
function resolveModelKey(voice) {
  const provider = voice.provider;
  const service = voice.service;

  // 通过 provider + service 组合判断
  const key = `${provider}_${service}`;

  const modelMap = {
    'moss_tts': 'moss_tts',
    'aliyun_qwen_http': 'qwen_http',
    'aliyun_cosyvoice': 'cosyvoice',
    'tencent_tts': 'tencent_tts',
    'volcengine_volcengine_http': 'volcengine_http',
    'volcengine_http': 'volcengine_http',
    'minimax_minimax_tts': 'minimax_tts',
    'minimax_tts': 'minimax_tts'
  };

  return modelMap[key] || modelMap[`${provider}_${service}`] || null;
}

/**
 * 确定音色在对应服务商下的序号
 * 按 provider 分组，按出现顺序编号（从1开始）
 */
function assignVoiceNumbers(voices) {
  const counters = {};
  return voices.map(voice => {
    const provider = voice.provider;
    if (!counters[provider]) counters[provider] = 0;
    counters[provider] += 1;
    return { ...voice, _voiceNumber: counters[provider] };
  });
}

async function migrate() {
  console.log('🚀 开始音色编码迁移...\n');

  // 1. 读取现有数据
  const raw = await fs.readFile(VOICES_FILE, 'utf8');
  const data = JSON.parse(raw);
  const voices = data.voices || [];

  console.log(`📊 共找到 ${voices.length} 个音色\n`);

  // 2. 分配序号并生成 voice_code
  const numberedVoices = assignVoiceNumbers(voices);
  const compatMap = {};  // legacy_id -> voice_code
  const voiceCodeIndex = {};  // voice_code -> voice info

  const migratedVoices = numberedVoices.map((voice, index) => {
    const modelKey = resolveModelKey(voice);
    if (!modelKey) {
      console.warn(`⚠️  无法确定 modelKey: ${voice.id} (provider=${voice.provider}, service=${voice.service})`);
      return voice;
    }

    const providerKey = voice.provider;

    try {
      const voiceCode = VoiceCodeGenerator.generate({
        providerKey,
        modelKey,
        voiceNumber: voice._voiceNumber
      });

      const parsed = VoiceCodeGenerator.parse(voiceCode);

      // 新增字段
      const newVoice = {
        ...voice,
        voiceCode,
        voiceCodeMeta: {
          providerCode: parsed.providerCode,
          modelCode: parsed.modelCode,
          voiceNumber: parsed.voiceNumber,
          providerKey: parsed.providerKey,
          modelKey: parsed.modelKey
        }
      };

      // 建立兼容映射
      compatMap[voice.id] = voiceCode;
      if (voice.sourceId) {
        compatMap[voice.sourceId] = voiceCode;
      }

      // 建立 voice_code 索引
      voiceCodeIndex[voiceCode] = {
        id: voice.id,
        provider: voice.provider,
        service: voice.service,
        displayName: voice.displayName,
        providerVoiceId: voice.runtime?.voiceId || voice.ttsConfig?.voiceId || voice.ttsConfig?.sourceId || ''
      };

      console.log(`✅ ${voice.id} → ${voiceCode} (${parsed.providerDisplayName} / ${parsed.modelDisplayName} #${parsed.voiceNumber})`);

      // 清理内部字段
      delete newVoice._voiceNumber;
      return newVoice;

    } catch (e) {
      console.error(`❌ 生成 voice_code 失败: ${voice.id} - ${e.message}`);
      delete voice._voiceNumber;
      return voice;
    }
  });

  // 3. 写回 voices.json
  const outputData = {
    ...data,
    _meta: {
      ...data._meta,
      version: '3.0',
      voiceCodeVersion: '1.0.0',
      migratedAt: new Date().toISOString(),
      totalVoices: migratedVoices.length
    },
    voices: migratedVoices
  };

  await fs.writeFile(VOICES_FILE, JSON.stringify(outputData, null, 2));
  console.log(`\n💾 已更新: ${VOICES_FILE}`);

  // 4. 生成兼容映射文件
  const compatData = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    description: 'legacy system_id -> voice_code 兼容映射',
    legacyToVoiceCode: compatMap,
    voiceCodeIndex: voiceCodeIndex
  };

  await fs.writeFile(COMPAT_MAP_FILE, JSON.stringify(compatData, null, 2));
  console.log(`💾 已生成兼容映射: ${COMPAT_MAP_FILE}`);

  // 5. 统计
  const withVoiceCode = migratedVoices.filter(v => v.voiceCode).length;
  const withoutVoiceCode = migratedVoices.filter(v => !v.voiceCode).length;

  console.log(`\n📊 迁移统计:`);
  console.log(`   成功生成 voice_code: ${withVoiceCode}`);
  console.log(`   失败/跳过: ${withoutVoiceCode}`);
  console.log(`   兼容映射条目: ${Object.keys(compatMap).length}`);
  console.log(`\n✅ 迁移完成！`);
}

migrate().catch(err => {
  console.error('❌ 迁移失败:', err);
  process.exit(1);
});
