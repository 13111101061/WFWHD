/**
 * Qwen Flash 多语言测试
 * 测试 Bella 音色 + Auto 语言检测 + 中英日混合文本
 */

const http = require('http');

function testQwenFlash() {
  const testData = {
    service: 'aliyun_qwen_http',
    text: '你好Helloこんにちは，这是一个多语言测试。This is a multilingual test.これは多言語テストです。',
    voice: 'Bella',
    language_type: 'Auto'
  };

  const postData = JSON.stringify(testData);

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/tts/synthesize',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'X-API-Key': 'key2'
    }
  };

  console.log('🧪 测试 Qwen Flash 多语言支持');
  console.log('================================');
  console.log('🎤 音色: Bella (萌宝 - 小萝莉)');
  console.log('🤖 模型: qwen3-tts-flash');
  console.log('🌍 语言: Auto (自动检测)');
  console.log('📝 测试文本:');
  console.log('   - 中文: 你好，这是一个多语言测试');
  console.log('   - English: Hello, This is a multilingual test');
  console.log('   - 日本語: こんにちは、これは多言語テストです');
  console.log('================================\n');

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('📡 状态码:', res.statusCode);
        console.log('');

        try {
          const result = JSON.parse(data);

          if (result.success) {
            console.log('✅ 测试成功！');
            console.log('');
            console.log('📊 响应数据:');
            console.log('--------------------------------');
            console.log('🎤 音色:', result.data.voice);
            console.log('🤖 模型:', result.data.model);
            console.log('🔗 音频链接:', result.data.audioUrl);
            console.log('📁 文件路径:', result.data.filePath);
            console.log('📄 文件名:', result.data.fileName);
            console.log('⏱️ 创建时间:', result.data.createdAt);
            console.log('--------------------------------');

            if (result.data.model === 'qwen3-tts-flash') {
              console.log('✅ 确认使用 Flash 模型');
            } else {
              console.log('⚠️ 模型不匹配，预期: qwen3-tts-flash，实际:', result.data.model);
            }

            resolve(result);
          } else {
            console.log('❌ 测试失败');
            console.log('错误信息:', result.error || result.message);
            reject(result);
          }
        } catch (error) {
          console.log('❌ JSON 解析失败');
          console.log('原始响应:', data);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ 请求失败:', error.message);
      console.log('');
      console.log('⚠️ 请确保:');
      console.log('   1. 服务已启动: npm run dev 或 pnpm dev');
      console.log('   2. 端口 3000 未被占用');
      console.log('   3. API Key 已配置');
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// 运行测试
testQwenFlash()
  .then(() => {
    console.log('\n✅ 测试完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.log('\n❌ 测试失败！');
    process.exit(1);
  });
