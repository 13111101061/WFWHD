/**
 * 测试脚本：测试 Kai 音色通过音色工厂调用
 *
 * 测试目标：
 * 1. 验证音色工厂能否正确加载 Kai 音色配置
 * 2. 验证能否通过音色工厂成功调用 TTS 合成
 * 3. 验证返回的音频数据格式是否正确
 */

const { voiceModelRegistry } = require('../src/modules/tts/config/VoiceModelRegistry');
const { ttsFactory } = require('../src/modules/tts/core/TtsFactory');
const path = require('path');

// 测试配置
const TEST_CONFIG = {
  apiKey: process.env.TTS_API_KEY || process.env.QWEN_API_KEY,
  text: "你好，我是Kai，这是一个测试语音。Hello, this is a test voice.",
  voiceId: "aliyun-qwen-kai",  // Kai 的系统ID
  expectedVoiceName: "Kai"
};

/**
 * 测试1: 验证音色注册表加载
 */
async function testVoiceRegistry() {
  console.log('\n========== 测试1: 验证音色注册表加载 ==========');

  try {
    // 初始化音色注册表
    await voiceModelRegistry.initialize();

    // 获取 Kai 音色信息
    const kaiVoice = voiceModelRegistry.getVoiceById(TEST_CONFIG.voiceId);

    if (!kaiVoice) {
      console.error('❌ 失败：未找到 Kai 音色');
      return false;
    }

    console.log('✅ 成功：Kai 音色已加载');
    console.log('音色信息:');
    console.log(`  - 系统ID: ${kaiVoice.id}`);
    console.log(`  - 名称: ${kaiVoice.name}`);
    console.log(`  - 服务商: ${kaiVoice.provider}`);
    console.log(`  - 服务类型: ${kaiVoice.service}`);
    console.log(`  - 音色ID: ${kaiVoice.voiceId}`);
    console.log(`  - 模型: ${kaiVoice.model}`);
    console.log(`  - 性别: ${kaiVoice.gender}`);
    console.log(`  - 语言: ${kaiVoice.languages.join(', ')}`);
    console.log(`  - 标签: ${kaiVoice.tags.join(', ')}`);

    return kaiVoice;
  } catch (error) {
    console.error('❌ 音色注册表加载失败:', error.message);
    return false;
  }
}

/**
 * 测试2: 验证音色工厂创建服务
 */
async function testTtsFactory() {
  console.log('\n========== 测试2: 验证音色工厂创建服务 ==========');

  try {
    // 通过音色工厂获取 Qwen 服务
    const qwenService = ttsFactory.createService('aliyun', 'qwen_http');

    if (!qwenService) {
      console.error('❌ 失败：音色工厂未能创建 Qwen 服务');
      return false;
    }

    console.log('✅ 成功：音色工厂已创建 Qwen 服务');
    console.log('服务信息:');
    console.log(`  - 服务商: ${qwenService.provider}`);
    console.log(`  - 服务类型: ${qwenService.serviceType}`);
    console.log(`  - API密钥: ${qwenService.apiKey ? qwenService.apiKey.substring(0, 10) + '...' : '未配置'}`);

    return qwenService;
  } catch (error) {
    console.error('❌ 音色工厂创建服务失败:', error.message);
    return false;
  }
}

/**
 * 测试3: 执行 TTS 合成
 */
