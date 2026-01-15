require('dotenv').config();
const axios = require('axios');

async function testUploadKey() {
  console.log('=== 测试上传秘钥 ===\n');
  
  try {
    console.log('测试上传秘钥认证...');
    console.log('上传AID:', process.env.SNPAN_UPLOAD_AID);
    console.log('上传KEY:', process.env.SNPAN_UPLOAD_KEY ? '已配置' : '未配置');
    
    const response = await axios.get('https://api.snpan.com/opapi/GetAuthCode', {
      params: {
        aid: process.env.SNPAN_UPLOAD_AID,
        key: process.env.SNPAN_UPLOAD_KEY
      },
      timeout: 10000
    });
    
    console.log('上传秘钥认证响应:', JSON.stringify(response.data, null, 2));
    
    if (response.data.code === 200) {
      console.log('√ 上传秘钥认证成功');
      console.log('Authcode:', response.data.data);
    } else {
      console.log('× 上传秘钥认证失败:', response.data.msg);
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
testUploadKey();