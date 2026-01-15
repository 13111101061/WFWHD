require('dotenv').config();
const axios = require('axios');

async function testDirectApi() {
  try {
    console.log('直接测试SNPan API...');
    
    // 从环境变量获取配置
    const aid = process.env.SNPAN_AID;
    const key = process.env.SNPAN_KEY;
    
    console.log('使用AID:', aid);
    console.log('使用KEY:', key ? '已配置' : '未配置');
    
    if (!aid || !key) {
      console.error('缺少必要的环境变量配置');
      return;
    }
    
    // 直接调用获取authcode的API
    const response = await axios.get('https://api.snpan.com/opapi/GetAuthCode', {
      params: {
        aid: aid,
        key: key
      },
      timeout: 10000
    });
    
    console.log('API响应:', JSON.stringify(response.data, null, 2));
    
    if (response.data.code === 200) {
      console.log('认证成功!');
      console.log('Authcode:', response.data.data);
    } else {
      console.log('认证失败:', response.data.msg);
    }
  } catch (error) {
    console.error('请求失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 执行测试
testDirectApi();