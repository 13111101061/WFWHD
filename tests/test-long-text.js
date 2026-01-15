#!/usr/bin/env node

/**
 * 测试长文本音频生成
 */

const CosyVoiceService = require('./src/modules/tts/services/cosyVoiceService');

async function testLongText() {
    console.log('📖 测试长文本音频生成...\n');

    const longText = '今天天气很好，阳光明媚，万里无云。小鸟在枝头欢快地歌唱，花儿在微风中轻轻摇曳。这是一个适合出门散步的好日子，我们可以去公园走走，呼吸新鲜空气，感受大自然的美好。生活就像这美好的天气一样，充满了希望和机遇。';

    console.log('📝 测试参数:');
    console.log(`- 文本长度: ${longText.length} 字符`);
    console.log('- 文本内容: ' + longText.substring(0, 30) + '...');
    console.log('- 音色: longxiaochun_v2');

    try {
        console.log('\n🎤 开始长文本语音合成...');
        const startTime = Date.now();
        const result = await CosyVoiceService.synthesize(longText, {
            voice: 'longxiaochun_v2'
        });
        const endTime = Date.now();

        console.log(`✅ 长文本合成完成 (${endTime - startTime}ms)`);
        console.log('合成结果:');
        console.log(JSON.stringify(result, null, 2));

        if (result && result.audioUrl) {
            console.log(`\n🎉 成功生成长文本音频: ${result.audioUrl}`);

            // 检查文件大小
            const fs = require('fs');
            const path = require('path');
            const fullPath = path.join(__dirname, result.filePath || 'src/storage/uploads/audio', path.basename(result.audioUrl));

            if (fs.existsSync(fullPath)) {
                const stats = fs.statSync(fullPath);
                console.log(`📊 文件大小: ${stats.size} 字节`);
                console.log(`📅 创建时间: ${stats.mtime}`);

                // 计算音频时长估算
                const estimatedDuration = stats.size / 22050 / 2; // 假设22kHz 16bit
                console.log(`🕐 估算音频时长: ${estimatedDuration.toFixed(2)} 秒`);
            }
        }

    } catch (error) {
        console.error('💥 长文本测试失败:', error.message);
    }
}

testLongText();