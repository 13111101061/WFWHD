#!/usr/bin/env node

/**
 * 优选模块连接测试脚本
 * 测试与 https://api1.su9.su 的连接
 */

const https = require('https');

const CONFIG = {
    baseUrl: 'https://api1.su9.su'
};

/**
 * 发起HTTPS请求
 */
function httpsRequest(options) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

/**
 * 测试连接
 */
async function testConnection() {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║   优选模块连接测试                        ║');
    console.log('║   测试地址: https://api1.su9.su           ║');
    console.log('╚════════════════════════════════════════════╝\n');

    const url = new URL(CONFIG.baseUrl);

    const options = {
        hostname: url.hostname,
        port: 443,
        path: '/',
        method: 'GET',
        headers: {
            'User-Agent': 'Optimizer-Test/1.0'
        }
    };

    console.log('🔄 正在连接...');

    const startTime = Date.now();

    try {
        const response = await httpsRequest(options);
        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log(`\n✅ 连接成功!`);
        console.log(`📡 状态码: ${response.status}`);
        console.log(`⏱️ 响应时间: ${duration}ms`);
        console.log(`📦 响应数据:`);
        console.log(JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.error(`\n❌ 连接失败: ${error.message}`);
        process.exit(1);
    }
}

testConnection();
