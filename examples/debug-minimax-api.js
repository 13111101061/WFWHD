/**
 * MiniMax TTS API调试工具
 * 用于诊断API调用问题
 */

require('dotenv').config();
const minimaxTtsService = require('./src/modules/tts/services/minimaxTtsService');

const colors = {
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`
};

async function debugApiCall() {
  console.log(colors.bold('🔍 MiniMax TTS API调试工具\n'));

  // 1. 检查环境变量
  console.log(colors.bold('=== 环境变量检查 ==='));
  console.log(`API Key: ${process.env.MINIMAX_API_KEY ? '已配置' : '未配置'}`);
  console.log(`Group ID: ${process.env.MINIMAX_GROUP_ID ? '已配置' : '未配置'}`);
  
  if (process.env.MINIMAX_API_KEY) {
    console.log(`API Key前缀: ${process.env.MINIMAX_API_KEY.substring(0, 20)}...`);
  }
  
  if (process.env.MINIMAX_GROUP_ID) {
    console.log(`Group ID: ${process.env.MINIMAX_GROUP_ID}`);
  }

  // 2. 测试简单的TTS转换
  console.log(colors.bold('\n=== 简单TTS转换测试 ==='));
  
  try {
    const result = await minimaxTtsService.convertTextToSpeech('你好，这是一个测试。', {
      voice_id: 'male-qn-qingse',
      model: 'speech-01-turbo',
      format: 'mp3',
      sample_rate: 22050
    });

    console.log(colors.green('✅ TTS转换成功！'));
    console.log(`音频数据类型: ${typeof result.audioData}`);
    console.log(`音频数据长度: ${result.audioData ? result.audioData.length : 0} 字节`);
    
    if (result.metadata) {
      console.log('元数据:', result.metadata);
    }

  } catch (error) {
    console.log(colors.red('❌ TTS转换失败'));
    console.log('错误详情:');
    console.log(`  类型: ${error.constructor.name}`);
    console.log(`  消息: ${error.message}`);
    
    if (error.response) {
      console.log(`  HTTP状态: ${error.response.status}`);
      console.log(`  响应数据: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    
    if (error.request) {
      console.log('  请求配置:');
      console.log(`    URL: ${error.request.url || error.config?.url}`);
      console.log(`    方法: ${error.request.method || error.config?.method}`);
      console.log(`    请求头: ${JSON.stringify(error.config?.headers, null, 2)}`);
    }
    
    console.log('  完整错误栈:');
    console.log(error.stack);
  }

  // 3. 测试音色列表获取
  console.log(colors.bold('\n=== 音色列表获取测试 ==='));
  
  try {
    const voices = await minimaxTtsService.getAvailableVoices();
    console.log(colors.green(`✅ 获取到 ${voices.length} 个音色`));
    
    // 显示前3个音色
    voices.slice(0, 3).forEach((voice, index) => {
      console.log(`  ${index + 1}. ${voice.name} (${voice.id}) - ${voice.description}`);
    });
    
  } catch (error) {
    console.log(colors.red('❌ 音色列表获取失败'));
    console.log(`错误: ${error.message}`);
  }

  // 4. 测试模型列表获取
  console.log(colors.bold('\n=== 模型列表获取测试 ==='));
  
  try {
    const models = await minimaxTtsService.getAvailableModels();
    console.log(colors.green(`✅ 获取到 ${models.length} 个模型`));
    
    models.forEach((model, index) => {
      console.log(`  ${index + 1}. ${model.name} (${model.id}) - ${model.quality}`);
    });
    
  } catch (error) {
    console.log(colors.red('❌ 模型列表获取失败'));
    console.log(`错误: ${error.message}`);
  }

  console.log(colors.bold('\n🔍 调试完成'));
}

// 运行调试
if (require.main === module) {
  debugApiCall().catch(error => {
    console.error(colors.red('调试过程中发生未捕获的错误:'));
    console.error(error);
    process.exit(1);
  });
}

module.exports = { debugApiCall };