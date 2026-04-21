#!/usr/bin/env node
/**
 * 全量 Provider 联调测试
 * 测试所有配置的 TTS 服务商
 */

const http = require('http');

const CONFIG = {
  baseUrl: 'http://localhost:6678',
  apiKey: 'key1',
  timeout: 30000
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(color, msg) {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

// HTTP 请求
function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${CONFIG.baseUrl}${path}`;
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CONFIG.apiKey,
        ...options.headers
      },
      timeout: CONFIG.timeout
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// 测试配置
const TEST_CASES = [
  // MOSS TTS (已配置)
  {
    name: 'MOSS TTS',
    service: 'moss_tts',
    text: '你好，这是MOSS语音合成测试',
    voiceCode: '001000030000005',  // 阿树
    expectedProvider: 'moss'
  },
  {
    name: 'MOSS TTS (systemId)',
    service: 'moss_tts',
    text: '这是使用systemId的测试',
    systemId: 'moss-tts-ashui',
    expectedProvider: 'moss'
  },

  // 阿里云 Qwen HTTP
  {
    name: '阿里云 Qwen HTTP',
    service: 'aliyun_qwen_http',
    text: '你好，这是千问TTS测试',
    voice: 'Cherry',
    expectedProvider: 'aliyun',
    skipIfNotConfigured: true
  },

  // 阿里云 CosyVoice
  {
    name: '阿里云 CosyVoice',
    service: 'aliyun_cosyvoice',
    text: '你好，这是CosyVoice测试',
    voice: 'longxiaochun_v2',
    expectedProvider: 'aliyun',
    skipIfNotConfigured: true
  },

  // 腾讯云 TTS
  {
    name: '腾讯云 TTS',
    service: 'tencent_tts',
    text: '你好，这是腾讯云TTS测试',
    voiceType: 101016,
    expectedProvider: 'tencent',
    skipIfNotConfigured: true
  },

  // 火山引擎 HTTP
  {
    name: '火山引擎 HTTP',
    service: 'volcengine_http',
    text: '你好，这是火山引擎TTS测试',
    voice_type: 'BV001_streaming',
    expectedProvider: 'volcengine',
    skipIfNotConfigured: true
  },

  // MiniMax TTS
  {
    name: 'MiniMax TTS',
    service: 'minimax_tts',
    text: '你好，这是MiniMax测试',
    voice: 'presenter_female',
    expectedProvider: 'minimax',
    skipIfNotConfigured: true
  }
];

async function runTests() {
  log('cyan', '\n🚀 全量 Provider 联调测试');
  log('cyan', '='.repeat(50));
  log('cyan', `服务地址: ${CONFIG.baseUrl}`);

  // 1. 健康检查
  log('cyan', '\n📋 健康检查...');
  try {
    const health = await request('/health');
    if (health.status === 200) {
      log('green', `  ✅ 服务正常 - ${health.data.service} (uptime: ${Math.round(health.data.uptime)}s)`);
    } else {
      log('red', `  ❌ 健康检查失败`);
      process.exit(1);
    }
  } catch (e) {
    log('red', `  ❌ 无法连接服务: ${e.message}`);
    process.exit(1);
  }

  // 2. 获取已配置的 providers
  log('cyan', '\n📋 Provider 状态...');
  const providersRes = await request('/api/tts/providers');
  const configuredProviders = new Set();
  const providerStatus = {};

  if (providersRes.data?.data) {
    providersRes.data.data.forEach(p => {
      providerStatus[p.key] = p;
      if (p.configured) {
        configuredProviders.add(p.key);
        log('green', `  ✅ ${p.displayName} (${p.key}) - 已配置`);
      } else {
        log('yellow', `  ⏭️  ${p.displayName} (${p.key}) - 未配置`);
      }
    });
  }

  // 3. 执行合成测试
  log('cyan', '\n🎤 TTS 合成测试...');
  const results = { success: [], failed: [], skipped: [] };

  for (const testCase of TEST_CASES) {
    const providerKey = testCase.service;
    const isConfigured = configuredProviders.has(providerKey);

    if (testCase.skipIfNotConfigured && !isConfigured) {
      log('yellow', `\n  ⏭️  跳过 ${testCase.name} - Provider 未配置`);
      results.skipped.push({ ...testCase, reason: '未配置' });
      continue;
    }

    log('cyan', `\n  📝 测试: ${testCase.name}`);

    const requestBody = {
      text: testCase.text,
      service: testCase.service
    };

    // 添加音色参数
    if (testCase.voiceCode) requestBody.voiceCode = testCase.voiceCode;
    if (testCase.systemId) requestBody.systemId = testCase.systemId;
    if (testCase.voice) requestBody.voice = testCase.voice;
    if (testCase.voiceType) requestBody.voiceType = testCase.voiceType;
    if (testCase.voice_type) requestBody.voice_type = testCase.voice_type;

    log('cyan', `     请求: ${JSON.stringify(requestBody)}`);

    try {
      const startTime = Date.now();
      const res = await request('/api/tts/synthesize', { method: 'POST', body: requestBody });
      const elapsed = Date.now() - startTime;

      if (res.status === 200 && res.data?.success) {
        const data = res.data;
        log('green', `     ✅ 成功 (${elapsed}ms)`);

        // 验证响应
        const checks = [];
        if (data.metadata?.provider === testCase.expectedProvider) {
          checks.push(`provider: ${data.metadata.provider}`);
        }
        if (data.data?.audioUrl || data.data?.audio || data.data?.url) {
          checks.push('有音频输出');
        }

        if (checks.length > 0) {
          log('green', `     验证: ${checks.join(', ')}`);
        }

        results.success.push({ ...testCase, elapsed, response: data });
      } else {
        const error = res.data?.error || res.data?.message || 'Unknown error';
        log('red', `     ❌ 失败: ${error}`);
        results.failed.push({ ...testCase, error });
      }
    } catch (e) {
      log('red', `     ❌ 请求错误: ${e.message}`);
      results.failed.push({ ...testCase, error: e.message });
    }
  }

  // 4. 测试报告
  log('cyan', '\n📊 测试报告');
  log('cyan', '='.repeat(50));

  const total = TEST_CASES.length;
  log('blue', `  总计: ${total}`);
  log('green', `  成功: ${results.success.length}`);
  log('red', `  失败: ${results.failed.length}`);
  log('yellow', `  跳过: ${results.skipped.length}`);

  if (results.success.length > 0) {
    log('green', '\n  ✅ 成功的测试:');
    results.success.forEach(r => {
      log('green', `     - ${r.name} (${r.elapsed}ms)`);
    });
  }

  if (results.failed.length > 0) {
    log('red', '\n  ❌ 失败的测试:');
    results.failed.forEach(r => {
      log('red', `     - ${r.name}: ${r.error}`);
    });
  }

  const successRate = ((results.success.length / (total - results.skipped.length)) * 100).toFixed(1);
  log('cyan', `\n  📈 成功率: ${successRate}% (已配置: ${total - results.skipped.length}/${total})`);

  process.exit(results.failed.length > 0 ? 1 : 0);
}

runTests().catch(e => {
  log('red', `💥 测试异常: ${e.message}`);
  process.exit(1);
});
