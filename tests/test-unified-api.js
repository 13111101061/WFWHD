#!/usr/bin/env node

/**
 * 统一TTS API测试脚本
 * 测试所有服务商的API调用功能
 */

const https = require('https');
const http = require('http');

// 测试配置
const CONFIG = {
    baseUrl: 'http://localhost:3000',
    apiKey: 'key2',
    timeout: 30000 // 30秒超时
};

// 测试用例配置
const TEST_CASES = [
    {
        name: '阿里云CosyVoice',
        service: 'aliyun_cosyvoice',
        text: '你好，这是CosyVoice语音合成测试',
        voice: 'longxiaochun_v2',
        expectedProvider: 'aliyun',
        expectedServiceType: 'cosyvoice'
    },
    {
        name: '阿里云千问HTTP',
        service: 'aliyun_qwen_http',
        text: '你好，这是千问TTS HTTP接口测试',
        voice: 'Cherry',
        model: 'qwen-tts',
        expectedProvider: 'aliyun',
        expectedServiceType: 'qwen_http'
    },
    {
        name: '阿里云千问WebSocket',
        service: 'aliyun_qwen_ws',
        text: '你好，这是千问TTS WebSocket接口测试',
        voice: 'Cherry',
        expectedProvider: 'aliyun',
        expectedServiceType: 'qwen_ws'
    },
    {
        name: '腾讯云TTS',
        service: 'tencent',
        text: '你好，这是腾讯云TTS测试',
        voiceType: 101016,
        expectedProvider: 'tencent',
        expectedServiceType: null
    },
    {
        name: '火山引擎HTTP',
        service: 'volcengine_http',
        text: '你好，这是火山引擎HTTP TTS测试',
        voice_type: 'BV001_streaming',
        expectedProvider: 'volcengine',
        expectedServiceType: 'http'
    },
    {
        name: '火山引擎WebSocket',
        service: 'volcengine_ws',
        text: '你好，这是火山引擎WebSocket TTS测试',
        voice_type: 'BV001_streaming',
        expectedProvider: 'volcengine',
        expectedServiceType: 'ws'
    },
    {
        name: 'MiniMax TTS',
        service: 'minimax',
        text: '你好，这是MiniMax TTS测试',
        voice: 'presenter_female',
        model: 'speech-01-hd',
        expectedProvider: 'minimax',
        expectedServiceType: null
    }
];

// 颜色输出工具
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function colorLog(color, message) {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// HTTP请求工具
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const isHttps = url.startsWith('https://');
        const lib = isHttps ? https : http;

        const requestOptions = {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': CONFIG.apiKey,
                ...options.headers
            },
            timeout: CONFIG.timeout
        };

        const req = lib.request(url, requestOptions, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        data: jsonData,
                        headers: res.headers
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        data: data,
                        headers: res.headers
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (options.body) {
            req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }

        req.end();
    });
}

// 测试声音模型API
async function testVoiceModelsAPI() {
    colorLog('cyan', '\n🎵 测试声音模型API...');

    const tests = [
        { name: '获取所有模型', url: `${CONFIG.baseUrl}/api/voice-models/models` },
        { name: '获取女声模型', url: `${CONFIG.baseUrl}/api/voice-models/categories/female` },
        { name: '获取男声模型', url: `${CONFIG.baseUrl}/api/voice-models/categories/male` },
        { name: '获取热门模型', url: `${CONFIG.baseUrl}/api/voice-models/tags/popular` },
        { name: '搜索模型', url: `${CONFIG.baseUrl}/api/voice-models/search?q=龙` },
        { name: '获取系统统计', url: `${CONFIG.baseUrl}/api/voice-models/stats` }
    ];

    for (const test of tests) {
        try {
            const response = await makeRequest(test.url);

            if (response.statusCode === 200 && response.data.success) {
                colorLog('green', `  ✅ ${test.name}: 成功`);

                // 显示一些关键信息
                if (test.name === '获取所有模型') {
                    colorLog('blue', `     - 加载模型数量: ${response.data.count || response.data.data?.length || 0}`);
                } else if (test.name === '获取系统统计') {
                    colorLog('blue', `     - 统计数据: ${JSON.stringify(response.data.data).substring(0, 100)}...`);
                }
            } else {
                colorLog('red', `  ❌ ${test.name}: 失败 (${response.statusCode})`);
                colorLog('yellow', `     响应: ${JSON.stringify(response.data).substring(0, 200)}...`);
            }
        } catch (error) {
            colorLog('red', `  ❌ ${test.name}: 网络错误 - ${error.message}`);
        }
    }
}

