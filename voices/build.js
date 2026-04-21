#!/usr/bin/env node
/**
 * Build voice configs:
 * - Read YAML provider files under voices/sources/providers
 * - Emit voices/dist/voices.json and voices/dist/categories.json
 *
 * Output format (v3.0):
 * - StoredVoice structure with identity/profile/runtime/meta layers
 * - Legacy ttsConfig kept in _compat for backward compatibility
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

const CONFIG = {
  sourceDir: path.join(__dirname, 'sources', 'providers'),
  outputDir: path.join(__dirname, 'dist')
};

/**
 * 从多个候选值中选取第一个有效值
 */
function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

/**
 * 从对象中排除指定字段
 */
function omit(obj = {}, keys = []) {
  const keySet = new Set(keys);
  return Object.entries(obj || {}).reduce((acc, [key, value]) => {
    if (!keySet.has(key) && value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

/**
 * 从 ttsConfig 和 runtime 中提取运行时配置
 */
function extractRuntime({ ttsConfig = {}, runtime = {}, fallbackVoiceId }) {
  const legacyVoiceId = pickFirst(
    ttsConfig.voiceId,
    ttsConfig.voiceName,
    ttsConfig.sourceId,
    fallbackVoiceId
  );

  const voiceId = pickFirst(runtime.voiceId, runtime.voice, legacyVoiceId);

  const legacyProviderOptions = omit(ttsConfig, [
    'voiceId',
    'voiceName',
    'sourceId',
    'model',
    'sampleRate',
    'cluster',
    'voiceType'
  ]);

  const runtimeProviderOptions =
    runtime.providerOptions && typeof runtime.providerOptions === 'object'
      ? runtime.providerOptions
      : {};

  // 合并 providerOptions
  const providerOptions = {
    ...legacyProviderOptions,
    ...runtimeProviderOptions
  };

  // 如果 ttsConfig 有 samplingParams，也合并进去
  if (ttsConfig.samplingParams) {
    providerOptions.samplingParams = ttsConfig.samplingParams;
  }

  return {
    voiceId,
    model: pickFirst(runtime.model, ttsConfig.model, 'default'),
    providerOptions,
    // 保留其他运行时字段
    sampleRate: pickFirst(runtime.sampleRate, ttsConfig.sampleRate),
    cluster: pickFirst(runtime.cluster, ttsConfig.cluster),
    voiceType: pickFirst(runtime.voiceType, ttsConfig.voiceType)
  };
}

/**
 * 生成 voiceCode
 */
function generateVoiceCode(provider, voiceNumber) {
  try {
    const VoiceCodeGenerator = require('../src/modules/tts/config/VoiceCodeGenerator');
    return VoiceCodeGenerator.generate({ providerKey: provider, voiceNumber });
  } catch (e) {
    console.warn(`[build] Failed to generate voiceCode for ${provider}: ${e.message}`);
    return null;
  }
}

/**
 * 处理单个 YAML 文件
 */
async function processYamlFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const data = yaml.load(content);

  if (!data.meta || !data.voices) {
    throw new Error('YAML file must contain meta and voices');
  }

  const { provider, service, enabled = true } = data.meta;
  const voices = [];
  const now = new Date().toISOString();

  if (enabled === false) {
    return { voices: [], provider, enabled: false };
  }

  // 音色编号计数器（用于生成 voiceCode）
  let voiceNumber = 1;

  for (const v of data.voices) {
    if (!v.id || !v.displayName || !v.gender) {
      continue;
    }

    const globalId = `${provider}-${service || 'tts'}-${v.id}`;
    const runtime = extractRuntime({
      ttsConfig: v.ttsConfig || {},
      runtime: v.runtime || {},
      fallbackVoiceId: v.id
    });

    // 生成 voiceCode
    const voiceCode = generateVoiceCode(provider, voiceNumber);
    voiceNumber++;

    // 构建新格式 StoredVoice
    const storedVoice = {
      identity: {
        id: globalId,
        voiceCode,
        sourceId: v.id,
        provider,
        service: service || 'tts'
      },
      profile: {
        displayName: v.displayName,
        alias: v.name || v.displayName,
        gender: v.gender,
        languages: v.languages || ['zh-CN'],
        description: v.description || '',
        tags: v.tags || [],
        status: 'active',
        preview: v.preview || null
      },
      runtime,
      meta: {
        createdAt: now,
        updatedAt: now,
        dataSource: 'import',
        version: 'v1'
      }
    };

    // 保留兼容层（逐步淘汰）
    if (v.ttsConfig && Object.keys(v.ttsConfig).length > 0) {
      storedVoice._compat = {
        ttsConfig: v.ttsConfig
      };
    }

    voices.push(storedVoice);
  }

  return { voices, provider, enabled: true };
}

/**
 * 生成分类索引
 */
async function generateCategories(voices) {
  const categories = {
    _meta: {
      generatedAt: new Date().toISOString(),
      totalVoices: voices.length
    },
    byProvider: {},
    byGender: {
      female: [],
      male: []
    },
    byLanguage: {},
    byTag: {}
  };

  for (const voice of voices) {
    const id = voice.identity.id;
    const provider = voice.identity.provider;
    const gender = voice.profile.gender;
    const languages = voice.profile.languages;
    const tags = voice.profile.tags;

    // byProvider
    if (!categories.byProvider[provider]) {
      categories.byProvider[provider] = [];
    }
    categories.byProvider[provider].push(id);

    // byGender
    if (gender === 'female') {
      categories.byGender.female.push(id);
    } else if (gender === 'male') {
      categories.byGender.male.push(id);
    }

    // byLanguage
    for (const lang of languages || []) {
      if (!categories.byLanguage[lang]) {
        categories.byLanguage[lang] = [];
      }
      categories.byLanguage[lang].push(id);
    }

    // byTag
    for (const tag of tags || []) {
      if (!categories.byTag[tag]) {
        categories.byTag[tag] = [];
      }
      categories.byTag[tag].push(id);
    }
  }

  await fs.writeFile(
    path.join(CONFIG.outputDir, 'categories.json'),
    JSON.stringify(categories, null, 2),
    'utf8'
  );
}

/**
 * 主构建函数
 */
async function build() {
  const startTime = Date.now();
  console.log('Building voice config (v3.0 format)...');

  try {
    await fs.mkdir(CONFIG.outputDir, { recursive: true });

    const files = await fs.readdir(CONFIG.sourceDir);
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    if (yamlFiles.length === 0) {
      console.warn('No YAML source files found');
      return;
    }

    const allVoices = [];
    const sources = [];
    const errors = [];

    for (const file of yamlFiles) {
      try {
        const result = await processYamlFile(path.join(CONFIG.sourceDir, file));
        allVoices.push(...result.voices);
        sources.push({
          file,
          count: result.voices.length,
          provider: result.provider,
          enabled: result.enabled
        });
      } catch (error) {
        errors.push({ file, error: error.message });
      }
    }

    if (errors.length > 0) {
      console.error('Build errors:');
      errors.forEach(e => console.error(`- ${e.file}: ${e.error}`));
    }

    // 检查重复 ID
    const idSet = new Set();
    const duplicates = [];
    for (const voice of allVoices) {
      const id = voice.identity.id;
      if (idSet.has(id)) {
        duplicates.push(id);
      }
      idSet.add(id);
    }
    if (duplicates.length > 0) {
      console.error(`Duplicate voice ids: ${duplicates.join(', ')}`);
    }

    const enabledProviders = sources.filter(s => s.enabled !== false).map(s => s.provider);
    const disabledProviders = sources.filter(s => s.enabled === false).map(s => s.provider);

    const aggregated = {
      _meta: {
        version: '3.0',
        generatedAt: new Date().toISOString(),
        totalVoices: allVoices.length,
        sources,
        providers: {
          enabled: enabledProviders,
          disabled: disabledProviders
        },
        buildTime: Date.now() - startTime,
        format: 'StoredVoice'
      },
      voices: allVoices
    };

    await fs.writeFile(
      path.join(CONFIG.outputDir, 'voices.json'),
      JSON.stringify(aggregated, null, 2),
      'utf8'
    );

    await generateCategories(allVoices);

    console.log(`Build done: ${allVoices.length} voices in ${Date.now() - startTime}ms`);
    console.log(`Format: StoredVoice (identity/profile/runtime/meta)`);
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
