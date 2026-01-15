#!/usr/bin/env node

/**
 * 调试统一API的具体调用过程
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

async function debugSingleService(serviceName, text, options = {}) {
    console.log(`\n🔍 调试服务: ${serviceName}`);
    console.log(`📝 文本: "${text}"`);
    console.log(`⚙️  选项:`, JSON.stringify(options, null, 2));

    try {
        const requestBody = {
            service: serviceName,
            text: text,
            ...options
        };

        console.log('\n📤 发送请求...');
        const response = await makeRequest(`${CONFIG.baseUrl}/api/tts/synthesize`, {
            method: 'POST',
            body: requestBody
        });

        console.log(`📥 响应状态: ${response.statusCode}`);
        console.log('📥 完整响应数据:');
        console.log(JSON.stringify(response.data, null, 2));

        // 详细分析响应结构
        if (response.data.success) {
            console.log('\n✅ 请求成功 - 详细分析:');
            const data = response.data;

            console.log(`- 服务标识: ${data.service}`);
            console.log(`- 缓存标志: ${data.fromCache}`);
            console.log(`- 元数据: ${JSON.stringify(data.metadata, null, 2)}`);

            if (data.data) {
                console.log('\n🎉 有数据返回!');
                if (data.data.audioUrl) {
                    console.log(`  - 音频URL: ${data.data.audioUrl}`);

                    // 检查文件是否存在
                    const fs = require('fs');
                    const path = require('path');
                    const fileName = path.basename(data.data.audioUrl);
                    const fullPath = path.join(__dirname, 'src/storage/uploads/audio', fileName);

                    if (fs.existsSync(fullPath)) {
                        const stats = fs.statSync(fullPath);
                        console.log(`  - 文件大小: ${stats.size} 字节`);
                        console.log(`  - 文件路径: ${fullPath}`);
                    } else {
                        console.log(`  - ⚠️  文件不存在: ${fullPath}`);
                    }
                } else if (data.data.audio) {
                    console.log(`  - Base64音频长度: ${data.data.audio.length}`);
                } else if (data.data.taskId) {
                    console.log(`  - 任务ID: ${data.data.taskId}`);
                } else {
                    console.log(`  - 其他数据: ${JSON.stringify(data.data)}`);
                }
            } else {
                console.log('\n❌ 无数据返回 - 可能的问题:');
                console.log('  1. 底层服务调用失败');
                console.log('  2. 数据封装问题');
                console.log('  3. 服务工厂问题');
            }
        } else {
            console.log(`\n❌ 请求失败: ${response.data.error}`);
        }

    } catch (error) {
        console.error(`\n💥 请求异常: ${error.message}`);
    }
}

async function main() {
    console.log('🔍 统一API调试工具');
    console.log('=' .repeat(50));

    // 测试几个关键服务
    await debugSingleService('aliyun_cosyvoice', '你好测试', { voice: 'longxiaochun_v2' });

    console.log('\n' + '=' .repeat(50));
    await debugSingleService('tencent', '腾讯云测试', { voiceType: 101016 });

    console.log('\n' + '=' .repeat(50));
    await debugSingleService('volcengine_http', '火山引擎测试', { voice_type: 'BV001_streaming' });
}

main().catch(console.error);