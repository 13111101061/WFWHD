/**
 * TTS 全流程测试脚本
 * 测试内容：
 * 1. 音色选择 API（获取各提供商音色列表）
 * 2. TTS 合成 API（每个提供商测试一个音色）
 * 3. 音频输出验证
 *
 * 使用方式: node tests/test-full-flow.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 配置
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'key1';

// 测试用例：每个提供商选择一个音色
const TEST_CASES = [
  {
    provider: 'aliyun',
    service: 'aliyun_qwen_http',    // 正确格式: provider_service
    voiceId: 'Cherry',               // 爱千月
    text: '你好，这是阿里云千问语音合成测试。',
    description: '阿里云 Qwen HTTP'
  },
  {
    provider: 'tencent',
    service: 'tencent',              // 腾讯云单服务
    voiceId: 101001,                 // 亲亲 (数字类型)
    text: '你好，这是腾讯云语音合成测试。',
    description: '腾讯云 TTS'
  },
  {
    provider: 'volcengine',
    service: 'volcengine_http',      // 正确格式
    voiceId: 'BV001_streaming',      // 通用女声
    text: '你好，这是火山引擎语音合成测试。',
    description: '火山引擎 HTTP'
  },
  {
    provider: 'minimax',
    service: 'minimax',              // MiniMax 单服务
    voiceId: 'moss_audio_ce44fc67-7ce3-11f0-8de5-96e35d26fb85',
    text: '你好，这是MiniMax语音合成测试。',
    description: 'MiniMax TTS'
  }
];

// HTTP 客户端
const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  },
  timeout: 60000
});

// 测试结果
const results = {
  passed: [],
  failed: [],
  skipped: []
};

/**
 * 测试步骤 1：健康检查
 */
async function testHealthCheck() {
  console.log('\n📋 Step 1: 健康检查');
  console.log('─'.repeat(50));

  try {
    const response = await client.get('/health');
    console.log(`✅ 服务状态: ${response.data.status}`);
    console.log(`   运行时间: ${Math.round(response.data.uptime)}s`);
    return true;
  } catch (error) {
    console.log(`❌ 健康检查失败: ${error.message}`);
    return false;
  }
}

/**
 * 测试步骤 2：获取音色列表
 */
async function testVoiceApis() {
  console.log('\n📋 Step 2: 音色选择 API 测试');
  console.log('─'.repeat(50));

  // 2.1 获取所有音色
  try {
    const response = await client.get('/api/tts/voices/models');
    console.log(`✅ 获取所有音色: ${response.data.count} 个`);
  } catch (error) {
    console.log(`❌ 获取所有音色失败: ${error.message}`);
  }

  // 2.2 获取分类数据
  try {
    const response = await client.get('/api/tts/voices/categories');
    console.log(`✅ 获取分类数据: ${Object.keys(response.data.data.byProvider || {}).length} 个提供商`);
  } catch (error) {
    console.log(`❌ 获取分类数据失败: ${error.message}`);
  }

  // 2.3 按提供商获取音色
  const providers = ['aliyun', 'tencent', 'volcengine', 'minimax'];
  for (const provider of providers) {
    try {
      const response = await client.get(`/api/tts/voices/providers/${provider}`);
      console.log(`✅ ${provider}: ${response.data.data.count} 个音色`);
    } catch (error) {
      console.log(`❌ 获取 ${provider} 音色失败: ${error.message}`);
    }
  }

  // 2.4 获取统计信息
  try {
    const response = await client.get('/api/tts/voices/stats');
    console.log(`✅ 统计信息: ${response.data.data.totalModels} 个模型`);
  } catch (error) {
    console.log(`❌ 获取统计信息失败: ${error.message}`);
  }
}

/**
 * 测试步骤 3：TTS 合成测试
 */
