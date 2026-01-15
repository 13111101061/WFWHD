const http = require('http');

const postData = JSON.stringify({
  service: 'aliyun_qwen_http',
  text: '你好，我是Bella。今天天气真好。',
  voice: 'Bella',
  model: 'qwen3-tts-flash'
});

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

console.log('Testing Bella voice...\n');

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

req.write(postData);
req.end();
