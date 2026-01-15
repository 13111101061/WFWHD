/**
 * Qwen TTS 直接连接测试脚本
 * 绕过所有中间层，直接测试服务商服务连接性
 */

const config = require('../src/shared/config/config');

console.log('========================================');
console.log('🔗 Qwen TTS 直接连接测试');
console.log('========================================\n');

async function testQwenDirectConnection() {
  try {
    // 1. 获取 API Key
    const apiKey = config.api.qwen.apiKey || config.api.tts.apiKey;

    if (!apiKey || apiKey === 'dev-api-key') {
      console.error('❌ 未配置有效的 Qwen API Key');
      console.log('请在 .env 文件中设置 QWEN_API_KEY 或 TTS_API_KEY');
      process.exit(1);
    }

    console.log('1️⃣  API Key 配置');
    console.log(`✅ 检测到 API Key: ${apiKey.substring(0, 10)}...`);
    console.log('');

    // 2. 测试不同的模型
    const models = [
      'qwen-tts',           // 标准模型
      'qwen-audio-tts',     // 音频模型
      'qwen-3-tts-flash',   // Flash 模型（可能的新模型）
      'qwen3-tts-flash',    // 备选格式
      'qwen-2-tts'          // 其他可能的模型
    ];

    console.log('2️⃣  测试不同模型的连接性...\n');

    const testVoice = 'Cherry';
    const testText = '你好，这是一个测试';

    for (const model of models) {
      console.log(`----------------------------------------`);
      console.log(`测试模型: ${model}`);
      console.log(`----------------------------------------`);

      try {
        const requestData = {
          model: model,
          input: {
            text: testText,
            voice: testVoice
          }
        };

        console.log('请求数据:');
        console.log(JSON.stringify(requestData, null, 2));
        console.log('');

        console.log('发送请求到阿里云 API...');

        const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestData)
        });

        console.log(`响应状态码: ${response.status}`);

        const result = await response.json();

        if (response.ok) {
          console.log('✅ 模型可用!');
          console.log(`返回数据:`, JSON.stringify(result, null, 2));

          if (result.output && result.output.audio && result.output.audio.url) {
            console.log(`\n🎵 音频URL: ${result.output.audio.url}`);
            console.log(`音频ID: ${result.output.audio.id}`);
          }
        } else {
          console.log('❌ 模型不可用');
          console.log(`错误信息:`, JSON.stringify(result, null, 2));
        }

      } catch (error) {
        console.log('❌ 请求失败');
        console.log(`错误: ${error.message}`);
      }

      console.log('');
    }

    // 3. 测试不同的音色
    console.log('========================================');
    console.log('3️⃣  测试不同音色的连接性');
    console.log('========================================\n');

    const voices = ['Cherry', 'Chelsie', 'Ethan', 'Serena', 'Dylan'];
    const workingModel = 'qwen-tts'; // 使用已知可用的模型

    for (const voice of voices) {
      console.log(`测试音色: ${voice}`);

      try {
        const requestData = {
          model: workingModel,
          input: {
            text: '测试',
            voice: voice
          }
        };

        const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestData)
        });

        const result = await response.json();

        if (response.ok) {
          console.log(`✅ ${voice} - 可用`);
        } else {
          console.log(`❌ ${voice} - ${result.message || '不可用'}`);
        }

      } catch (error) {
        console.log(`❌ ${voice} - 请求失败`);
      }

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('\n========================================');
    console.log('✅ 测试完成！');
    console.log('========================================\n');

    // 4. 总结建议
    console.log('📝 建议:');
    console.log('1. 根据上面的测试结果，找出可用的模型和音色');
    console.log('2. 更新 voiceIdMapping.json 中的 model 字段');
    console.log('3. 确保 QwenTtsHttpService 中的默认模型正确\n');

  } catch (error) {
    console.error('\n❌ 测试失败:');
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
testQwenDirectConnection().catch(error => {
  console.error('\n❌ 未捕获的错误:');
  console.error(error);
  process.exit(1);
});
