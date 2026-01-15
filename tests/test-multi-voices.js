/**
 * 测试多个音色通过音色工厂的可用性
 */

const { voiceModelRegistry } = require('../src/modules/tts/config/VoiceModelRegistry');
const { ttsFactory } = require('../src/modules/tts/core/TtsFactory');

// 测试配置
const TEST_VOICES = [
  { systemId: 'aliyun-qwen-cherry', name: 'Cherry', text: '你好，我是Cherry。' },
  { systemId: 'aliyun-qwen-kai', name: 'Kai', text: '你好，我是Kai。' },
  { systemId: 'aliyun-qwen-momo', name: 'Momo', text: '你好，我是Momo，很可爱哦！' },
  { systemId: 'aliyun-qwen-ethan', name: 'Ethan', text: 'Hello, I am Ethan.' }
];

async function testMultiVoices() {
  console.log('========================================');
  console.log('   多音色工厂可用性测试');
  console.log('========================================\n');

  try {
    // 初始化音色注册表
    await voiceModelRegistry.initialize();
    console.log(`✅ 音色注册表加载完成，共 ${voiceModelRegistry.getAllModels().length} 个音色\n`);

    // 创建Qwen服务
    const qwenService = ttsFactory.createService('aliyun', 'qwen_http');
    console.log('✅ Qwen HTTP服务创建成功\n');

    // 测试每个音色
    const results = [];

    for (const voiceConfig of TEST_VOICES) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🎙️  测试音色: ${voiceConfig.name} (${voiceConfig.systemId})`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      try {
        // 获取音色配置
        const voice = voiceModelRegistry.getVoiceById(voiceConfig.systemId);
        if (!voice) {
          console.log(`❌ 失败：未找到音色配置\n`);
          results.push({ voice: voiceConfig.name, success: false, error: '未找到配置' });
          continue;
        }

        console.log(`音色ID: ${voice.voiceId}`);
        console.log(`语言: ${voice.languages.join(', ')}`);
        console.log(`标签: ${voice.tags.join(', ')}`);
        console.log(`测试文本: "${voiceConfig.text}"`);

        // 调用TTS
        const startTime = Date.now();
        const result = await qwenService.synthesize(voiceConfig.text, {
          voice: voice.voiceId,
          language_type: 'Auto'
        });
        const duration = Date.now() - startTime;

        console.log(`✅ 成功！耗时: ${duration}ms`);
        console.log(`文件大小: ${Math.round(result.fileName ? 0 : 0)} KB`);
        console.log(`音频URL: ${result.audioUrl}\n`);

        results.push({
          voice: voiceConfig.name,
          success: true,
          duration: duration,
          filePath: result.filePath
        });

      } catch (error) {
        console.log(`❌ 失败: ${error.message}\n`);
        results.push({ voice: voiceConfig.name, success: false, error: error.message });
      }
    }

    // 汇总结果
    console.log('========================================');
    console.log('   测试结果汇总');
    console.log('========================================\n');

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`总计: ${results.length} 个音色`);
    console.log(`✅ 成功: ${successCount} 个`);
    console.log(`❌ 失败: ${failCount} 个\n`);

    console.log('详细结果:');
    results.forEach(r => {
      const status = r.success ? '✅' : '❌';
      const duration = r.duration ? `${r.duration}ms` : 'N/A';
      console.log(`  ${status} ${r.voice}: ${duration}`);
      if (!r.success && r.error) {
        console.log(`     错误: ${r.error}`);
      }
    });

    console.log();

    if (failCount === 0) {
      console.log('🎉 所有音色测试通过！音色工厂完全可用！');
      return true;
    } else {
      console.log('⚠️  部分音色测试失败，请检查错误信息');
      return false;
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 运行测试
if (require.main === module) {
  testMultiVoices()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ 测试异常:', error);
      process.exit(1);
    });
}

module.exports = { testMultiVoices };
