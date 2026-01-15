const http = require('http');

const testData = {
  service: 'aliyun_qwen_http',
  text: '你好，我是Bella。',
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

console.log('🎤 Request Parameters:');
console.log(JSON.stringify(testData, null, 2));
console.log('\n⏳ Sending request...\n');

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const result = JSON.parse(data);

    console.log('📦 Response:');
    console.log(JSON.stringify(result, null, 2));

    console.log('\n🔍 Check Details:');
    console.log('- Success:', result.success);
    console.log('- Has data:', !!result.data);
    console.log('- Has voice field:', result.data && 'voice' in result.data);
    console.log('- Voice value:', result.data?.voice);

    if (result.data) {
      console.log('\n📋 All fields in data:', Object.keys(result.data));
      console.log('\n📁 File info:');
      console.log('  - fileName:', result.data.fileName);
      console.log('  - model:', result.data.model);
      console.log('  - format:', result.data.format);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error.message);
});

req.write(postData);
req.end();
