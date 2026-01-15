#!/usr/bin/env node

/**
 * 测试真实TTS服务
 * 绕过缓存，直接调用底层服务
 */

const path = require('path');

// 模拟一个简单的TTS测试
async function testCosyVoiceService() {
    console.log('🎵 直接测试CosyVoice服务...\n');

    try {
        // 导入CosyVoice服务（已经是实例）
        const service = require('./src/modules/tts/services/cosyVoiceService');

        console.log('📝 测试参数:');
        console.log('- 文本: "你好，这是直接测试"');
        console.log('- 音色: "longxiaochun_v2"');

        console.log('\n🎤 开始语音合成...');
        const result = await service.synthesize('你好，这是直接测试', {
            voice: 'longxiaochun_v2'
        });

        console.log('✅ 合成结果:');
        console.log(JSON.stringify(result, null, 2));

        if (result && result.audioUrl) {
            console.log(`\n🎉 成功生成音频: ${result.audioUrl}`);
            console.log(`📁 文件路径: ${path.join(__dirname, 'src/storage/uploads/audio', path.basename(result.audioUrl))}`);

            // 检查文件是否存在
            const fs = require('fs');
            const fullPath = path.join(__dirname, 'src/storage/uploads/audio', path.basename(result.audioUrl));
            if (fs.existsSync(fullPath)) {
                const stats = fs.statSync(fullPath);
                console.log(`📊 文件大小: ${stats.size} 字节`);
                console.log(`📅 创建时间: ${stats.mtime}`);
            } else {
                console.log('❌ 音频文件不存在');
            }
        } else {
            console.log('❌ 没有生成音频文件');
        }

    } catch (error) {
        console.error('💥 CosyVoice服务测试失败:');
        console.error('错误类型:', error.constructor.name);
        console.error('错误消息:', error.message);

        if (error.message.includes('API密钥')) {
            console.log('\n💡 这是API密钥问题，需要配置有效的TTS服务密钥');
        }
    }
}

async function testQwenService() {
    console.log('\n🤖 直接测试千问TTS服务...\n');

    try {
        // 导入千问TTS服务（已经是实例）
        const service = require('./src/modules/tts/services/qwenTtsHttpService');

        console.log('📝 测试参数:');
        console.log('- 文本: "你好，千问测试"');
        console.log('- 音色: "Cherry"');

        console.log('\n🎤 开始语音合成...');
        const result = await service.synthesize('你好，千问测试', {
            voice: 'Cherry',
            model: 'qwen-tts'
        });

        console.log('✅ 合成结果:');
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('💥 千问TTS服务测试失败:');
        console.error('错误类型:', error.constructor.name);
        console.error('错误消息:', error.message);
    }
}

async function main() {
    console.log('🔬 TTS服务直接测试\n');
    console.log('=' .repeat(50));

    await testCosyVoiceService();
    await testQwenService();

    console.log('\n' + '=' .repeat(50));
    console.log('📊 测试完成');

    console.log('\n💡 总结:');
    console.log('如果以上测试失败，说明是第三方API密钥问题');
    console.log('如果成功，说明是统一API路由层的问题');
}

main().catch(console.error);