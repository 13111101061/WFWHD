#!/usr/bin/env node

/**
 * 快速TTS服务测试
 * 逐个测试每个服务，避免超时
 */

const fs = require('fs');

async function testSingleService(serviceName, testFn) {
    console.log(`\n🔍 测试 ${serviceName}...`);

    try {
        const startTime = Date.now();
        const result = await testFn();
        const endTime = Date.now();

        console.log(`✅ ${serviceName} 测试成功 (${endTime - startTime}ms)`);
        if (result) {
            console.log('结果:', JSON.stringify(result, null, 2).substring(0, 300) + '...');
        }
        return { success: true, result, duration: endTime - startTime };
    } catch (error) {
        console.error(`❌ ${serviceName} 测试失败:`, error.message);
        return { success: false, error: error.message };
    }
}

async function quickTestAllServices() {
    console.log('🚀 快速TTS服务测试开始');
    console.log('测试目的：验证每个TTS服务的底层调用');

    const results = {};

    // 1. 测试腾讯云TTS
    results.tencent = await testSingleService('腾讯云TTS', async () => {
        const service = require('./src/modules/tts/services/tencentTtsService');
        return await service.synthesize('你好，这是腾讯云测试', {
            voiceType: 101016,
            speed: 1.0,
            volume: 5
        });
    });

    // 2. 测试火山引擎TTS
    results.volcengine = await testSingleService('火山引擎TTS', async () => {
        const service = require('./src/modules/tts/services/volcengineTtsService');
        return await service.synthesize('你好，这是火山引擎测试', {
            voice_type: 'BV001_streaming',
            speed: 1.0,
            volume: 10
        });
    });

    // 3. 测试MiniMax TTS
    results.minimax = await testSingleService('MiniMax TTS', async () => {
        const service = require('./src/modules/tts/services/minimaxTtsService');
        return await service.synthesize('你好，这是MiniMax测试', {
            voice: 'presenter_female',
            model: 'speech-01-hd'
        });
    });

    // 4. 测试千问TTS
    results.qwen = await testSingleService('千问TTS', async () => {
        const service = require('./src/modules/tts/services/qwenTtsHttpService');
        return await service.synthesize('你好，这是千问测试', {
            voice: 'Cherry',
            model: 'qwen-tts'
        });
    });

    // 5. 测试CosyVoice
    results.cosyvoice = await testSingleService('CosyVoice', async () => {
        const service = require('./src/modules/tts/services/cosyVoiceService');
        return await service.synthesize('你好，这是CosyVoice测试', {
            voice: 'longxiaochun_v2'
        });
    });

    // 生成报告
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试报告');

    const success = Object.values(results).filter(r => r.success).length;
    const total = Object.keys(results).length;

    console.log(`总测试数: ${total}`);
    console.log(`成功: ${success}`);
    console.log(`失败: ${total - success}`);
    console.log(`成功率: ${((success / total) * 100).toFixed(1)}%`);

    console.log('\n详细结果:');
    Object.entries(results).forEach(([name, result]) => {
        const status = result.success ? '✅' : '❌';
        const duration = result.duration ? ` (${result.duration}ms)` : '';
        console.log(`${status} ${name}${duration}`);

        if (!result.success) {
            console.log(`   错误: ${result.error}`);
        } else if (result.result && result.result.audioUrl) {
            console.log(`   音频: ${result.result.audioUrl}`);

            // 检查文件是否存在
            const path = require('path');
            const fileName = path.basename(result.result.audioUrl);
            const fullPath = path.join(__dirname, 'src/storage/uploads/audio', fileName);

            if (fs.existsSync(fullPath)) {
                const stats = fs.statSync(fullPath);
                console.log(`   文件大小: ${stats.size} 字节`);
            }
        }
    });

    return results;
}

// 运行测试
quickTestAllServices().catch(console.error);