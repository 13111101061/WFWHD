/**
 * Qwen Flash Bella 音色测试脚本
 * 测试 Qwen3-tts-flash 模型的 Bella 音色
 */

const http = require('http');

// 测试数据
const testData = {
  service: 'aliyun_qwen_http',
  text: '你好，我是 Bella。今天天气真不错，我们来测试一下语音合成功能。This is a test for Qwen Flash with Bella voice.',
  voice: 'Bella',
  model: 'qwen3-tts-flash'
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

console.log('🎤 测试 Qwen Flash - Bella 音色');
console.log('================================');
console.log('📋 测试配置:');
console.log(`   服务: ${testData.service}`);
console.log(`   模型: ${testData.model}`);
console.log(`   音色: ${testData.voice}`);
console.log(`   语言: Auto (自动检测)`);
console.log('================================');
console.log('📝 测试文本:');
console.log(`   ${testData.text}`);
console.log('================================\n');

const startTime = Date.now();

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('📊 响应状态:');
    console.log(`   HTTP 状态码: ${res.statusCode}`);
    console.log(`   响应时间: ${duration}秒`);
    console.log('================================\n');

    try {
      const result = JSON.parse(data);
      console.log('📦 API 响应:');
      console.log(JSON.stringify(result, null, 2));
      console.log('\n================================\n');

      if (result.success && result.data && result.data.audioUrl) {
        console.log('✅ 测试成功！');
        console.log('📁 音频文件信息:');
        console.log(`   🔗 音频链接: ${result.data.audioUrl}`);
        console.log(`   📂 文件路径: ${result.data.filePath}`);
        console.log(`   📄 文件名: ${result.data.fileName}`);
        console.log(`   🎤 音色: ${result.data.voice}`);
        console.log(`   🤖 模型: ${result.data.model}`);
        console.log(`   📊 格式: ${result.data.format}`);
        if (result.data.duration) {
          console.log(`   ⏱️  时长: ${result.data.duration}秒`);
        }
        console.log(`   🕐 创建时间: ${result.data.createdAt}`);
        console.log('\n💡 提示: 可以在浏览器中打开音频链接试听');
      } else {
        console.log('❌ 测试失败');
        console.log('原因: ', result.message || result.error || '未知错误');
      }
    } catch (error) {
      console.log('❌ 解析响应失败');
      console.log('错误信息:', error.message);
      console.log('\n原始响应:');
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('🔴 请求失败:', error.message);
  console.log('\n⚠️  故障排除建议:');
  console.log('   1. 确保服务已启动: npm run dev');
  console.log('   2. 检查端口 3000 是否被占用');
  console.log('   3. 确认 API 密钥配置正确');
  console.log('   4. 查看 .env 文件中的 TTS_API_KEY');
});

req.write(postData);
req.end();

console.log('⏳ 正在发送请求...\n');
