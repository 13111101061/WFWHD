#!/usr/bin/env node
/**
 * 音色配置构建脚本
 * 将 YAML 源文件转换为 JSON 运行时文件
 *
 * 使用方式:
 *   node voices/build.js [--watch]
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');

// 配置
const CONFIG = {
  sourceDir: path.join(__dirname, 'sources', 'providers'),
  outputDir: path.join(__dirname, 'dist'),
  existingMappingPath: path.join(__dirname, '..', 'src', 'modules', 'tts', 'config', 'voiceIdMapping.json')
};

/**
 * 主构建函数
 */
async function build() {
  console.log('🔨 开始构建音色配置...\n');
  const startTime = Date.now();

  try {
    // 1. 确保输出目录存在
    await fs.mkdir(CONFIG.outputDir, { recursive: true });

    // 2. 读取所有 YAML 源文件
    const files = await fs.readdir(CONFIG.sourceDir);
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    if (yamlFiles.length === 0) {
      console.warn('⚠️  未找到 YAML 源文件');
      return;
    }

    console.log(`📁 找到 ${yamlFiles.length} 个源文件:`);
    yamlFiles.forEach(f => console.log(`   - ${f}`));
    console.log('');

    // 3. 处理每个文件
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
          provider: result.provider
        });
        console.log(`✅ ${file}: ${result.voices.length} 个音色 (${result.provider})`);
      } catch (error) {
        errors.push({ file, error: error.message });
        console.error(`❌ ${file}: ${error.message}`);
      }
    }

    // 4. 合并现有的 voiceIdMapping.json (阿里云 Qwen)
    try {
      const existingData = await fs.readFile(CONFIG.existingMappingPath, 'utf8');
      const existingMapping = JSON.parse(existingData);

      if (existingMapping.voices && Array.isArray(existingMapping.voices)) {
        // 转换为新的格式
        const convertedVoices = existingMapping.voices.map(v => ({
          id: v.id,
          provider: v.provider,
          service: v.service,
          sourceId: v.voiceId, // 原始 voiceId
          displayName: v.displayName || v.name,
          name: v.name,
          gender: v.gender,
          languages: v.languages,
          description: v.description || '',
          tags: v.tags || [],
          preview: v.preview,
          ttsConfig: {
            voiceName: v.voiceId,
            model: v.model || 'qwen3-tts-flash',
            sampleRate: 24000
          }
        }));

        allVoices.push(...convertedVoices);
        sources.push({
          file: 'voiceIdMapping.json (已存在)',
          count: convertedVoices.length,
          provider: 'aliyun'
        });
        console.log(`✅ voiceIdMapping.json: ${convertedVoices.length} 个音色 (aliyun)`);
      }
    } catch (error) {
      console.log(`⚠️  未找到或无法读取现有的 voiceIdMapping.json: ${error.message}`);
    }

    // 5. 检查错误
    if (errors.length > 0) {
      console.error('\n❌ 构建过程中出现错误:');
      errors.forEach(e => console.error(`   ${e.file}: ${e.error}`));
    }

    // 6. 唯一性检查
    const idSet = new Set();
    const duplicates = [];
    for (const voice of allVoices) {
      if (idSet.has(voice.id)) {
        duplicates.push(voice.id);
      }
      idSet.add(voice.id);
    }

    if (duplicates.length > 0) {
      console.error('\n❌ 发现重复的音色 ID:', duplicates.join(', '));
    }

    // 7. 生成聚合文件
    const aggregated = {
      _meta: {
        version: '2.0',
        generatedAt: new Date().toISOString(),
        totalVoices: allVoices.length,
        sources: sources,
        buildTime: Date.now() - startTime
      },
      voices: allVoices
    };

    await fs.writeFile(
      path.join(CONFIG.outputDir, 'voices.json'),
      JSON.stringify(aggregated, null, 2),
      'utf8'
    );

    // 8. 生成分类索引
    await generateCategories(allVoices);

    // 9. 输出摘要
    console.log('\n📊 构建摘要:');
    console.log(`   总音色数: ${allVoices.length}`);
    console.log(`   提供商: ${[...new Set(allVoices.map(v => v.provider))].join(', ')}`);
    console.log(`   构建时间: ${Date.now() - startTime}ms`);
    console.log(`\n✅ 构建完成！输出文件:`);
    console.log(`   ${path.join(CONFIG.outputDir, 'voices.json')}`);
    console.log(`   ${path.join(CONFIG.outputDir, 'categories.json')}`);

  } catch (error) {
    console.error('❌ 构建失败:', error);
    process.exit(1);
  }
}

/**
 * 处理单个 YAML 文件
 */
async function processYamlFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const data = yaml.load(content);

  if (!data.meta || !data.voices) {
    throw new Error('YAML 文件必须包含 meta 和 voices 字段');
  }

  const { provider, service } = data.meta;
  const voices = [];

  for (const v of data.voices) {
    // 验证必要字段
    if (!v.id || !v.displayName || !v.gender) {
      console.warn(`   ⚠️  跳过无效音色: ${JSON.stringify(v)}`);
      continue;
    }

    // 生成全局唯一 ID
    const globalId = `${provider}-${service || 'tts'}-${v.id}`;

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
      ttsConfig: v.ttsConfig || {}
    });
  }

  return { voices, provider };
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
    // 按提供商分组
    if (!categories.byProvider[voice.provider]) {
      categories.byProvider[voice.provider] = [];
    }
    categories.byProvider[voice.provider].push(voice.id);

    // 按性别分组
    if (voice.gender === 'female') {
      categories.byGender.female.push(voice.id);
    } else if (voice.gender === 'male') {
      categories.byGender.male.push(voice.id);
    }

    // 按语言分组
    for (const lang of voice.languages || []) {
      if (!categories.byLanguage[lang]) {
        categories.byLanguage[lang] = [];
      }
      categories.byLanguage[lang].push(voice.id);
    }

    // 按标签分组
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

// 执行构建
build();