// 测试TTS合成API
async function testTTSAPI() {
    colorLog('cyan', '\n🎤 测试TTS合成API...');

    const results = {
        success: [],
        failed: [],
        skipped: []
    };

    for (let i = 0; i < TEST_CASES.length; i++) {
        const testCase = TEST_CASES[i];

        colorLog('yellow', `\n📝 测试 ${i + 1}/${TEST_CASES.length}: ${testCase.name}`);

        try {
            // 构建请求体
            const requestBody = {
                service: testCase.service,
                text: testCase.text
            };

            // 添加服务特定参数
            if (testCase.voice) requestBody.voice = testCase.voice;
            if (testCase.voiceType) requestBody.voiceType = testCase.voiceType;
            if (testCase.voice_type) requestBody.voice_type = testCase.voice_type;
            if (testCase.model) requestBody.model = testCase.model;

            colorLog('blue', `  📤 发送请求: ${testCase.service}`);
            colorLog('blue', `  📝 测试文本: "${testCase.text}"`);

            const startTime = Date.now();
            const response = await makeRequest(`${CONFIG.baseUrl}/api/tts/synthesize`, {
                method: 'POST',
                body: requestBody
            });
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            if (response.statusCode === 200) {
                if (response.data.success) {
                    colorLog('green', `  ✅ 请求成功 (${responseTime}ms)`);

                    // 验证响应结构
                    const data = response.data;
                    const checks = [
                        { condition: data.service === testCase.service, message: '服务标识正确' },
                        { condition: data.fromCache !== undefined, message: '缓存标志存在' },
                        { condition: data.metadata, message: '元数据存在' },
                        { condition: data.metadata.provider === testCase.expectedProvider, message: `提供商正确: ${testCase.expectedProvider}` },
                        { condition: !testCase.expectedServiceType || data.metadata.serviceType === testCase.expectedServiceType, message: `服务类型正确: ${testCase.expectedServiceType || '任意'}` }
                    ];

                    let allChecksPassed = true;
                    checks.forEach(check => {
                        if (check.condition) {
                            colorLog('green', `     ✅ ${check.message}`);
                        } else {
                            colorLog('yellow', `     ⚠️  ${check.message}`);
                            allChecksPassed = false;
                        }
                    });

                    // 检查音频数据
                    if (data.data) {
                        if (data.data.audioUrl) {
                            colorLog('green', `     ✅ 音频URL: ${data.data.audioUrl}`);
                        } else if (data.data.audio) {
                            colorLog('green', `     ✅ 音频数据: ${data.data.audio.substring(0, 50)}...`);
                        } else if (data.data.taskId) {
                            colorLog('green', `     ✅ 任务ID: ${data.data.taskId}`);
                        } else {
                            colorLog('yellow', `     ⚠️  音频数据格式未知: ${JSON.stringify(data.data).substring(0, 100)}...`);
                        }
                    } else {
                        colorLog('yellow', `     ⚠️  无音频数据返回`);
                    }

                    if (allChecksPassed) {
                        results.success.push({
                            ...testCase,
                            responseTime,
                            hasAudio: !!data.data
                        });
                    } else {
                        results.failed.push({
                            ...testCase,
                            error: '部分检查失败',
                            response: data
                        });
                    }
                } else {
                    colorLog('red', `  ❌ API返回错误: ${response.data.error || '未知错误'}`);
                    results.failed.push({
                        ...testCase,
                        error: response.data.error || 'API返回错误'
                    });
                }
            } else {
                colorLog('red', `  ❌ HTTP错误: ${response.statusCode}`);
                colorLog('yellow', `     响应: ${JSON.stringify(response.data).substring(0, 200)}...`);
                results.failed.push({
                    ...testCase,
                    error: `HTTP ${response.statusCode}`,
                    response: response.data
                });
            }
        } catch (error) {
            colorLog('red', `  ❌ 网络或超时错误: ${error.message}`);
            results.failed.push({
                ...testCase,
                error: error.message
            });
        }
    }

    return results;
}

