/**
 * 直接测试Kai音色通过音色工厂的完整调用流程
 *
 * 测试流程：
 * 1. 从音色注册表获取Kai配置
 * 2. 通过音色工厂创建服务
 * 3. 使用正确的voiceId参数调用TTS
 * 4. 验证音频生成
 */

const { voiceModelRegistry } = require('../src/modules/tts/config/VoiceModelRegistry');
const { ttsFactory } = require('../src/modules/tts/core/TtsFactory');
const fs = require('fs');

// 测试配置
const TEST_CONFIG = {
  text: "你好，我是Kai，今天天气真不错。Hello, this is Kai speaking.",
  voiceSystemId: "aliyun-qwen-kai"  // Kai的系统ID
};

/**
 * 主测试函数
 */
async function testKaiVoiceFactory() {
  console.log('========================================');
  console.log('   Kai音色工厂直接调用测试');
  console.log('========================================');
  console.log(`测试时间: ${new Date().toLocaleString('zh-CN')}\n`);

  try {
    // 步骤1: 初始化音色注册表并获取Kai配置
    console.log('📋 步骤1: 获取Kai音色配置');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await voiceModelRegistry.initialize();

    const kaiVoice = voiceModelRegistry.getVoiceById(TEST_CONFIG.voiceSystemId);
    if (!kaiVoice) {
      throw new Error(`未找到音色: ${TEST_CONFIG.voiceSystemId}`);
    }

    console.log('✅ Kai音色配置加载成功');
    console.log(`  系统ID: ${kaiVoice.id}`);
    console.log(`  名称: ${kaiVoice.name}`);
    console.log(`  服务商: ${kaiVoice.provider}`);
    console.log(`  服务类型: ${kaiVoice.service}`);
    console.log(`  音色ID(voiceId): ${kaiVoice.voiceId}`);
    console.log(`  模型: ${kaiVoice.model}`);
    console.log(`  语言: ${kaiVoice.languages.join(', ')}`);
    console.log(`  特性: ${kaiVoice.tags.join(', ')}\n`);

    // 步骤2: 通过音色工厂创建服务
    console.log('🏭 步骤2: 通过音色工厂创建服务');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const qwenService = ttsFactory.createService(kaiVoice.provider, kaiVoice.service);
    if (!qwenService) {
      throw new Error('音色工厂未能创建服务');
    }

    console.log('✅ 服务创建成功');
    console.log(`  服务商: ${qwenService.provider}`);
    console.log(`  服务类型: ${qwenService.serviceType}\n`);

    // 步骤3: 调用TTS合成
    console.log('🎙️  步骤3: 调用TTS合成');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`测试文本: "${TEST_CONFIG.text}"`);
    console.log(`使用音色: ${kaiVoice.name} (voiceId: ${kaiVoice.voiceId})\n`);

    // 重要：使用 voiceId 字段而非 model 字段
    const synthesisResult = await qwenService.synthesize(TEST_CONFIG.text, {
      voice: kaiVoice.voiceId,  // 使用配置中的 voiceId: "Kai"
      language_type: 'Auto'
    });

    if (!synthesisResult) {
      throw new Error('TTS合成失败：返回结果为空');
    }

    console.log('✅ TTS合成完成\n');
    console.log('📊 合成结果:');
    console.log(`  原文: ${synthesisResult.text}`);
    console.log(`  音色: ${synthesisResult.voice}`);
    console.log(`  模型: ${synthesisResult.model}`);
    console.log(`  格式: ${synthesisResult.format}`);
    console.log(`  任务ID: ${synthesisResult.taskId}`);
    console.log(`  音频URL: ${synthesisResult.audioUrl}`);
    console.log(`  文件路径: ${synthesisResult.filePath}`);
    console.log(`  文件名: ${synthesisResult.fileName}`);
    console.log(`  时长: ${synthesisResult.duration}秒`);
    console.log(`  创建时间: ${synthesisResult.createdAt}\n`);

    // 步骤4: 验证音频文件
    console.log('🎵 步骤4: 验证音频文件');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (!synthesisResult.filePath || !fs.existsSync(synthesisResult.filePath)) {
      throw new Error('音频文件不存在或路径为空');
    }

    const stats = fs.statSync(synthesisResult.filePath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);

    console.log('✅ 音频文件验证成功');
    console.log(`  文件路径: ${synthesisResult.filePath}`);
    console.log(`  文件大小: ${fileSizeKB} KB`);
    console.log(`  文件格式: ${synthesisResult.format}\n`);

    // 测试总结
    console.log('========================================');
    console.log('   ✅ 所有测试通过！');
    console.log('========================================\n');
    console.log('📋 测试总结:');
    console.log('  ✅ 音色注册表：正常加载Kai配置');
    console.log('  ✅ 音色工厂：成功创建qwen_http服务');
    console.log('  ✅ TTS合成：正确使用Kai音色生成音频');
    console.log('  ✅ 音频文件：文件已保存并验证\n');
    console.log(`🎉 Kai音色完全可用！`);
    console.log(`📁 音频文件位置: ${synthesisResult.filePath}\n`);

    return synthesisResult;

  } catch (error) {
    console.error('\n========================================');
    console.error('   ❌ 测试失败');
    console.error('========================================\n');
    console.error(`错误信息: ${error.message}`);
    console.error(`错误堆栈: ${error.stack}\n`);
    throw error;
  }
}

// 运行测试
if (require.main === module) {
  testKaiVoiceFactory()
    .then(() => {
      console.log('✅ 测试完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 测试失败:', error.message);
      process.exit(1);
    });
}

module.exports = { testKaiVoiceFactory };
