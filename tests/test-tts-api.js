const axios = require('axios');
const fs = require('fs');
const path = require('path');

// API配置
const API_BASE_URL = 'http://localhost:3000';
const API_KEY = 'key1'; // 使用.env文件中配置的API密钥

// 测试数据
const testData = {
  service: 'aliyun_qwen_http',
  text: '那我来给大家推荐一款T恤，这款呢真的是超级好看，这个颜色呢很显气质，而且呢也是搭配的绝佳单品，大家可以闭眼入，真的是非常好看，对身材的包容性也很好，不管啥身材的宝宝呢，穿上去都是很好看的。推荐宝宝们下单哦。',
  voice: 'cosyvoice-longxiaochun',
  speed: 1.0,
  pitch: 1.0,
  volume: 5,
  format: 'mp3',
  sample_rate: 22050
};

// 测试函数
async function testTtsApi() {
  console.log('开始测试TTS API...');
  console.log('API地址:', API_BASE_URL);
  console.log('API密钥:', API_KEY);
  console.log('测试数据:', JSON.stringify(testData, null, 2));
  console.log('----------------------------------------');

  try {
    // 1. 测试健康检查端点
    console.log('\n1. 测试健康检查端点...');
    const healthResponse = await axios.get(`${API_BASE_URL}/health`);
    console.log('健康检查响应:', JSON.stringify(healthResponse.data, null, 2));

    // 2. 测试获取音色列表
    console.log('\n2. 测试获取音色列表...');
    const voicesResponse = await axios.get(`${API_BASE_URL}/api/tts/voices`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    console.log('音色列表获取成功，数量:', voicesResponse.data.voices?.length || 0);
    
    // 3. 测试TTS合成
    console.log('\n3. 测试TTS合成...');
    const startTime = Date.now();
    const ttsResponse = await axios.post(`${API_BASE_URL}/api/tts/synthesize`, testData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    const endTime = Date.now();
    
    console.log('TTS合成成功!');
    console.log('响应时间:', (endTime - startTime) / 1000, '秒');
    console.log('响应数据:', JSON.stringify(ttsResponse.data, null, 2));
    
    // 4. 如果返回了音频URL，尝试下载并保存
    if (ttsResponse.data.success && ttsResponse.data.data && ttsResponse.data.data.audioUrl) {
      console.log('\n4. 下载音频文件...');
      const audioUrl = ttsResponse.data.data.audioUrl;
      const audioResponse = await axios.get(`${API_BASE_URL}${audioUrl}`, {
        responseType: 'arraybuffer'
      });
      
      // 保存音频文件
      const fileName = `test-audio-${Date.now()}.mp3`;
      const filePath = path.join(__dirname, fileName);
      fs.writeFileSync(filePath, Buffer.from(audioResponse.data));
      console.log(`音频文件已保存: ${filePath}`);
    }
    
    console.log('\n----------------------------------------');
    console.log('所有测试完成! API可用性验证成功。');
    
  } catch (error) {
    console.error('\n测试失败!');
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('无法连接到服务器，请确保服务器正在运行');
    } else {
      console.error('错误:', error.message);
    }
  }
}

// 运行测试
testTtsApi();