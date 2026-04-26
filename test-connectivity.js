/**
 * 测试阿里云两个服务商的密钥加载和联通性
 */

const path = require('path');

// 设置环境变量（确保 dotenv 能加载）
require('dotenv').config();

// 加载凭证模块
const credentials = require('./src/modules/credentials');

// 初始化凭证注册表
credentials.initialize();

console.log('========================================');
console.log('TTS 服务商密钥检查 + 联通性测试');
console.log('========================================\n');

// 1. 检查密钥加载
console.log('[1/3] 检查密钥加载情况...\n');

const aliyunCreds = credentials.getCredentials('aliyun');
console.log('阿里云凭据:', aliyunCreds ? '✅ 已加载' : '❌ 未加载');
if (aliyunCreds) {
  console.log('  apiKey:', aliyunCreds.apiKey ? aliyunCreds.apiKey.substring(0, 10) + '...' : '❌ 空');
}

const isConfigured = credentials.isConfigured('aliyun');
console.log('阿里云配置状态:', isConfigured ? '✅ 已配置' : '❌ 未配置');

const isServiceAvailable = credentials.isServiceAvailable('aliyun', 'qwen_http');
console.log('qwen_http 服务:', isServiceAvailable ? '✅ 可用' : '❌ 不可用');

const isCosyVoiceAvailable = credentials.isServiceAvailable('aliyun', 'cosyvoice');
console.log('cosyvoice 服务:', isCosyVoiceAvailable ? '✅ 可用' : '❌ 不可用');

console.log('\n[2/3] 检查所有服务商配置状态...\n');
const allProviders = credentials.listProviders();
allProviders.forEach(p => {
  console.log(`${p.name} (${p.key}): ${p.configured ? '✅' : '❌'} (${p.services.map(s => s.key).join(', ')})`);
});

// 2. 测试联通性
console.log('\n[3/3] 测试 API 联通性...\n');

async function testQwenHttp() {
  console.log('--- 测试 aliyun_qwen_http ---');
  try {
    const AliyunQwenAdapter = require('./src/modules/tts/adapters/providers/AliyunQwenAdapter');
    const adapter = new AliyunQwenAdapter();
    
    console.log('适配器创建: ✅');
    console.log('provider:', adapter.provider);
    console.log('serviceType:', adapter.serviceType);
    
    // 尝试获取音色列表（不消耗额度）
    const voices = await adapter.getAvailableVoices();
    console.log('音色列表获取: ✅');
    console.log('  音色数量:', voices.length);
    console.log('  前3个:', voices.slice(0, 3).map(v => v.id || v.name).join(', '));
    
    return true;
  } catch (error) {
    console.log('❌ 测试失败:', error.message);
    console.log('   code:', error.code);
    return false;
  }
}

async function testCosyVoice() {
  console.log('\n--- 测试 aliyun_cosyvoice ---');
  try {
    const AliyunCosyVoiceAdapter = require('./src/modules/tts/adapters/providers/AliyunCosyVoiceAdapter');
    const adapter = new AliyunCosyVoiceAdapter();
    
    console.log('适配器创建: ✅');
    console.log('provider:', adapter.provider);
    console.log('serviceType:', adapter.serviceType);
    
    // 获取音色列表
    const voices = await adapter.getAvailableVoices();
    console.log('音色列表获取: ✅');
    console.log('  音色数量:', voices.length);
    console.log('  前3个:', voices.slice(0, 3).map(v => v.id || v.name).join(', '));
    
    return true;
  } catch (error) {
    console.log('❌ 测试失败:', error.message);
    console.log('   code:', error.code);
    return false;
  }
}

// 执行测试
(async () => {
  await testQwenHttp();
  await testCosyVoice();
  
  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
})();
