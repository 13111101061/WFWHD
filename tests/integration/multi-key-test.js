const axios = require('axios');

// 上传秘钥
const uploadConfig = {
  aid: 'Z9UKA3JQ4ll2wjb4',
  key: 'tMX18G1brFYuK40Sb00u8anj7I2JBpIq'
};

// 鉴权秘钥
const authConfig = {
  aid: '9GUrUh46mYp5i23a',
  key: 'pZTrhp3xQLOEnh2mx2oM145pRSzTOY8J'
};

async function testAuthCode(config, type) {
  try {
    console.log(`\n测试${type}秘钥认证...`);
    console.log(`AID: ${config.aid}`);
    
    const response = await axios.get('https://api.snpan.com/opapi/GetAuthCode', {
      params: config,
      timeout: 10000
    });
    
    console.log(`认证响应: ${JSON.stringify(response.data, null, 2)}`);
    
    if (response.data.code === 200) {
      console.log(`√ ${type}秘钥认证成功`);
      return response.data.data;
    } else {
      console.log(`× ${type}秘钥认证失败: ${response.data.msg}`);
      return null;
    }
  } catch (error) {
    console.error(`× ${type}秘钥认证请求失败:`, error.message);
    return null;
  }
}

async function testGetUploadUrl(authcode) {
  try {
    console.log('\n测试获取上传地址...');
    
    const response = await axios.get('https://api.snpan.com/opapi/Getuploads', {
      params: { authcode },
      timeout: 10000
    });
    
    console.log(`上传地址响应: ${JSON.stringify(response.data, null, 2)}`);
    
    if (response.data.code === 200) {
      const uploadUrl = response.data.data.url + '/upload?' + response.data.data.query;
      console.log('√ 获取上传地址成功');
      console.log(`上传地址: ${uploadUrl}`);
      return uploadUrl;
    } else {
      console.log(`× 获取上传地址失败: ${response.data.msg}`);
      return null;
    }
  } catch (error) {
    console.error('× 获取上传地址请求失败:', error.message);
    return null;
  }
}

async function testGetSign(authcode) {
  try {
    console.log('\n测试获取鉴权链接...');
    
    const response = await axios.get('https://api.snpan.com/opapi/GetSign', {
      params: { 
        authcode,
        file: 'https://qz.snpan.cn/file/snpanmee0imgd5ves32i0.png'
      },
      timeout: 10000
    });
    
    console.log(`鉴权链接响应: ${JSON.stringify(response.data, null, 2)}`);
    
    if (response.data.code === 200) {
      console.log('√ 获取鉴权链接成功');
      console.log(`鉴权链接: ${response.data.data.url}`);
      return response.data.data;
    } else {
      console.log(`× 获取鉴权链接失败: ${response.data.msg}`);
      return null;
    }
  } catch (error) {
    console.error('× 获取鉴权链接请求失败:', error.message);
    return null;
  }
}

async function main() {
  console.log('=== SNPan 多秘钥功能测试 ===');
  
  // 测试上传秘钥认证
  const uploadAuthcode = await testAuthCode(uploadConfig, '上传');
  
  // 如果上传秘钥认证成功，测试获取上传地址
  if (uploadAuthcode) {
    await testGetUploadUrl(uploadAuthcode);
  }
  
  // 测试鉴权秘钥认证
  const authAuthcode = await testAuthCode(authConfig, '鉴权');
  
  // 如果鉴权秘钥认证成功，测试获取鉴权链接
  if (authAuthcode) {
    await testGetSign(authAuthcode);
  }
  
  console.log('\n=== 测试完成 ===');
}

// 执行测试
main();