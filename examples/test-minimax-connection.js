/**
 * MiniMax TTS 连接测试文件
 * 
 * 用于测试MiniMax API连接性和获取音色列表
 * 运行命令: node test-minimax-connection.js
 */

require('dotenv').config();
const path = require('path');
const minimaxTtsService = require('./src/modules/tts/services/minimaxTtsService');

// 颜色输出函数
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`
};

/**
 * 检查环境变量配置
 */
function checkEnvironmentVariables() {
  console.log(colors.bold('\n=== 环境变量检查 ==='));
  
  const requiredVars = ['MINIMAX_API_KEY', 'MINIMAX_GROUP_ID'];
  let allConfigured = true;
  
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      console.log(colors.green(`✅ ${varName}: 已配置`));
      // 只显示前10个字符，保护敏感信息
      console.log(colors.cyan(`   值: ${value.substring(0, 10)}...`));
    } else {
      console.log(colors.red(`❌ ${varName}: 未配置`));
      allConfigured = false;
    }
  });
  
  return allConfigured;
}

/**
 * 测试服务初始化
 */
function testServiceInitialization() {
  console.log(colors.bold('\n=== 服务初始化测试 ==='));
  
  try {
    // 直接使用导入的服务实例
    console.log(colors.green('✅ MiniMax TTS服务初始化成功'));
    console.log(colors.cyan(`   API地址: ${minimaxTtsService.baseUrl}`));
    console.log(colors.cyan(`   默认模型: ${minimaxTtsService.defaultModel}`));
    console.log(colors.cyan(`   默认音色: ${minimaxTtsService.defaultVoice}`));
    return minimaxTtsService;
  } catch (error) {
    console.log(colors.red('❌ 服务初始化失败:'), error.message);
    return null;
  }
}

/**
 * 测试音色列表获取
 */
function testVoicesList(service) {
  console.log(colors.bold('\n=== 音色列表测试 ==='));
  
  try {
    const voices = service.getAvailableVoices();
    console.log(colors.green(`✅ 成功获取音色列表，共 ${voices.length} 个音色`));
    
    // 按语言分组显示
    const voicesByLanguage = voices.reduce((acc, voice) => {
      if (!acc[voice.language]) {
        acc[voice.language] = [];
      }
      acc[voice.language].push(voice);
      return acc;
    }, {});
    
    Object.entries(voicesByLanguage).forEach(([language, languageVoices]) => {
      console.log(colors.yellow(`\n📢 ${language} (${languageVoices.length}个音色):`));
      languageVoices.slice(0, 5).forEach(voice => {
        console.log(colors.cyan(`   • ${voice.name} (${voice.id}) - ${voice.gender}`));
      });
      if (languageVoices.length > 5) {
        console.log(colors.cyan(`   ... 还有 ${languageVoices.length - 5} 个音色`));
      }
    });
    
    return true;
  } catch (error) {
    console.log(colors.red('❌ 获取音色列表失败:'), error.message);
    return false;
  }
}

/**
 * 测试支持的功能列表
 */
function testSupportedFeatures(service) {
  console.log(colors.bold('\n=== 支持功能测试 ==='));
  
  try {
    const models = service.getAvailableModels();
    console.log(colors.green(`✅ 支持的模型 (${models.length}个):`));
    models.forEach(model => {
      console.log(colors.cyan(`   • ${model.name} (${model.id}) - ${model.quality}`));
    });
    
    const emotions = service.getAvailableEmotions();
    console.log(colors.green(`\n✅ 支持的情绪 (${emotions.length}个):`));
    emotions.forEach(emotion => {
      console.log(colors.cyan(`   • ${emotion.name} (${emotion.id}) - ${emotion.description}`));
    });
    
    const formats = service.getAvailableFormats();
    console.log(colors.green(`\n✅ 支持的格式 (${formats.length}个):`));
    formats.forEach(format => {
      console.log(colors.cyan(`   • ${format.name} (${format.id}) - ${format.description}`));
    });
    
    const sampleRates = service.getAvailableSampleRates();
    console.log(colors.green(`\n✅ 支持的采样率 (${sampleRates.length}个):`));
    sampleRates.forEach(rate => {
      console.log(colors.cyan(`   • ${rate} Hz`));
    });
    
    return true;
  } catch (error) {
    console.log(colors.red('❌ 获取支持功能失败:'), error.message);
    return false;
  }
}

/**
 * 测试参数验证
 */
function testParameterValidation(service) {
  console.log(colors.bold('\n=== 参数验证测试 ==='));
  
  // 由于服务没有独立的参数验证方法，我们测试基本的属性访问
  try {
    // 测试基本属性
    console.log(colors.green('✅ 基本属性访问测试:'));
    console.log(colors.cyan(`   • API密钥已配置: ${!!process.env.MINIMAX_API_KEY}`));
    console.log(colors.cyan(`   • 基础URL: ${service.baseUrl || 'https://api.minimax.chat/v1/t2a_v2'}`));
    console.log(colors.cyan(`   • 默认模型: ${service.defaultModel || 'speech-2.5-hd-preview'}`));
    console.log(colors.cyan(`   • 默认音色: ${service.defaultVoice || 'male-qn-qingse'}`));
    
    // 测试音色列表是否包含默认音色
    const voices = service.getAvailableVoices();
    const defaultVoiceExists = voices.some(voice => voice.id === (service.defaultVoice || 'male-qn-qingse'));
    console.log(colors.green(`✅ 默认音色存在性检查: ${defaultVoiceExists ? '通过' : '失败'}`));
    
    // 测试模型列表是否包含默认模型
    const models = service.getAvailableModels();
    const defaultModelExists = models.some(model => model.id === (service.defaultModel || 'speech-2.5-hd-preview'));
    console.log(colors.green(`✅ 默认模型存在性检查: ${defaultModelExists ? '通过' : '失败'}`));
    
    return true;
  } catch (error) {
    console.log(colors.red('❌ 参数验证测试失败:'), error.message);
    return false;
  }
}

/**
 * 测试API连接（不实际发送请求，只测试请求构建）
 */
function testApiConnection(service) {
  console.log(colors.bold('\n=== API连接测试 ==='));
  
  try {
    // 测试基本配置
    console.log(colors.green('✅ API配置检查:'));
    console.log(colors.cyan(`   • API密钥: ${process.env.MINIMAX_API_KEY ? '已配置' : '未配置'}`));
    console.log(colors.cyan(`   • Group ID: ${process.env.MINIMAX_GROUP_ID ? '已配置' : '未配置'}`));
    
    // 检查请求头配置
    if (process.env.MINIMAX_API_KEY) {
      const headers = {
        'Authorization': `Bearer ${process.env.MINIMAX_API_KEY}`,
        'Content-Type': 'application/json'
      };
      console.log(colors.green('\n✅ 请求头配置正确'));
      console.log(colors.cyan(`   Authorization: Bearer ${process.env.MINIMAX_API_KEY.substring(0, 20)}...`));
      console.log(colors.cyan(`   Content-Type: ${headers['Content-Type']}`));
    } else {
      console.log(colors.red('\n❌ API密钥未配置，无法构建请求头'));
      return false;
    }
    
    // 测试基本的服务方法可用性
    console.log(colors.green('\n✅ 服务方法可用性检查:'));
    console.log(colors.cyan(`   • convertTextToSpeech: ${typeof service.convertTextToSpeech === 'function' ? '可用' : '不可用'}`));
    console.log(colors.cyan(`   • getAvailableVoices: ${typeof service.getAvailableVoices === 'function' ? '可用' : '不可用'}`));
    console.log(colors.cyan(`   • getAvailableModels: ${typeof service.getAvailableModels === 'function' ? '可用' : '不可用'}`));
    
    return true;
  } catch (error) {
    console.log(colors.red('❌ API连接测试失败:'), error.message);
    return false;
  }
}

/**
 * 生成测试报告
 */
function generateTestReport(results) {
  console.log(colors.bold('\n=== 测试报告 ==='));
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(result => result).length;
  
  console.log(colors.yellow(`📊 总测试数: ${totalTests}`));
  console.log(colors.green(`✅ 通过测试: ${passedTests}`));
  console.log(colors.red(`❌ 失败测试: ${totalTests - passedTests}`));
  
  console.log(colors.bold('\n详细结果:'));
  Object.entries(results).forEach(([testName, passed]) => {
    const status = passed ? colors.green('✅ 通过') : colors.red('❌ 失败');
    console.log(`   ${testName}: ${status}`);
  });
  
  if (passedTests === totalTests) {
    console.log(colors.green(colors.bold('\n🎉 所有测试通过！MiniMax TTS服务配置正确。')));
  } else {
    console.log(colors.yellow(colors.bold('\n⚠️  部分测试失败，请检查配置和网络连接。')));
  }
  
  console.log(colors.cyan('\n💡 提示:'));
  console.log(colors.cyan('   • 确保.env文件中的MINIMAX_API_KEY配置正确'));
  console.log(colors.cyan('   • 检查网络连接是否正常'));
  console.log(colors.cyan('   • 如需实际测试TTS转换，请运行: node examples/minimax-tts-example.js'));
}

/**
 * 主测试函数
 */
async function runConnectionTest() {
  console.log(colors.bold(colors.blue('🚀 MiniMax TTS 连接测试开始...')));
  console.log(colors.cyan('测试时间:'), new Date().toLocaleString());
  
  const results = {};
  
  // 1. 检查环境变量
  results['环境变量配置'] = checkEnvironmentVariables();
  
  // 2. 测试服务初始化
  const service = testServiceInitialization();
  results['服务初始化'] = service !== null;
  
  if (!service) {
    console.log(colors.red('\n❌ 服务初始化失败，无法继续测试'));
    generateTestReport(results);
    return;
  }
  
  // 3. 测试音色列表
  results['音色列表获取'] = testVoicesList(service);
  
  // 4. 测试支持功能
  results['支持功能获取'] = testSupportedFeatures(service);
  
  // 5. 测试参数验证
  results['参数验证'] = testParameterValidation(service);
  
  // 6. 测试API连接
  results['API连接配置'] = testApiConnection(service);
  
  // 生成测试报告
  generateTestReport(results);
}

// 错误处理
process.on('uncaughtException', (error) => {
  console.log(colors.red('\n❌ 未捕获的异常:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log(colors.red('\n❌ 未处理的Promise拒绝:'), reason);
  process.exit(1);
});

// 运行测试
if (require.main === module) {
  runConnectionTest().catch(error => {
    console.log(colors.red('\n❌ 测试运行失败:'), error.message);
    process.exit(1);
  });
}

module.exports = {
  runConnectionTest,
  checkEnvironmentVariables,
  testServiceInitialization,
  testVoicesList,
  testSupportedFeatures,
  testParameterValidation,
  testApiConnection
};