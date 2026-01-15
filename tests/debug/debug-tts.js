#!/usr/bin/env node

/**
 * TTS调试脚本
 * 详细追踪TTS调用过程
 */

const https = require('https');
const http = require('http');

const CONFIG = {
    baseUrl: 'http://localhost:3000',
    apiKey: 'key2'
};

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
            }
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

        if (options.body) {
            req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }

        req.end();
    });
}

async function debugSingleTTS() {
    console.log('🔍 调试单个TTS调用...\n');

    const testCase = {
        service: 'aliyun_cosyvoice',
        text: '调试测试',
        voice: 'longxiaochun_v2'
    };

    console.log('📝 测试参数:');
    console.log(JSON.stringify(testCase, null, 2));

    try {
        console.log('\n📤 发送请求...');
        const response = await makeRequest(`${CONFIG.baseUrl}/api/tts/synthesize`, {
            method: 'POST',
            body: testCase
        });

        console.log(`📥 响应状态: ${response.statusCode}`);
        console.log('📥 响应数据:');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.success) {
            console.log('\n✅ 请求成功，分析结果:');

            const data = response.data;
            console.log(`- 服务: ${data.service}`);
            console.log(`- 缓存: ${data.fromCache}`);
            console.log(`- 元数据: ${JSON.stringify(data.metadata, null, 2)}`);
            console.log(`- 数据部分: ${JSON.stringify(data.data, null, 2)}`);

            if (data.data === null) {
                console.log('\n⚠️  数据为null，可能原因:');
                console.log('1. 第三方API调用失败');
                console.log('2. API密钥配置问题');
                console.log('3. 服务实现返回null');
                console.log('4. 参数验证失败');
            } else if (data.data) {
                console.log('\n🎉 有数据返回！');
                if (data.data.audioUrl) console.log(`- 音频URL: ${data.data.audioUrl}`);
                if (data.data.audio) console.log(`- 音频数据长度: ${data.data.audio.length}`);
                if (data.data.taskId) console.log(`- 任务ID: ${data.data.taskId}`);
            }
        } else {
            console.log(`\n❌ 请求失败: ${response.data.error}`);
        }

    } catch (error) {
        console.error(`\n💥 请求异常: ${error.message}`);
    }
}

async function checkServerStatus() {
    console.log('🏥 检查服务器状态...\n');

    try {
        const healthResponse = await makeRequest(`${CONFIG.baseUrl}/health`);
        console.log(`健康检查: ${JSON.stringify(healthResponse.data, null, 2)}`);

        const modelsResponse = await makeRequest(`${CONFIG.baseUrl}/api/voice-models/stats`);
        console.log(`模型统计: ${JSON.stringify(modelsResponse.data, null, 2)}`);

    } catch (error) {
        console.error(`状态检查失败: ${error.message}`);
    }
}

async function main() {
    console.log('🔍 TTS调试脚本启动\n');

    await checkServerStatus();
    console.log('\n' + '='.repeat(50) + '\n');
    await debugSingleTTS();
}

main().catch(console.error);