const http = require('http');

const testData = {
  service: 'aliyun_qwen_http',
  text: '你好，我是Bella。This is a multilingual test.',
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

console.log('🎤 Testing Qwen Flash - Bella Voice');
console.log('=====================================\n');

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('\nResponse:');

    try {
      const result = JSON.parse(data);
      console.log(JSON.stringify(result, null, 2));

      if (result.success && result.data) {
        console.log('\n✅ SUCCESS!');
        console.log('📁 Audio File Info:');
        console.log('   Voice:', result.data.voice);
        console.log('   Model:', result.data.model);
        console.log('   Format:', result.data.format);
        console.log('   Audio URL:', result.data.audioUrl);
        console.log('   File Name:', result.data.fileName);
        console.log('   Task ID:', result.data.taskId);
        console.log('\n💡 You can access the audio at: http://localhost:3000' + result.data.audioUrl);
      } else {
        console.log('\n❌ FAILED');
      }
    } catch (e) {
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request Error:', error.message);
  console.log('\n⚠️  Make sure the service is running: npm run dev');
});

req.write(postData);
req.end();

console.log('⏳ Sending request...\n');