async function testTtsSynthesis() {
  console.log('\n📋 Step 3: TTS 合成测试');
  console.log('─'.repeat(50));

  for (const testCase of TEST_CASES) {
    console.log(`\n🔊 测试: ${testCase.description}`);
    console.log(`   音色: ${testCase.voiceId} (${testCase.provider}/${testCase.service})`);

    try {
      const startTime = Date.now();

      // 调用 TTS API
      const response = await client.post('/api/tts/synthesize', {
        text: testCase.text,
        service: testCase.service,
        voice: testCase.voiceId,
        provider: testCase.provider
      });

      const duration = Date.now() - startTime;

      if (response.data.success) {
        console.log(`✅ 合成成功 (${duration}ms)`);
        console.log(`   文件: ${response.data.data.fileName}`);
        console.log(`   URL: ${response.data.data.audioUrl}`);

        // 验证文件是否存在
        if (response.data.data.filePath) {
          const fileExists = fs.existsSync(response.data.data.filePath);
          console.log(`   文件存在: ${fileExists ? '是' : '否'}`);
        }

        results.passed.push({
          provider: testCase.provider,
          service: testCase.service,
          voiceId: testCase.voiceId,
          duration,
          fileName: response.data.data.fileName
        });
      } else {
        console.log(`❌ 合成失败: ${response.data.error || 'Unknown error'}`);
        results.failed.push({
          ...testCase,
          error: response.data.error || 'Unknown error'
        });
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      console.log(`❌ 请求失败: ${errorMsg}`);
      results.failed.push({
        ...testCase,
        error: errorMsg
      });
    }
  }
}

/**
 * 测试步骤 4：使用 systemId 测试
 */
async function testSystemId() {
  console.log('\n📋 Step 4: SystemId 测试');
  console.log('─'.repeat(50));

  // 测试阿里云 Qwen Cherry 音色
  console.log(`\n🔊 使用 systemId 测试: 阿里云 Qwen - Cherry`);

  try {
    const startTime = Date.now();

    const response = await client.post('/api/tts/synthesize', {
      text: '使用 systemId 测试语音合成。',
      systemId: 'aliyun-qwen-http-cherry'
    });

    const duration = Date.now() - startTime;

    if (response.data.success) {
      console.log(`✅ systemId 测试成功 (${duration}ms)`);
      console.log(`   文件: ${response.data.data.fileName}`);
      results.passed.push({
        provider: 'aliyun',
        service: 'systemId',
        voiceId: 'aliyun-qwen-http-cherry',
        duration,
        fileName: response.data.data.fileName
      });
    } else {
      console.log(`❌ systemId 测试失败: ${response.data.error}`);
      results.failed.push({
        provider: 'aliyun',
        service: 'systemId',
        error: response.data.error
      });
    }
  } catch (error) {
    const errorMsg = error.response?.data?.error || error.message;
    console.log(`❌ systemId 请求失败: ${errorMsg}`);
    results.failed.push({
      provider: 'aliyun',
      service: 'systemId',
      error: errorMsg
    });
  }
}

/**
 * 输出测试报告
 */
function printReport() {
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试报告');
  console.log('='.repeat(50));

  console.log(`\n✅ 通过: ${results.passed.length}`);
  results.passed.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.provider}/${r.service} - ${r.duration}ms`);
  });

  console.log(`\n❌ 失败: ${results.failed.length}`);
  results.failed.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.provider}/${r.service} - ${r.error}`);
  });

  console.log('\n' + '='.repeat(50));
  console.log(`总计: ${results.passed.length + results.failed.length} 个测试`);
  console.log(`通过率: ${Math.round(results.passed.length / (results.passed.length + results.failed.length) * 100) || 0}%`);
  console.log('='.repeat(50));
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 TTS 全流程测试');
  console.log('='.repeat(50));
  console.log(`服务地址: ${BASE_URL}`);
  console.log(`API Key: ${API_KEY}`);

  // Step 1: 健康检查
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.log('\n❌ 服务不可用，测试终止');
    process.exit(1);
  }

  // Step 2: 音色选择 API
  await testVoiceApis();

  // Step 3: TTS 合成测试
  await testTtsSynthesis();

  // Step 4: SystemId 测试
  await testSystemId();

  // 输出报告
  printReport();

  // 退出码
  process.exit(results.failed.length > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('测试脚本异常:', error);
  process.exit(1);
});