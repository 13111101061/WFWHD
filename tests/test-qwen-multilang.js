/**
 * Qwen Flash 多语言测试脚本
 * 测试自动语言检测功能
 */

const http = require('http');

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
console.log('音色: Bella');
console.log('语言: Auto (自动检测)');
console.log('测试文本: 你好Helloこんにちは');
console.log('================================\n');

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('状态码:', res.statusCode);
    console.log('响应:\n');

    try {
      const result = JSON.parse(data);
      console.log(JSON.stringify(result, null, 2));

      if (result.success && result.data && result.data.audioUrl) {
        console.log('\n✅ 成功！');
        console.log(`🔗 音频链接: ${result.data.audioUrl}`);
        console.log(`📁 文件路径: ${result.data.filePath}`);
        console.log(`🎤 音色: ${result.data.voice}`);
        console.log(`🤖 模型: ${result.data.model}`);
      } else {
        console.log('\n❌ 失败');
      }
    } catch (error) {
      console.log('原始响应:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('请求失败:', error.message);
  console.log('\n⚠️ 请确保服务已启动: npm run dev');
});

req.write(postData);
req.end();
