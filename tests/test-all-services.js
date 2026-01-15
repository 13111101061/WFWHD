#!/usr/bin/env node

/**
 * 测试所有TTS服务的直接调用
 * 不通过统一API，直接测试底层服务
 */

const fs = require('fs');

async function testTencentTTS() {
    console.log('🔵 测试腾讯云TTS服务...\n');

    try {
        const service = require('./src/modules/tts/services/tencentTtsService');

        console.log('📝 测试参数:');
        console.log('- 文本: "你好，这是腾讯云测试"');
        console.log('- 音色: 101016');
        console.log('- 语速: 1.0');
        console.log('- 音量: 5');

        console.log('\n🎤 开始语音合成...');
        const result = await service.synthesize('你好，这是腾讯云测试', {
            voiceType: 101016,
            speed: 1.0,
            volume: 5
        });

        console.log('✅ 合成结果:');
        console.log(JSON.stringify(result, null, 2));

        if (result && result.audioUrl) {
            console.log(`\n🎉 成功生成音频: ${result.audioUrl}`);

            // 检查文件是否存在
            const path = require('path');
            const fileName = path.basename(result.audioUrl);
            const fullPath = path.join(__dirname, 'src/storage/uploads/audio', fileName);

            if (fs.existsSync(fullPath)) {
                const stats = fs.statSync(fullPath);
                console.log(`📊 文件大小: ${stats.size} 字节`);
                console.log(`📅 创建时间: ${stats.mtime}`);
                console.log(`📁 完整路径: ${fullPath}`);
            } else {
                console.log('❌ 音频文件不存在');
            }
        } else {
            console.log('❌ 没有生成音频文件');
        }

    } catch (error) {
        console.error('💥 腾讯云TTS测试失败:');
        console.error('错误类型:', error.constructor.name);
        console.error('错误消息:', error.message);

        if (error.message.includes('SECRET_ID') || error.message.includes('SECRET_KEY')) {
            console.log('\n💡 这是腾讯云API密钥问题');
        }
    }
}

async function testVolcengineTTS() {
    console.log('\n🔴 测试火山引擎TTS服务...\n');

    try {
        const service = require('./src/modules/tts/services/volcengineTtsService');

        console.log('📝 测试参数:');
        console.log('- 文本: "你好，这是火山引擎测试"');
        console.log('- 音色: BV001_streaming');
        console.log('- 语速: 1.0');
        console.log('- 音量: 10');

        console.log('\n🎤 开始语音合成...');
        const result = await service.synthesize('你好，这是火山引擎测试', {
            voice_type: 'BV001_streaming',
            speed: 1.0,
            volume: 10
        });

        console.log('✅ 合成结果:');
        console.log(JSON.stringify(result, null, 2));

        if (result && result.audioUrl) {
            console.log(`\n🎉 成功生成音频: ${result.audioUrl}`);

            // 检查文件是否存在
            const path = require('path');
            const fileName = path.basename(result.audioUrl);
            const fullPath = path.join(__dirname, 'src/storage/uploads/audio', fileName);

            if (fs.existsSync(fullPath)) {
                const stats = fs.statSync(fullPath);
                console.log(`📊 文件大小: ${stats.size} 字节`);
                console.log(`📅 创建时间: ${stats.mtime}`);
                console.log(`📁 完整路径: ${fullPath}`);
            } else {
                console.log('❌ 音频文件不存在');
            }
        } else {
            console.log('❌ 没有生成音频文件');
        }

    } catch (error) {
        console.error('💥 火山引擎TTS测试失败:');
        console.error('错误类型:', error.constructor.name);
        console.error('错误消息:', error.message);

        if (error.message.includes('APP_ID') || error.message.includes('TOKEN')) {
            console.log('\n💡 这是火山引擎API密钥问题');
        }
    }
}

async function testMiniMaxTTS() {
    console.log('\n🟣 测试MiniMax TTS服务...\n');

    try {
        const service = require('./src/modules/tts/services/minimaxTtsService');

        console.log('📝 测试参数:');
        console.log('- 文本: "你好，这是MiniMax测试"');
        console.log('- 音色: presenter_female');
        console.log('- 模型: speech-01-hd');

        console.log('\n🎤 开始语音合成...');
        const result = await service.synthesize('你好，这是MiniMax测试', {
            voice: 'presenter_female',
            model: 'speech-01-hd'
        });

        console.log('✅ 合成结果:');
        console.log(JSON.stringify(result, null, 2));

        if (result && result.audioUrl) {
            console.log(`\n🎉 成功生成音频: ${result.audioUrl}`);

            // 检查文件是否存在
            const path = require('path');
            const fileName = path.basename(result.audioUrl);
            const fullPath = path.join(__dirname, 'src/storage/uploads/audio', fileName);

            if (fs.existsSync(fullPath)) {
                const stats = fs.statSync(fullPath);
                console.log(`📊 文件大小: ${stats.size} 字节`);
                console.log(`📅 创建时间: ${stats.mtime}`);
                console.log(`📁 完整路径: ${fullPath}`);
            } else {
                console.log('❌ 音频文件不存在');
            }
        } else {
            console.log('❌ 没有生成音频文件');
        }

    } catch (error) {
        console.error('💥 MiniMax TTS测试失败:');
        console.error('错误类型:', error.constructor.name);
        console.error('错误消息:', error.message);

        if (error.message.includes('API_KEY')) {
            console.log('\n💡 这是MiniMax API密钥问题');
        }
    }
}

async function testCosyVoiceFixed() {
    console.log('\n🟢 测试CosyVoice服务(修复版)...\n');

    try {
        const service = require('./src/modules/tts/services/cosyVoiceService');

        console.log('📝 测试参数:');
        console.log('- 文本: "你好，这是CosyVoice测试"');
        console.log('- 音色: longxiaochun_v2');

        console.log('\n🎤 开始语音合成...');
        const result = await service.synthesize('你好，这是CosyVoice测试', {
            voice: 'longxiaochun_v2'
        });

        console.log('✅ 合成结果:');
        console.log(JSON.stringify(result, null, 2));

        if (result && result.audioUrl) {
            console.log(`\n🎉 成功生成音频: ${result.audioUrl}`);
        } else {
            console.log('❌ 没有生成音频文件');
        }

    } catch (error) {
        console.error('💥 CosyVoice TTS测试失败:');
        console.error('错误类型:', error.constructor.name);
        console.error('错误消息:', error.message);
    }
}

async function main() {
    console.log('🚀 所有TTS服务直接测试');
    console.log('=' .repeat(60));
    console.log('测试目的：验证新改的统一API系统的底层服务');
    console.log('测试方法：绕过统一API，直接调用底层TTS服务\n');

    // 测试所有服务
    await testTencentTTS();
    await testVolcengineTTS();
    await testMiniMaxTTS();
    await testCosyVoiceFixed();

    console.log('\n' + '=' .repeat(60));
    console.log('📊 所有服务测试完成');

    console.log('\n💡 分析:');
    console.log('如果以上测试成功，说明底层TTS服务工作正常');
    console.log('如果失败，说明是API密钥或服务配置问题');
    console.log('这样可以准确定位问题是在统一API层还是底层服务层');
}

main().catch(console.error);