// 测试健康检查
async function testHealthCheck() {
    colorLog('cyan', '\n🏥 测试健康检查...');

    try {
        const response = await makeRequest(`${CONFIG.baseUrl}/health`);

        if (response.statusCode === 200) {
            colorLog('green', '  ✅ 健康检查通过');
            colorLog('blue', `     状态: ${JSON.stringify(response.data).substring(0, 150)}...`);
        } else {
            colorLog('red', `  ❌ 健康检查失败: ${response.statusCode}`);
        }
    } catch (error) {
        colorLog('red', `  ❌ 健康检查错误: ${error.message}`);
    }
}

// 生成测试报告
function generateReport(results) {
    colorLog('cyan', '\n📊 测试报告');
    colorLog('cyan', '=' .repeat(50));

    const total = TEST_CASES.length;
    const success = results.success.length;
    const failed = results.failed.length;
    const skipped = results.skipped.length;

    colorLog('blue', `总测试数: ${total}`);
    colorLog('green', `成功: ${success}`);
    colorLog('red', `失败: ${failed}`);
    colorLog('yellow', `跳过: ${skipped}`);

    if (success > 0) {
        colorLog('green', `\n✅ 成功的服务:`);
        results.success.forEach(result => {
            const audioInfo = result.hasAudio ? ' (有音频)' : ' (无音频)';
            colorLog('green', `  - ${result.name}${audioInfo} (${result.responseTime}ms)`);
        });
    }

    if (failed > 0) {
        colorLog('red', `\n❌ 失败的服务:`);
        results.failed.forEach(result => {
            colorLog('red', `  - ${result.name}: ${result.error}`);
        });
    }

    const successRate = ((success / total) * 100).toFixed(1);
    colorLog('cyan', `\n📈 成功率: ${successRate}%`);

    if (successRate >= 80) {
        colorLog('green', '🎉 总体评价: 优秀');
    } else if (successRate >= 60) {
        colorLog('yellow', '👍 总体评价: 良好');
    } else {
        colorLog('red', '⚠️  总体评价: 需要改进');
    }
}

// 主测试函数
async function runTests() {
    console.log('🚀 TTS统一API测试开始');
    console.log('=' .repeat(50));
    colorLog('blue', `测试目标: ${CONFIG.baseUrl}`);
    colorLog('blue', `使用密钥: ${CONFIG.apiKey}`);

    try {
        // 1. 健康检查
        await testHealthCheck();

        // 2. 声音模型API测试
        await testVoiceModelsAPI();

        // 3. TTS合成API测试
        const results = await testTTSAPI();

        // 4. 生成报告
        generateReport(results);

        // 5. 退出码
        process.exit(results.failed.length > 0 ? 1 : 0);

    } catch (error) {
        colorLog('red', `\n💥 测试过程中发生严重错误: ${error.message}`);
        process.exit(1);
    }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    colorLog('red', `💥 未捕获的异常: ${error.message}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    colorLog('red', `💥 未处理的Promise拒绝: ${reason}`);
    process.exit(1);
});

// 处理Ctrl+C
process.on('SIGINT', () => {
    colorLog('yellow', '\n⏹️  测试被用户中断');
    process.exit(0);
});

// 启动测试
if (require.main === module) {
    runTests();
}

module.exports = { runTests, TEST_CASES };