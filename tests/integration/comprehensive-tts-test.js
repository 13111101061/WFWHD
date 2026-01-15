const config = require('../src/shared/config/config');

/**
 * 综合TTS服务连接测试脚本
 * 测试所有配置的TTS服务是否可以正常连接和使用
 */

// 测试用的短文本
const TEST_TEXT = "你好，这是一个测试。";

// 颜色输出函数
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`
};

console.log(colors.cyan('🚀 开始TTS服务连接测试...\n'));

/**
 * 测试阿里云CosyVoice服务
 */
async function testCosyVoiceService() {
  console.log(colors.blue('📡 测试阿里云CosyVoice服务...'));
  
  try {
    // 检查API密钥配置
    if (!config.api.tts.apiKey || config.api.tts.apiKey === 'your-dashscope-api-key-here') {
      console.log(colors.yellow('⚠️  阿里云CosyVoice: API密钥未配置或使用默认值'));
      return false;
    }
    
    const CosyVoiceService = require('../src/modules/tts/services/cosyVoiceService');
    const result = await CosyVoiceService.synthesize(TEST_TEXT, {
      voice: 'longxiaochun_v2',
      format: 'mp3'
    });
    
    if (result && result.audioUrl) {
      console.log(colors.green('✅ 阿里云CosyVoice服务连接成功'));
      console.log(`   音频文件: ${result.audioUrl}`);
      return true;
    } else {
      console.log(colors.red('❌ 阿里云CosyVoice服务测试失败: 未返回音频文件'));
      return false;
    }
  } catch (error) {
    console.log(colors.red(`❌ 阿里云CosyVoice服务连接失败: ${error.message}`));
    return false;
  }
}

/**
 * 测试阿里云千问TTS HTTP服务
 */
async function testQwenTtsHttpService() {
  console.log(colors.blue('📡 测试阿里云千问TTS HTTP服务...'));
  
  try {
    // 检查API密钥配置
    if (!config.api.tts.apiKey || config.api.tts.apiKey === 'your-dashscope-api-key-here') {
      console.log(colors.yellow('⚠️  阿里云千问TTS HTTP: API密钥未配置或使用默认值'));
      return false;
    }
    
    const QwenTtsHttpService = require('../src/modules/tts/services/qwenTtsHttpService');
    const result = await QwenTtsHttpService.synthesize(TEST_TEXT, {
      voice: 'Cherry'
    });
    
    if (result && result.audioUrl) {
      console.log(colors.green('✅ 阿里云千问TTS HTTP服务连接成功'));
      console.log(`   音频文件: ${result.audioUrl}`);
      return true;
    } else {
      console.log(colors.red('❌ 阿里云千问TTS HTTP服务测试失败: 未返回音频文件'));
      return false;
    }
  } catch (error) {
    console.log(colors.red(`❌ 阿里云千问TTS HTTP服务连接失败: ${error.message}`));
    return false;
  }
}

/**
 * 测试腾讯云TTS服务
 */
async function testTencentTtsService() {
  console.log(colors.blue('📡 测试腾讯云TTS服务...'));
  
  try {
    // 检查API密钥配置
    if (!config.api.tencent.secretId || !config.api.tencent.secretKey || 
        config.api.tencent.secretId === 'your-tencent-cloud-secret-id' ||
        config.api.tencent.secretKey === 'your-tencent-cloud-secret-key') {
      console.log(colors.yellow('⚠️  腾讯云TTS: API密钥未配置或使用默认值'));
      return false;
    }
    
    const TencentTtsService = require('../src/modules/tts/services/tencentTtsService');
    const result = await TencentTtsService.synthesize(TEST_TEXT, {
      voiceType: 101001,
      speed: 1.0,
      volume: 5
    });
    
    if (result && result.audioUrl) {
      console.log(colors.green('✅ 腾讯云TTS服务连接成功'));
      console.log(`   音频文件: ${result.audioUrl}`);
      return true;
    } else {
      console.log(colors.red('❌ 腾讯云TTS服务测试失败: 未返回音频文件'));
      return false;
    }
  } catch (error) {
    console.log(colors.red(`❌ 腾讯云TTS服务连接失败: ${error.message}`));
    return false;
  }
}

/**
 * 测试火山引擎TTS服务
 */
async function testVolcengineTtsService() {
  console.log(colors.blue('📡 测试火山引擎TTS服务...'));
  
  try {
    // 检查API密钥配置
    if (!config.api.volcengine.appId || !config.api.volcengine.token || !config.api.volcengine.secretKey || 
        config.api.volcengine.appId === 'your-volcengine-app-id' ||
        config.api.volcengine.token === 'your-volcengine-token' ||
        config.api.volcengine.secretKey === 'your-volcengine-secret-key') {
      console.log(colors.yellow('⚠️  火山引擎TTS: API密钥未配置或使用默认值'));
      return false;
    }
    
    const VolcengineTtsService = require('../src/modules/tts/services/volcengineTtsService');
    const result = await VolcengineTtsService.synthesize(TEST_TEXT, {
      voice_type: 'BV001_streaming',
      speed: 1.0,
      volume: 10
    });
    
    if (result && result.audioUrl) {
      console.log(colors.green('✅ 火山引擎TTS服务连接成功'));
      console.log(`   音频文件: ${result.audioUrl}`);
      return true;
    } else {
      console.log(colors.red('❌ 火山引擎TTS服务测试失败: 未返回音频文件'));
      return false;
    }
  } catch (error) {
    console.log(colors.red(`❌ 火山引擎TTS服务连接失败: ${error.message}`));
    return false;
  }
}

/**
 * 测试统一TTS API
 */
async function testUnifiedTtsApi() {
  console.log(colors.blue('📡 测试统一TTS API...'));
  
  try {
    // 模拟HTTP请求测试统一API
    const response = await fetch('http://localhost:3000/api/unified-tts/voices', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        console.log(colors.green('✅ 统一TTS API连接成功'));
        console.log(`   可用服务数量: ${Object.keys(data.data).length}`);
        return true;
      }
    }
    
    console.log(colors.red('❌ 统一TTS API测试失败'));
    return false;
  } catch (error) {
    console.log(colors.red(`❌ 统一TTS API连接失败: ${error.message}`));
    return false;
  }
}

/**
 * 主测试函数
 */
async function runAllTests() {
  console.log(colors.cyan('🔧 当前配置检查:'));
  console.log(`   服务器端口: ${config.server.port}`);
  console.log(`   API密钥数量: ${config.server.apiKeys.length}`);
  console.log(`   阿里云API密钥: ${config.api.tts.apiKey ? '已配置' : '未配置'}`);
  console.log(`   腾讯云API密钥: ${config.api.tencent.secretId ? '已配置' : '未配置'}`);
  console.log(`   火山引擎API密钥: ${config.api.volcengine.appId ? '已配置' : '未配置'}`);
  console.log('');
  
  const results = [];
  
  // 测试各个服务
  results.push(await testCosyVoiceService());
  console.log('');
  
  results.push(await testQwenTtsHttpService());
  console.log('');
  
  results.push(await testTencentTtsService());
  console.log('');
  
  results.push(await testVolcengineTtsService());
  console.log('');
  
  results.push(await testUnifiedTtsApi());
  console.log('');
  
  // 汇总结果
  const successCount = results.filter(r => r).length;
  const totalCount = results.length;
  
  console.log(colors.cyan('📊 测试结果汇总:'));
  console.log(`   成功: ${colors.green(successCount)} / ${totalCount}`);
  console.log(`   失败: ${colors.red(totalCount - successCount)} / ${totalCount}`);
  
  if (successCount === totalCount) {
    console.log(colors.green('\n🎉 所有TTS服务连接测试通过！'));
  } else if (successCount > 0) {
    console.log(colors.yellow('\n⚠️  部分TTS服务连接成功，请检查失败的服务配置'));
  } else {
    console.log(colors.red('\n❌ 所有TTS服务连接失败，请检查网络和API密钥配置'));
  }
  
  return successCount === totalCount;
}

// 如果直接运行此脚本
if (require.main === module) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error(colors.red(`测试过程中发生错误: ${error.message}`));
      process.exit(1);
    });
}

module.exports = {
  runAllTests,
  testCosyVoiceService,
  testQwenTtsHttpService,
  testTencentTtsService,
  testVolcengineTtsService,
  testUnifiedTtsApi
};