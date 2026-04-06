#!/usr/bin/env node
/**
 * Build voice configs:
 * - Read YAML provider files under voices/sources/providers
 * - Emit voices/dist/voices.json and voices/dist/categories.json
 *
 * Runtime normalization:
 * - Canonical runtime schema is generated for each voice
 * - Legacy ttsConfig is kept for backward compatibility
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

const CONFIG = {
  sourceDir: path.join(__dirname, 'sources', 'providers'),
  outputDir: path.join(__dirname, 'dist')
};

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function omit(obj = {}, keys = []) {
  const keySet = new Set(keys);
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (!keySet.has(key) && value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function normalizeRuntime({ ttsConfig = {}, runtime = {}, fallbackVoiceId }) {
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

  const runtimeExtras = omit(runtime, [
    'voice',
    'voiceId',
    'model',
    'sampleRate',
    'cluster',
    'voiceType',
    'providerOptions'
  ]);

  return {
    voiceId,
    // Compatibility alias
    voice: pickFirst(runtime.voice, voiceId),
    model: pickFirst(runtime.model, ttsConfig.model),
    sampleRate: pickFirst(runtime.sampleRate, ttsConfig.sampleRate),
    cluster: pickFirst(runtime.cluster, ttsConfig.cluster),
    voiceType: pickFirst(runtime.voiceType, ttsConfig.voiceType),
    providerOptions: {
      ...legacyProviderOptions,
      ...runtimeProviderOptions
    },
    ...runtimeExtras
  };
}

async function processYamlFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const data = yaml.load(content);

  if (!data.meta || !data.voices) {
    throw new Error('YAML file must contain meta and voices');
  }

  const { provider, service, enabled = true } = data.meta;
  const voices = [];

  if (enabled === false) {
    return { voices: [], provider, enabled: false };
  }

  for (const v of data.voices) {
    if (!v.id || !v.displayName || !v.gender) {
      continue;
    }

    const globalId = `${provider}-${service || 'tts'}-${v.id}`;
    const runtime = normalizeRuntime({
      ttsConfig: v.ttsConfig || {},
      runtime: v.runtime || {},
      fallbackVoiceId: v.id
    });

    voices.push({
      id: globalId,
      provider,
      service: service || 'tts',
      sourceId: v.id,
      displayName: v.displayName,
      name: v.name || v.displayName,
      gender: v.gender,
      languages: v.languages || ['zh-CN'],
      description: v.description || '',
      tags: v.tags || [],
      preview: v.preview,
      runtime,
      // Keep old field for compatibility; migration can remove this in a future major version.
      ttsConfig: v.ttsConfig || {}
    });
  }

  return { voices, provider, enabled: true };
}

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
    if (!categories.byProvider[voice.provider]) {
      categories.byProvider[voice.provider] = [];
    }
    categories.byProvider[voice.provider].push(voice.id);

    if (voice.gender === 'female') {
      categories.byGender.female.push(voice.id);
    } else if (voice.gender === 'male') {
      categories.byGender.male.push(voice.id);
    }

    for (const lang of voice.languages || []) {
      if (!categories.byLanguage[lang]) {
        categories.byLanguage[lang] = [];
      }
      categories.byLanguage[lang].push(voice.id);
    }

    for (const tag of voice.tags || []) {
      if (!categories.byTag[tag]) {
        categories.byTag[tag] = [];
      }
      categories.byTag[tag].push(voice.id);
    }
  }

  await fs.writeFile(
    path.join(CONFIG.outputDir, 'categories.json'),
    JSON.stringify(categories, null, 2),
    'utf8'
  );
}

async function build() {
  const startTime = Date.now();
  console.log('Building voice config...');

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

    const idSet = new Set();
    const duplicates = [];
    for (const voice of allVoices) {
      if (idSet.has(voice.id)) {
        duplicates.push(voice.id);
      }
      idSet.add(voice.id);
    }
    if (duplicates.length > 0) {
      console.error(`Duplicate voice ids: ${duplicates.join(', ')}`);
    }

    const enabledProviders = sources.filter(s => s.enabled !== false).map(s => s.provider);
    const disabledProviders = sources.filter(s => s.enabled === false).map(s => s.provider);

    const aggregated = {
      _meta: {
        version: '2.2',
        generatedAt: new Date().toISOString(),
        totalVoices: allVoices.length,
        sources,
        providers: {
          enabled: enabledProviders,
          disabled: disabledProviders
        },
        buildTime: Date.now() - startTime
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
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
