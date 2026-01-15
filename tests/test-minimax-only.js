#!/usr/bin/env node

/**
 * 只测试MiniMax TTS服务
 */

async function testMiniMaxTTS() {
    console.log('🟣 测试MiniMax TTS服务...\n');

    try {
        const service = require('./src/modules/tts/services/minimaxTtsService');

        console.log('📝 测试参数:');
        console.log('- 文本: "你好，这是MiniMax测试"');
        console.log('- 音色: presenter_female');
        console.log('- 模型: speech-01-hd');

        console.log('\n🎤 开始语音合成...');
        const startTime = Date.now();
        const result = await service.synthesize('你好，这是MiniMax测试', {
            voice: 'presenter_female',
            model: 'speech-01-hd'
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
        console.error('💥 MiniMax TTS测试失败:');
        console.error('错误类型:', error.constructor.name);
        console.error('错误消息:', error.message);

        if (error.message.includes('API_KEY')) {
            console.log('\n💡 这是MiniMax API密钥问题');
        }
    }
}

testMiniMaxTTS();