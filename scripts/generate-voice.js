const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

async function generateVoiceCategories() {
  const configDir = path.join(__dirname, '../src/modules/tts/config');
  const mappingFile = path.join(configDir, 'voiceIdMapping.json');
  const outputFile = path.join(configDir, 'voiceCategories.json');

  console.log('Reading voiceIdMapping.json...');
  const mappingData = JSON.parse(await fs.readFile(mappingFile, 'utf8'));
  console.log(`Found ${mappingData.voices.length} voices`);

  const voices = mappingData.voices;
  const categories = [];

  // 按性别分类
  console.log('Categorizing by gender...');
  const genderMap = {
    female: { key: 'gender_female', title: '女声', icon: '👩', order: 1 },
    male: { key: 'gender_male', title: '男声', icon: '👨', order: 2 }
  };

  for (const [gender, config] of Object.entries(genderMap)) {
    const items = voices
      .filter(v => v.gender === gender)
      .map(v => ({
        systemId: v.id,
        title: v.name,
        provider: v.provider,
        service: v.service,
        gender: v.gender,
        languages: v.languages
      }))
      .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));

    if (items.length > 0) {
      categories.push({
        key: config.key,
        title: config.title,
        icon: config.icon,
        order: config.order,
        count: items.length,
        items
      });
    }
  }

  // 按语言分类
  console.log('Categorizing by language...');
  const languageMap = {
    'zh-CN': { key: 'lang_zh_cn', title: '中文', icon: '🇨🇳', order: 10 },
    'en-US': { key: 'lang_en_us', title: '英文', icon: '🇺🇸', order: 11 },
    'en-GB': { key: 'lang_en_gb', title: '英式英文', icon: '🇬🇧', order: 12 },
    'ja-JP': { key: 'lang_ja_jp', title: '日语', icon: '🇯🇵', order: 13 },
    'ko-KR': { key: 'lang_ko_kr', title: '韩语', icon: '🇰🇷', order: 14 },
    'es-ES': { key: 'lang_es_es', title: '西班牙语', icon: '🇪🇸', order: 15 },
    'ru-RU': { key: 'lang_ru_ru', title: '俄语', icon: '🇷🇺', order: 16 },
    'it-IT': { key: 'lang_it_it', title: '意大利语', icon: '🇮🇹', order: 17 },
    'fr-FR': { key: 'lang_fr_fr', title: '法语', icon: '🇫🇷', order: 18 },
    'de-DE': { key: 'lang_de_de', title: '德语', icon: '🇩🇪', order: 19 }
  };

  for (const [lang, config] of Object.entries(languageMap)) {
    const items = voices
      .filter(v => v.languages && v.languages.includes(lang))
      .map(v => ({
        systemId: v.id,
        title: v.name,
        provider: v.provider,
        service: v.service,
        gender: v.gender,
        languages: v.languages
      }))
      .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));

    if (items.length > 0) {
      categories.push({
        key: config.key,
        title: config.title,
        icon: config.icon,
        order: config.order,
        count: items.length,
        items
      });
    }
  }

  // 按服务商分类
  console.log('Categorizing by provider...');
  const providerMap = {
    aliyun: { key: 'provider_aliyun', title: '阿里云', icon: '☁️', order: 20 },
    tencent: { key: 'provider_tencent', title: '腾讯云', icon: '🐧', order: 21 },
    volcengine: { key: 'provider_volcengine', title: '火山引擎', icon: '🌋', order: 22 },
    minimax: { key: 'provider_minimax', title: 'MiniMax', icon: '🤖', order: 23 }
  };

  for (const [provider, config] of Object.entries(providerMap)) {
    const items = voices
      .filter(v => v.provider === provider)
      .map(v => ({
        systemId: v.id,
        title: v.name,
        provider: v.provider,
        service: v.service,
        gender: v.gender,
        languages: v.languages
      }))
      .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));

    if (items.length > 0) {
      categories.push({
        key: config.key,
        title: config.title,
        icon: config.icon,
        order: config.order,
        count: items.length,
        items
      });
    }
  }

  // 按标签分类
  console.log('Categorizing by tags...');
  const tagMap = {
    popular: { key: 'tag_popular', title: '热门推荐', icon: '🔥', order: 30, aliases: ['popular', '热门', '推荐'] },
    bilingual: { key: 'tag_bilingual', title: '双语音色', icon: '🌐', order: 31, aliases: ['bilingual', '双语', '多语言'] },
    sweet: { key: 'tag_sweet', title: '甜美音色', icon: '🍬', order: 32, aliases: ['sweet', '甜美', '可爱', '温柔'] },
    professional: { key: 'tag_professional', title: '专业音色', icon: '💼', order: 33, aliases: ['professional', '专业', '新闻'] },
    storytelling: { key: 'tag_storytelling', title: '讲故事', icon: '📖', order: 34, aliases: ['storytelling', '讲故事', '长者'] },
    dialect: { key: 'tag_dialect', title: '方言音色', icon: '🗣️', order: 35, aliases: ['dialect', '方言'] },
    cute: { key: 'tag_cute', title: '可爱音色', icon: '🎀', order: 36, aliases: ['cute', '可爱', '调皮', '年轻女性'] },
    mature: { key: 'tag_mature', title: '成熟音色', icon: '👔', order: 37, aliases: ['mature', '成熟', '优雅'] },
    young_male: { key: 'tag_young_male', title: '青年男声', icon: '👦', order: 38, aliases: ['young_male', '年轻男性', '酷'] }
  };

  for (const [tagKey, config] of Object.entries(tagMap)) {
    const items = voices
      .filter(v => v.tags && v.tags.some(t => config.aliases.includes(t)))
      .map(v => ({
        systemId: v.id,
        title: v.name,
        provider: v.provider,
        service: v.service,
        gender: v.gender,
        languages: v.languages
      }))
      .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));

    if (items.length > 0) {
      categories.push({
        key: config.key,
        title: config.title,
        icon: config.icon,
        order: config.order,
        count: items.length,
        items
      });
    }
  }

  // 排序分类
  categories.sort((a, b) => a.order - b.order);

  const result = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      mappingVersion: mappingData.version || 1,
      sourceFingerprint: crypto.createHash('sha256').update(JSON.stringify(mappingData)).digest('hex').substring(0, 16),
      totalVoices: voices.length
    },
    categories
  };

  // 写入文件
  console.log('Writing voiceCategories.json...');
  await fs.writeFile(outputFile, JSON.stringify(result, null, 2), 'utf8');

  console.log('\n✅ Generation complete!');
  console.log(`📊 Stats:`);
  console.log(`   - Total voices: ${result.source.totalVoices}`);
  console.log(`   - Total categories: ${categories.length}`);
  console.log('\n📋 Categories:');
  categories.forEach(cat => {
    console.log(`   ${cat.icon} ${cat.title}: ${cat.count} voices`);
  });
}

generateVoiceCategories().catch(console.error);
