const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class VoiceCategoryGenerator {
  constructor() {
    this.mappingPath = path.join(__dirname, 'voiceIdMapping.json');
    this.outputPath = path.join(__dirname, 'voiceCategories.json');
  }

  async readMapping() {
    const raw = await fs.readFile(this.mappingPath, 'utf8');
    const fingerprint = crypto.createHash('md5').update(raw).digest('hex').slice(0, 16);
    const mapping = JSON.parse(raw);
    const voices = Array.isArray(mapping.voices) ? mapping.voices : [];
    return { mapping, voices, fingerprint };
  }

  normalizeVoices(voices) {
    return voices
      .map(v => ({
        systemId: v.id,
        title: v.displayName || v.name || v.id,
        provider: v.provider,
        service: v.service,
        gender: v.gender,
        languages: Array.isArray(v.languages) ? v.languages : [],
        badges: Array.isArray(v.tags) ? v.tags : []
      }))
      .sort((a, b) => {
        if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
        if (a.service !== b.service) return a.service.localeCompare(b.service);
        return a.systemId.localeCompare(b.systemId);
      });
  }

  categorizeByGender(voices) {
    const meta = {
      female: { key: 'gender_female', title: '女声', icon: '👩', order: 1 },
      male: { key: 'gender_male', title: '男声', icon: '👨', order: 2 }
    };
    const groups = {
      female: voices.filter(v => v.gender === 'female'),
      male: voices.filter(v => v.gender === 'male')
    };
    return Object.entries(groups)
      .filter(([, items]) => items.length > 0)
      .map(([k, items]) => ({
        key: meta[k].key,
        title: meta[k].title,
        icon: meta[k].icon,
        order: meta[k].order,
        count: items.length,
        items
      }));
  }

  categorizeByLanguage(voices) {
    const langMap = {
      'zh-CN': { key: 'lang_zh_cn', title: '中文', icon: '🀄', order: 10 },
      'en-US': { key: 'lang_en_us', title: '英文(美式)', icon: '🇺🇸', order: 11 },
      'en-GB': { key: 'lang_en_gb', title: '英文(英式)', icon: '🇬🇧', order: 12 },
      'ja-JP': { key: 'lang_ja_jp', title: '日语', icon: '🇯🇵', order: 13 },
      'ko-KR': { key: 'lang_ko_kr', title: '韩语', icon: '🇰🇷', order: 14 }
    };
    const categories = [];
    Object.entries(langMap).forEach(([code, meta]) => {
      const items = voices.filter(v => v.languages.includes(code));
      if (items.length > 0) {
        categories.push({
          key: meta.key,
          title: meta.title,
          icon: meta.icon,
          order: meta.order,
          count: items.length,
          items
        });
      }
    });
    return categories;
  }

  categorizeByProvider(voices) {
    const providerMap = {
      aliyun: { key: 'provider_aliyun', title: '阿里云', icon: '🅰️', order: 20 },
      tencent: { key: 'provider_tencent', title: '腾讯云', icon: '🆃', order: 21 },
      volcengine: { key: 'provider_volcengine', title: '火山引擎', icon: '🔥', order: 22 },
      minimax: { key: 'provider_minimax', title: 'MiniMax', icon: 'Ⓜ️', order: 23 }
    };
    const categories = [];
    Object.entries(providerMap).forEach(([provider, meta]) => {
      const items = voices.filter(v => v.provider === provider);
      if (items.length > 0) {
        categories.push({
          key: meta.key,
          title: meta.title,
          icon: meta.icon,
          order: meta.order,
          count: items.length,
          items
        });
      }
    });
    return categories;
  }

  categorizeByTags(voices) {
    const tagCounts = new Map();
    voices.forEach(v => (v.badges || []).forEach(tag => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }));
    const sortedTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);
    const categories = [];
    let i = 30;
    sortedTags.forEach(tag => {
      const items = voices.filter(v => v.badges && v.badges.includes(tag));
      if (items.length > 0) {
        categories.push({
          key: `tag_${tag}`,
          title: tag,
          icon: '🏷️',
          order: i++,
          count: items.length,
          items
        });
      }
    });
    return categories;
  }

  buildCategories(voices) {
    const categories = [
      ...this.categorizeByGender(voices),
      ...this.categorizeByLanguage(voices),
      ...this.categorizeByProvider(voices),
      ...this.categorizeByTags(voices)
    ].sort((a, b) => a.order - b.order);
    return categories;
  }

  async generate() {
    const { mapping, voices: rawVoices, fingerprint } = await this.readMapping();
    const normalized = this.normalizeVoices(rawVoices);
    const categories = this.buildCategories(normalized);
    const payload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      source: {
        mappingVersion: mapping.version || 1,
        sourceFingerprint: fingerprint,
        totalVoices: normalized.length
      },
      categories
    };
    const tmpPath = `${this.outputPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    await fs.rename(tmpPath, this.outputPath);
    return payload;
  }
}

async function generate() {
  const g = new VoiceCategoryGenerator();
  return g.generate();
}

module.exports = {
  VoiceCategoryGenerator,
  generate
};

if (require.main === module) {
  generate()
    .then(() => {
      console.log('voiceCategories.json 生成完成');
    })
    .catch(err => {
      console.error('生成失败:', err.message);
      process.exit(1);
    });
}