async function testSynthesis(service) {
  console.log('\n========== 测试3: 执行 TTS 合成 ==========');
  console.log(`测试文本: "${TEST_CONFIG.text}"`);
  console.log(`使用音色: ${TEST_CONFIG.expectedVoiceName} (ID: ${TEST_CONFIG.voiceId})`);

  try {
    // 从音色配置中获取实际的 voiceId
    const voiceConfig = voiceModelRegistry.getVoiceById(TEST_CONFIG.voiceId);

    if (!voiceConfig) {
      console.error('❌ 失败：未找到音色配置');
      return false;
    }

    console.log('\n正在调用 TTS API...');

    // 执行合成
    const result = await service.synthesize(TEST_CONFIG.text, {
      voice: voiceConfig.voiceId,  // 使用服务商的音色ID
      model: voiceConfig.model,
      language_type: 'Auto'
    });

    if (!result) {
      console.error('❌ 失败：合成返回结果为空');
      return false;
    }

    console.log('\n✅ 成功：TTS 合成完成');
    console.log('合成结果:');
    console.log(`  - 原文: ${result.text}`);
    console.log(`  - 音色: ${result.voice}`);
    console.log(`  - 模型: ${result.model}`);
    console.log(`  - 格式: ${result.format}`);
    console.log(`  - 任务ID: ${result.taskId}`);
    console.log(`  - 音频URL: ${result.audioUrl}`);
    console.log(`  - 文件路径: ${result.filePath}`);
    console.log(`  - 文件名: ${result.fileName}`);
    console.log(`  - 时长: ${result.duration}秒`);
    console.log(`  - 创建时间: ${result.createdAt}`);

    return result;
  } catch (error) {
    console.error('\n❌ TTS 合成失败:', error.message);
    console.error('错误详情:', error);
    return false;
  }
}

/**
 * 测试4: 验证音频文件
 */
async function testAudioFile(result) {
  console.log('\n========== 测试4: 验证音频文件 ==========');

  try {
    const fs = require('fs');

    if (!result.filePath) {
      console.error('❌ 失败：音频文件路径为空');
      return false;
    }

    // 检查文件是否存在
    if (!fs.existsSync(result.filePath)) {
      console.error('❌ 失败：音频文件不存在');
      return false;
    }

    // 获取文件信息
    const stats = fs.statSync(result.filePath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);

    console.log('✅ 成功：音频文件已保存');
    console.log('文件信息:');
    console.log(`  - 文件路径: ${result.filePath}`);
    console.log(`  - 文件大小: ${fileSizeKB} KB`);
    console.log(`  - 文件格式: ${result.format}`);

    return true;
  } catch (error) {
    console.error('❌ 音频文件验证失败:', error.message);
    return false;
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('========================================');
  console.log('   Kai 音色工厂集成测试');
  console.log('========================================');
  console.log(`测试时间: ${new Date().toLocaleString('zh-CN')}`);

  // 检查 API 密钥
  if (!TEST_CONFIG.apiKey) {
    console.error('\n❌ 错误：未设置 API 密钥');
    console.error('请设置环境变量：');
    console.error('  export TTS_API_KEY=your_api_key');
    console.error('  或');
    console.error('  export QWEN_API_KEY=your_api_key');
    process.exit(1);
  }

  console.log(`\n✅ API 密钥已配置: ${TEST_CONFIG.apiKey.substring(0, 10)}...`);

  try {
    // 测试1: 音色注册表
    const kaiVoice = await testVoiceRegistry();
    if (!kaiVoice) {
      console.error('\n❌ 测试失败：音色注册表测试未通过');
      process.exit(1);
    }

    // 测试2: 音色工厂
    const service = await testTtsFactory();
    if (!service) {
      console.error('\n❌ 测试失败：音色工厂测试未通过');
      process.exit(1);
    }

    // 测试3: TTS 合成
    const result = await testSynthesis(service);
    if (!result) {
      console.error('\n❌ 测试失败：TTS 合成测试未通过');
      process.exit(1);
    }

    // 测试4: 音频文件验证
    const audioOk = await testAudioFile(result);
    if (!audioOk) {
      console.error('\n❌ 测试失败：音频文件验证未通过');
      process.exit(1);
    }

    // 所有测试通过
    console.log('\n========================================');
    console.log('   ✅ 所有测试通过！');
    console.log('========================================');
    console.log('\n测试总结:');
    console.log('  ✅ 音色注册表：正常');
    console.log('  ✅ 音色工厂：正常');
    console.log('  ✅ TTS 合成：正常');
    console.log('  ✅ 音频文件：正常');
    console.log('\n🎉 Kai 音色可以正常使用音色工厂调用！');
    console.log(`\n音频文件位置: ${result.filePath}`);

  } catch (error) {
    console.error('\n========================================');
    console.error('   ❌ 测试异常终止');
    console.error('========================================');
    console.error('错误信息:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  runTests()
    .then(() => {
      console.log('\n测试完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n测试失败:', error);
      process.exit(1);
    });
}

module.exports = { runTests };
