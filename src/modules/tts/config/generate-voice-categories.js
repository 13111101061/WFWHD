/**
 * VoiceCategoryGenerator — 从 voices.json 重建 categories.json
 *
 * 用法：
 *   node src/modules/tts/config/generate-voice-categories.js
 *   或通过 run-generate.js： node src/modules/tts/config/run-generate
 *
 * 输入：voices/dist/voices.json + voices/tag-categories.json
 * 输出：voices/dist/categories.json（byProvider/byGender/byLanguage/byTag/byCategory）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const VOICES_FILE = path.join(ROOT, 'voices', 'dist', 'voices.json');
const TAG_CATEGORIES_FILE = path.join(ROOT, 'voices', 'tag-categories.json');
const OUTPUT_FILE = path.join(ROOT, 'voices', 'dist', 'categories.json');

class VoiceCategoryGenerator {
  constructor() {
    this._catIdx = null;
  }

  _loadTagCategoryIndex() {
    if (this._catIdx) return this._catIdx;
    try {
      const raw = JSON.parse(fs.readFileSync(TAG_CATEGORIES_FILE, 'utf8'));
      const idx = {};
      for (const [cat, tags] of Object.entries(raw.categories || {})) {
        for (const t of tags) idx[t] = cat;
      }
      this._catIdx = idx;
    } catch (e) {
      console.warn('[VoiceCategoryGenerator] tag-categories.json not loaded:', e.message);
      this._catIdx = {};
    }
    return this._catIdx;
  }

  _categorizeTags(tags) {
    const idx = this._loadTagCategoryIndex();
    const result = {};
    for (const tag of tags) {
      const cat = idx[tag] || '其他';
      if (!result[cat]) result[cat] = [];
      result[cat].push(tag);
    }
    return result;
  }

  async generate() {
    if (!fs.existsSync(VOICES_FILE)) {
      throw new Error(`voices.json not found: ${VOICES_FILE}`);
    }

    const voicesData = JSON.parse(fs.readFileSync(VOICES_FILE, 'utf8'));
    const voices = voicesData.voices || [];

    const idx = this._loadTagCategoryIndex();
    const allCategories = new Set(Object.values(idx));
    allCategories.add('其他');

    const categories = {
      _meta: {
        generatedAt: new Date().toISOString(),
        totalVoices: voices.length,
        categoryNames: Array.from(allCategories).sort()
      },
      byProvider: {},
      byGender: { female: [], male: [] },
      byLanguage: {},
      byTag: {},
      byCategory: {}
    };

    for (const c of allCategories) {
      categories.byCategory[c] = {};
    }

    for (const voice of voices) {
      const id = voice.identity?.id;
      if (!id) continue;

      const provider = voice.identity.provider;
      const gender = voice.profile?.gender;
      const languages = voice.profile?.languages;
      const tags = voice.profile?.tags || [];
      const tagCats = voice.profile?.tagCategories || this._categorizeTags(tags);

      if (!categories.byProvider[provider]) categories.byProvider[provider] = [];
      categories.byProvider[provider].push(id);

      if (gender === 'female') categories.byGender.female.push(id);
      else if (gender === 'male') categories.byGender.male.push(id);

      for (const lang of languages || []) {
        if (!categories.byLanguage[lang]) categories.byLanguage[lang] = [];
        categories.byLanguage[lang].push(id);
      }

      for (const tag of tags) {
        if (!categories.byTag[tag]) categories.byTag[tag] = [];
        categories.byTag[tag].push(id);
      }

      for (const [cat, catTags] of Object.entries(tagCats)) {
        if (!categories.byCategory[cat]) categories.byCategory[cat] = {};
        for (const t of catTags) {
          if (!categories.byCategory[cat][t]) categories.byCategory[cat][t] = [];
          categories.byCategory[cat][t].push(id);
        }
      }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(categories, null, 2), 'utf8');
    console.log(`[VoiceCategoryGenerator] Generated categories.json: ${voices.length} voices, ${allCategories.size} categories`);
    return categories;
  }
}

module.exports = { VoiceCategoryGenerator };

// CLI
if (require.main === module) {
  const gen = new VoiceCategoryGenerator();
  gen.generate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
