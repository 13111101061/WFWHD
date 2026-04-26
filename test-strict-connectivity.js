/**
 * 严格联通性测试 - 实际调用 API
 */

require('dotenv').config();

const credentials = require('./src/modules/credentials');
credentials.initialize();

console.log('========================================');
console.log('TTS 服务商严格联通性测试（实际调用 API）');
console.log('========================================\n');

const TEST_TEXT = '你好，这是一个联通性测试。';

// 1. 测试 aliyun_qwen_http
async function testQwenHttp() {
  console.log('--- 测试 aliyun_qwen_http ---');
  try {
    const AliyunQwenAdapter = require('./src/modules/tts/adapters/providers/AliyunQwenAdapter');
    const adapter = new AliyunQwenAdapter();
    
    console.log('适配器创建: ✅');
    console.log('provider:', adapter.provider);
    console.log('serviceType:', adapter.serviceType);
    
    // 检查凭据
    const creds = adapter._getCredentials();
    console.log('凭据获取:', creds && creds.apiKey ? '✅' : '❌');
    
    // 实际调用 API
    console.log('正在发送 API 请求...');
    const result = await adapter.synthesize(TEST_TEXT, {
      voice: 'Cherry',
      model: 'qwen3-tts-instruct-flash'
    });
    
    console.log('API 响应: ✅');
    console.log('  audioUrl:', result.audioUrl ? result.audioUrl.substring(0, 60) + '...' : '❌ 无');
    console.log('  format:', result.format);
    console.log('  provider:', result.provider);
    console.log('  audioId:', result.audioId);
    console.log('  expiresAt:', result.expiresAt);
    
    return true;
  } catch (error) {
    console.log('❌ 测试失败:', error.message);
    console.log('   code:', error.code);
    console.log('   provider:', error.provider);
    console.log('   serviceType:', error.serviceType);
    return false;
  }
}

// 2. 测试 aliyun_cosyvoice
async function testCosyVoice() {
  console.log('\n--- 测试 aliyun_cosyvoice ---');
  try {
    const AliyunCosyVoiceAdapter = require('./src/modules/tts/adapters/providers/AliyunCosyVoiceAdapter');
    const adapter = new AliyunCosyVoiceAdapter();
    
    console.log('适配器创建: ✅');
    console.log('provider:', adapter.provider);
    console.log('serviceType:', adapter.serviceType);
    console.log('endpoint:', adapter.endpoint);
    
    // 检查凭据
    const creds = adapter._getCredentials();
    console.log('凭据获取:', creds && creds.apiKey ? '✅' : '❌');
    
    // 实际调用 API（WebSocket）
    console.log('正在连接 WebSocket...');
    const result = await adapter.synthesize(TEST_TEXT, {
      voice: 'longxiaochun',
      format: 'mp3'
    });
    
    console.log('WebSocket 响应: ✅');
    console.log('  audio buffer size:', result.audio ? result.audio.length + ' bytes' : '❌ 无');
    console.log('  format:', result.format);
    console.log('  provider:', result.provider);
    
    return true;
  } catch (error) {
    console.log('❌ 测试失败:', error.message);
    console.log('   code:', error.code);
    console.log('   provider:', error.provider);
    console.log('   serviceType:', error.serviceType);
    return false;
  }
}

// 执行
(async () => {
  const qwenOk = await testQwenHttp();
  const cosyOk = await testCosyVoice();
  
  console.log('\n========================================');
  console.log('测试结果汇总');
  console.log('========================================');
  console.log('aliyun_qwen_http :', qwenOk ? '✅ 联通' : '❌ 失败');
  console.log('aliyun_cosyvoice :', cosyOk ? '✅ 联通' : '❌ 失败');
  console.log('========================================');
  
  process.exit(0);
})();
