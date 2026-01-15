const { voiceModelRegistry } = require('../src/modules/tts/config/VoiceModelRegistry');

async function verify() {
  try {
    await voiceModelRegistry.initialize();
    const stats = voiceModelRegistry.getStats();

    console.log('🎵 音色库状态验证');
    console.log('='.repeat(50));
    console.log('✅ 音色库加载成功!');
    console.log('');
    console.log('📊 统计信息:');
    console.log('  - 总模型数:', stats.totalModels);
    console.log('  - 服务商数:', stats.totalProviders);
    console.log('  - 标签数:', stats.totalTags);
    console.log('  - 加载状态:', stats.isLoaded ? '已加载' : '未加载');
    console.log('');
    console.log('🏢 服务商列表:');
    const providers = voiceModelRegistry.getProviders();
    providers.forEach(provider => {
      const models = voiceModelRegistry.getModelsByProvider(provider);
      console.log(`  - ${provider}: ${models.length} 个模型`);
    });
    console.log('');
    console.log('🏷️  标签列表:');
    const tags = voiceModelRegistry.getTags();
    Object.entries(tags).forEach(([tag, info]) => {
      console.log(`  - ${tag} (${info.name}): ${info.count} 个模型`);
    });
    console.log('');
    console.log('🔍 示例模型详情:');
    const sampleModels = [
      'aliyun-cosyvoice-longxiaochun',
      'tencent-tts-101001',
      'volcengine-http-bv001-streaming'
    ];
    sampleModels.forEach(modelId => {
      const model = voiceModelRegistry.getModel(modelId);
      if (model) {
        console.log(`\n  ${modelId}:`);
        console.log(`    - 名称: ${model.name}`);
        console.log(`    - 服务商: ${model.provider}`);
        console.log(`    - 音色ID: ${model.voiceId}`);
        console.log(`    - 标签: ${model.tags ? model.tags.join(', ') : '无'}`);
      }
    });

  } catch (error) {
    console.error('❌ 音色库加载失败:', error.message);
    console.error(error.stack);
  }
}

verify();
