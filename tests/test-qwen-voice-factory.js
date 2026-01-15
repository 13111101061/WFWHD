/**
 * Qwen TTS 音色工厂测试脚本
 * 测试完整的流程：音色工厂 → ID转译 → 参数映射 → API调用
 */

const { voiceModelMapper } = require('../src/modules/tts/config/VoiceModelMapper');
const { voiceModelRegistry } = require('../src/modules/tts/config/VoiceModelRegistry');
const { parameterMapper } = require('../src/modules/tts/config/ParameterMapper');

console.log('========================================');
console.log('🧪 Qwen TTS 音色工厂测试');
console.log('========================================\n');

async function testQwenVoiceFactory() {
  try {
    // 1. 初始化音色工厂
    console.log('1️⃣  初始化音色工厂...');
    await voiceModelRegistry.initialize();
    await voiceModelMapper.initialize();
    await parameterMapper.initialize();
    console.log('✅ 音色工厂初始化成功\n');

    // 2. 测试查询所有 Qwen 音色
    console.log('2️⃣  查询所有 Qwen 音色...');
    const qwenVoices = voiceModelRegistry.getModelsByProvider('aliyun')
      .filter(m => m.service === 'qwen');

    console.log(`找到 ${qwenVoices.length} 个 Qwen 音色:`);
    qwenVoices.forEach(voice => {
      console.log(`   - ${voice.name} (${voice.id})`);
      console.log(`     voiceId: ${voice.voiceId}`);
      console.log(`     语言: ${voice.languages.join(', ')}`);
      console.log(`     标签: ${voice.tags.join(', ')}`);
    });
    console.log('');

    // 3. 测试 systemId → providerParams 转换
    console.log('3️⃣  测试 systemId → providerParams 转换...');
    const testSystemId = 'aliyun-qwen-cherry';
    console.log(`输入 systemId: ${testSystemId}`);

    const providerParams = voiceModelMapper.systemIdToProviderParams(testSystemId);
    console.log('转译结果:');
    console.log(JSON.stringify(providerParams, null, 2));
    console.log('');

    // 4. 测试参数映射
    console.log('4️⃣  测试参数映射 (统一参数 → Qwen API参数)...');
    const userParams = {
      voice: 'Cherry',
      sample_rate: 24000
    };

    console.log('用户输入参数:');
    console.log(JSON.stringify(userParams, null, 2));

    const apiParams = parameterMapper.mapAndValidate(
      providerParams.provider,
      providerParams.serviceType,
      userParams
    );

    console.log('\n映射后的 API 参数:');
    console.log(JSON.stringify(apiParams, null, 2));
    console.log('');

    // 5. 测试反向查询
    console.log('5️⃣  测试 providerVoiceId → systemId 反向查询...');
    const testVoiceId = 'Cherry';
    const foundSystemId = voiceModelMapper.providerIdToSystemId(testVoiceId, 'aliyun');
    console.log(`voiceId: ${testVoiceId}`);
    console.log(`→ systemId: ${foundSystemId}`);
    console.log('');

    // 6. 测试分类查询
    console.log('6️⃣  测试按标签查询 Qwen 音色...');
    const bilingualVoices = voiceModelRegistry.getModelsByTag('bilingual');
    const qwenBilingual = bilingualVoices.filter(v => v.provider === 'aliyun' && v.service === 'qwen');
    console.log(`Qwen 双语音色 (${qwenBilingual.length} 个):`);
    qwenBilingual.forEach(voice => {
      console.log(`   - ${voice.name} (${voice.languages.join(', ')})`);
    });
    console.log('');

    // 7. 测试统计信息
    console.log('7️⃣  音色工厂统计信息...');
    const stats = voiceModelRegistry.getStats();
    console.log(`总音色数: ${stats.totalModels}`);
    console.log(`总提供商数: ${stats.totalProviders}`);
    console.log(`总标签数: ${stats.totalTags}`);
    console.log(`已加载: ${stats.isLoaded}`);
    console.log('');

    // 8. 测试真实 API 调用 (如果配置了 API Key)
    console.log('8️⃣  测试真实 Qwen TTS API 调用...');
    const config = require('../src/shared/config/config');
    const qwenApiKey = config.api.qwen.apiKey || config.api.tts.apiKey;

    if (qwenApiKey && qwenApiKey !== 'dev-api-key') {
      console.log(`✅ 检测到 Qwen API Key (${qwenApiKey.substring(0, 10)}...)`);

      try {
        // QwenTtsHttpService 导出的是单例，不是类
        const qwenService = require('../src/modules/tts/services/qwenTtsHttpService');

        // 更新 API key
        qwenService.apiKey = qwenApiKey;

        console.log('\n正在调用 Qwen TTS API...');
        console.log('测试文本: "你好，这是一个测试"');
        console.log('测试音色: Cherry\n');

        const result = await qwenService.synthesize('你好，这是一个测试', {
          voice: 'Cherry',
          model: 'qwen3-tts-flash'  // 使用 qwen3-tts-flash 模型（无连字符）
        });

        console.log('✅ API 调用成功!');
        console.log(`音频文件: ${result.fileName}`);
        console.log(`文件路径: ${result.filePath}`);
        console.log(`音频URL: ${result.audioUrl}`);
        console.log(`任务ID: ${result.taskId}`);
        console.log(`模型: ${result.model}`);
        console.log(`格式: ${result.format}`);

      } catch (apiError) {
        console.error('❌ API 调用失败:');
        console.error(`错误类型: ${apiError.constructor.name}`);
        console.error(`错误信息: ${apiError.message}`);
      }

    } else {
      console.log('⚠️  未配置 Qwen API Key，跳过 API 调用测试');
      console.log('   请在 .env 文件中设置 QWEN_API_KEY 或 TTS_API_KEY');
    }

    console.log('\n========================================');
    console.log('✅ 测试完成！');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ 测试失败:');
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
testQwenVoiceFactory().catch(error => {
  console.error('\n❌ 未捕获的错误:');
  console.error(error);
  process.exit(1);
});
