/**
 * 修复 qwen.yaml 编码 → 重新编译 voices.json → 转换 yaml 源文件为 UTF-8
 *
 * 根因：qwen.yaml 是 GBK 编码，但下游全部用 UTF-8 读取。
 * 本脚本一次性修复：数据文件 + 源文件 + 防御代码。
 */
const fs = require('fs');
const path = require('path');

const VOICES_JSON = path.join(__dirname, '..', 'voices', 'dist', 'voices.json');
const QWEN_YAML  = path.join(__dirname, '..', 'voices', 'sources', 'providers', 'qwen.yaml');

// ---------------------------------------------------------------------------
// 1. 从 GBK 编码的 qwen.yaml 解析所有音色
// ---------------------------------------------------------------------------
function parseQwenVoices() {
  const raw  = fs.readFileSync(QWEN_YAML);
  const text = new TextDecoder('gbk').decode(raw);
  const lines = text.split(/\r?\n/);

  const voices = [];
  let cur = null;

  for (const line of lines) {
    const idMatch = line.match(/^  - id:\s*(.+)/);
    if (idMatch) {
      if (cur) voices.push(cur);
      cur = { id: `aliyun-qwen_http-${idMatch[1].trim()}`, tags: [], languages: [] };
      continue;
    }
    if (!cur) continue;

    const mName = line.match(/^\s{4}displayName:\s*(.+)/);
    if (mName) { cur.displayName = mName[1].trim(); continue; }

    const mDesc = line.match(/^\s{4}description:\s*(.+)/);
    if (mDesc) { cur.description = mDesc[1].trim(); continue; }

    const mLangs = line.match(/^\s{4}languages:\s*\[(.+)\]/);
    if (mLangs) {
      cur.languages = mLangs[1].split(',').map(t => t.trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }

    const mTags = line.match(/^\s{4}tags:\s*\[(.+)\]/);
    if (mTags) {
      cur.tags = mTags[1].split(',').map(t => t.trim().replace(/^['"]|['"]$/g, ''));
    }
  }
  if (cur) voices.push(cur);
  return voices;
}

// ---------------------------------------------------------------------------
// 2. 检查 voice profile 中是否有  乱码
// ---------------------------------------------------------------------------
function hasGarbled(profile) {
  if (!profile) return false;
  if (typeof profile.displayName === 'string' && profile.displayName.includes('\ufffd')) return true;
  if (typeof profile.description === 'string' && profile.description.includes('\ufffd')) return true;
  if (Array.isArray(profile.tags) && profile.tags.some(t => typeof t === 'string' && t.includes('\ufffd'))) return true;
  if (Array.isArray(profile.languages) && profile.languages.some(l => typeof l === 'string' && l.includes('\ufffd'))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 3. 用 YAML 解析出的正确数据修复 voices.json
// ---------------------------------------------------------------------------
function fixVoicesJson(qwenVoices) {
  const data    = JSON.parse(fs.readFileSync(VOICES_JSON, 'utf8'));
  const allVoices = data.voices || [];

  const fixMap = {};
  for (const v of qwenVoices) {
    fixMap[v.id] = {
      displayName: v.displayName,
      description: v.description || '',
      tags: v.tags,
      languages: v.languages
    };
  }

  let count = 0;
  for (const voice of allVoices) {
    const fix = fixMap[voice.identity?.id];
    if (!fix) continue;
    const p = voice.profile || {};
    if (p.displayName?.includes('\ufffd')) { p.displayName = fix.displayName; count++; }
    if (p.description?.includes('\ufffd'))  { p.description  = fix.description;  count++; }
    if (p.tags?.some(t => t.includes('\ufffd')))       { p.tags      = fix.tags;      }
    if (p.languages?.some(l => l.includes('\ufffd')))  { p.languages = fix.languages; }
  }

  fs.writeFileSync(VOICES_JSON, JSON.stringify(data, null, 2), 'utf8');
  return count;
}

// ---------------------------------------------------------------------------
// 4. 将 qwen.yaml 源文件从 GBK 转换为 UTF-8（一劳永逸）
// ---------------------------------------------------------------------------
function convertYamlToUtf8() {
  const raw  = fs.readFileSync(QWEN_YAML);
  const text = new TextDecoder('gbk').decode(raw);
  fs.writeFileSync(QWEN_YAML, text, 'utf8');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function main() {
  console.log('[1/4] Parsing qwen.yaml (GBK)...');
  const qwenVoices = parseQwenVoices();
  console.log(`       → ${qwenVoices.length} voices`);
  if (qwenVoices.length === 0) { console.log('ERROR'); return; }
  qwenVoices.slice(0, 3).forEach(v => console.log(`       ${v.id}  ${v.displayName}  [${v.languages.join(',')}]  ${(v.tags||[]).slice(0,3).join(',')}`));

  console.log('\n[2/4] Fixing voices.json...');
  const fixed = fixVoicesJson(qwenVoices);
  console.log(`       → ${fixed} fields repaired`);

  console.log('\n[3/4] Converting qwen.yaml → UTF-8...');
  convertYamlToUtf8();
  console.log('       → Done. qwen.yaml is now UTF-8.');

  console.log('\n[4/4] Verifying...');
  const verify = JSON.parse(fs.readFileSync(VOICES_JSON, 'utf8'));
  let bad = 0;
  for (const v of (verify.voices || [])) {
    if (hasGarbled(v.profile)) { bad++; console.log('       BAD:', v.identity?.id); }
  }
  console.log(`       ${bad} garbled voices remaining`);

  if (bad === 0) console.log('\n✅ All voice data clean. qwen.yaml permanently converted to UTF-8.');
}

main();