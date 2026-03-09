/**
 * Qwen TTS API 接口测试
 * 通过本地服务器的统一 API 测试 Qwen 音色
 */

const http = require('http');

const CONFIG = {
    baseUrl: 'http://localhost:3000',
    apiKey: 'key2'
};

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m'
};

function log(color, msg) {
    console.log(`${colors[color]}${msg}${colors.reset}`);
}

// HTTP POST 请求
function postRequest(url, body) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 80,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': CONFIG.apiKey
            },
            timeout: 30000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.write(JSON.stringify(body));
        req.end();
    });
}

async function testQwenAPI() {
    console.log('========================================');
    log('cyan', '🎤 Qwen TTS API 接口测试');
    console.log('========================================\n');

    // 测试用例：不同的 Qwen 模型和音色组合
    const testCases = [
        {
            name: 'Qwen HTTP - Cherry 音色',
            service: 'aliyun_qwen_http',
            voice: 'Cherry',
            model: 'qwen-tts',
            text: '你好，我是Cherry，很高兴为你服务。'
        },
        {
            name: 'Qwen HTTP - Serena 音色',
            service: 'aliyun_qwen_http',
            voice: 'Serena',
            model: 'qwen-tts',
            text: '你好，我是Serena，测试语音合成效果。'
        },
        {
            name: 'Qwen3 Flash - Cherry 音色',
            service: 'aliyun_qwen_http',
            voice: 'Cherry',
            model: 'qwen3-tts-flash',
            text: '这是Flash模型的测试。'
        },
        {
            name: 'Qwen HTTP - Ethan 音色',
            service: 'aliyun_qwen_http',
            voice: 'Ethan',
            model: 'qwen-tts',
            text: '你好，我是Ethan，男声音色测试。'
        }
    ];

    let success = 0;
    let failed = 0;

    for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        log('yellow', `\n📝 测试 ${i + 1}/${testCases.length}: ${tc.name}`);
        console.log(`   服务: ${tc.service}`);
        console.log(`   音色: ${tc.voice}`);
        console.log(`   模型: ${tc.model}`);
        console.log(`   文本: "${tc.text}"`);

        try {
            const startTime = Date.now();
            const response = await postRequest(`${CONFIG.baseUrl}/api/tts/synthesize`, {
                service: tc.service,
                text: tc.text,
                voice: tc.voice,
                model: tc.model
            });
            const elapsed = Date.now() - startTime;

            if (response.status === 200 && response.data.success) {
                log('green', `   ✅ 成功 (${elapsed}ms)`);

                if (response.data.data?.audioUrl) {
                    console.log(`   🔊 音频URL: ${response.data.data.audioUrl.substring(0, 80)}...`);
                } else if (response.data.data?.audio) {
                    console.log(`   🔊 音频数据: ${response.data.data.audio.substring(0, 50)}...`);
                }

                console.log(`   📊 Token使用: ${JSON.stringify(response.data.metadata?.usage || {})}`);
                success++;
            } else {
                log('red', `   ❌ 失败 (${response.status})`);
                console.log(`   错误: ${JSON.stringify(response.data).substring(0, 200)}`);
                failed++;
            }
        } catch (error) {
            log('red', `   ❌ 请求错误: ${error.message}`);
            failed++;
        }

        // 避免请求过快
        await new Promise(r => setTimeout(r, 500));
    }

    console.log('\n========================================');
    log('cyan', '📊 测试结果');
    console.log('========================================');
    log('green', `✅ 成功: ${success}`);
    log('red', `❌ 失败: ${failed}`);
    log('cyan', `📈 成功率: ${((success / testCases.length) * 100).toFixed(1)}%`);

    process.exit(failed > 0 ? 1 : 0);
}

testQwenAPI();