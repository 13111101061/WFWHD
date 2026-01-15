#!/usr/bin/env node

/**
 * 只测试CosyVoice TTS服务
 */

async function testCosyVoiceTTS() {
    console.log('🟢 测试CosyVoice TTS服务...\n');

    try {
        const service = require('./src/modules/tts/services/cosyVoiceService');

        console.log('📝 测试参数:');
        console.log('- 文本: "你好，这是CosyVoice测试"');
        console.log('- 音色: longxiaochun_v2');

        console.log('\n🎤 开始语音合成...');
        const startTime = Date.now();
        const result = await service.synthesize('你好，这是CosyVoice测试', {
            voice: 'longxiaochun_v2'
        });
        const endTime = Date.now();

        console.log(`✅ 合成完成 (${endTime - startTime}ms)`);
        console.log('合成结果:');
        console.log(JSON.stringify(result, null, 2));

        if (result && result.audioUrl) {
            console.log(`\n🎉 成功生成音频: ${result.audioUrl}`);

            // 检查文件是否存在
            const fs = require('fs');
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
        } else if (result && result.audio) {
            console.log(`\n🎉 成功生成Base64音频数据 (${result.audio.length} 字符)`);
        } else {
            console.log('❌ 没有生成音频文件');
        }

    } catch (error) {
        console.error('💥 CosyVoice TTS测试失败:');
        console.error('错误类型:', error.constructor.name);
        console.error('错误消息:', error.message);
        console.error('错误堆栈:', error.stack);
    }
}

testCosyVoiceTTS();