#!/usr/bin/env node

/**
 * 直接测试服务管理器的调用链
 */

const { ttsServiceManager } = require('./src/modules/tts/core/TtsServiceManager');

async function debugServiceChain() {
    console.log('🔍 调试服务管理器调用链');
    console.log('=' .repeat(50));

    // 测试CosyVoice
    console.log('\n📋 测试 1: CosyVoice');
    try {
        console.log('1. 调用 synthesize...');
        const result1 = await ttsServiceManager.synthesize('aliyun', 'cosyvoice', '你好测试', { voice: 'longxiaochun_v2' });
        console.log('✅ 结果:', JSON.stringify(result1, null, 2));

        if (result1) {
            console.log('✅ 有返回结果');
            if (result1.audioUrl) {
                console.log(`  - 音频URL: ${result1.audioUrl}`);
            } else {
                console.log('  - ❌ 没有音频URL');
            }
        } else {
            console.log('❌ 返回结果是 null 或 undefined');
        }
    } catch (error) {
        console.error('❌ 异常:', error.message);
        console.error('堆栈:', error.stack);
    }

    // 测试腾讯云
    console.log('\n📋 测试 2: 腾讯云');
    try {
        console.log('1. 调用 synthesize...');
        const result2 = await ttsServiceManager.synthesize('tencent', null, '腾讯云测试', { voiceType: 101016 });
        console.log('✅ 结果:', JSON.stringify(result2, null, 2));

        if (result2) {
            console.log('✅ 有返回结果');
            if (result2.audioUrl || result2.audio) {
                console.log(`  - 有音频数据: ${result2.audioUrl ? 'URL' : 'Base64'}`);
            } else {
                console.log('  - ❌ 没有音频数据');
            }
        } else {
            console.log('❌ 返回结果是 null 或 undefined');
        }
    } catch (error) {
        console.error('❌ 异常:', error.message);
        console.error('堆栈:', error.stack);
    }

    // 测试火山引擎
    console.log('\n📋 测试 3: 火山引擎');
    try {
        console.log('1. 调用 synthesize...');
        const result3 = await ttsServiceManager.synthesize('volcengine', 'http', '火山引擎测试', { voice_type: 'BV001_streaming' });
        console.log('✅ 结果:', JSON.stringify(result3, null, 2));

        if (result3) {
            console.log('✅ 有返回结果');
            if (result3.audioUrl || result3.audio) {
                console.log(`  - 有音频数据: ${result3.audioUrl ? 'URL' : 'Base64'}`);
            } else {
                console.log('  - ❌ 没有音频数据');
            }
        } else {
            console.log('❌ 返回结果是 null 或 undefined');
        }
    } catch (error) {
        console.error('❌ 异常:', error.message);
        console.error('堆栈:', error.stack);
    }
}

debugServiceChain().catch(console.error);