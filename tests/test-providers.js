const axios = require('axios');

// API配置
const API_BASE_URL = 'http://localhost:3000';
const API_KEY = 'key1';

// 测试获取提供商列表
async function testProviders() {
  try {
    console.log('获取TTS服务提供商列表...');
    const response = await axios.get(`${API_BASE_URL}/api/tts/providers`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    
    console.log('提供商列表:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('获取提供商列表失败:', error.response?.data || error.message);
  }
}

// 测试获取音色列表
async function testVoices() {
  try {
    console.log('\n获取音色列表...');
    const response = await axios.get(`${API_BASE_URL}/api/tts/voices`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    
    console.log('音色列表:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('获取音色列表失败:', error.response?.data || error.message);
  }
}

// 测试服务统计信息
async function testStats() {
  try {
    console.log('\n获取服务统计信息...');
    const response = await axios.get(`${API_BASE_URL}/api/tts/stats`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    
    console.log('服务统计:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('获取服务统计失败:', error.response?.data || error.message);
  }
}

// 运行所有测试
async function runTests() {
  await testProviders();
  await testVoices();
  await testStats();
}

runTests();