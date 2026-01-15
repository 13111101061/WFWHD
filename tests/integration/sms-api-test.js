/**
 * 短信接码API接口测试脚本
 * 测试通过HTTP API调用短信接码服务
 */

require('dotenv').config();
const axios = require('axios');

// 测试配置
const TEST_CONFIG = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
  apiKey: process.env.API_KEYS ? process.env.API_KEYS.split(',')[0] : 'key1',
  testSid: 1001, // 测试项目ID
  timeout: 10000 // 请求超时时间
};

// 创建axios实例
const api = axios.create({
  baseURL: TEST_CONFIG.baseUrl,
  timeout: TEST_CONFIG.timeout,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': TEST_CONFIG.apiKey
  }
});

// 测试结果统计
let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

// 测试工具函数
function logTest(testName, status, message = '') {
  testResults.total++;
  if (status) {
    testResults.passed++;
    console.log(`✅ ${testName}: 通过 ${message}`);
  } else {
    testResults.failed++;
    testResults.errors.push(`${testName}: ${message}`);
    console.log(`❌ ${testName}: 失败 - ${message}`);
  }
}

function logInfo(message) {
  console.log(`ℹ️  ${message}`);
}

function logError(message) {
  console.log(`🚨 ${message}`);
}

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// API测试函数
async function testHealthCheck() {
  console.log('\n🏥 测试健康检查接口...');
  
  try {
    const response = await api.get('/api/sms/health');
    
    if (response.status === 200 && response.data.success) {
      logTest('健康检查', true, `服务状态: ${response.data.data.status}`);
      
      if (response.data.data.balance !== undefined) {
        logInfo(`账户余额: ${response.data.data.balance}`);
      }
    } else {
      logTest('健康检查', false, response.data.message || '服务异常');
    }
  } catch (error) {
    if (error.response && error.response.status === 503) {
      logTest('健康检查', false, '服务不可用 - 可能是配置问题');
    } else {
      logTest('健康检查', false, error.message);
    }
  }
}

async function testGetAccountInfo() {
  console.log('\n💰 测试获取账号信息接口...');
  
  try {
    const response = await api.get('/api/sms/account');
    
    if (response.status === 200 && response.data.success) {
      logTest('获取账号信息', true, 
        `用户: ${response.data.data.username || '未知'}, 余额: ${response.data.data.balance || '未知'}`);
    } else {
      logTest('获取账号信息', false, response.data.message || '获取失败');
    }
  } catch (error) {
    logTest('获取账号信息', false, 
      error.response ? error.response.data.message : error.message);
  }
}

async function testGetOperators() {
  console.log('\n📋 测试获取运营商列表接口...');
  
  try {
    const response = await api.get('/api/sms/operators');
    
    if (response.status === 200 && response.data.success) {
      const operators = response.data.data;
      logTest('获取运营商列表', Array.isArray(operators) && operators.length > 0, 
        `运营商数量: ${operators.length}`);
      
      if (operators.length > 0) {
        logInfo(`可用运营商: ${operators.slice(0, 3).map(op => op.name).join(', ')}...`);
      }
    } else {
      logTest('获取运营商列表', false, response.data.message || '获取失败');
    }
  } catch (error) {
    logTest('获取运营商列表', false, 
      error.response ? error.response.data.message : error.message);
  }
}

async function testGetProvinces() {
  console.log('\n🗺️ 测试获取省份列表接口...');
  
  try {
    const response = await api.get('/api/sms/provinces');
    
    if (response.status === 200 && response.data.success) {
      const provinces = response.data.data;
      logTest('获取省份列表', Array.isArray(provinces) && provinces.length > 0, 
        `省份数量: ${provinces.length}`);
      
      if (provinces.length > 0) {
        logInfo(`可用省份: ${provinces.slice(0, 5).map(prov => prov.name).join(', ')}...`);
      }
    } else {
      logTest('获取省份列表', false, response.data.message || '获取失败');
    }
  } catch (error) {
    logTest('获取省份列表', false, 
      error.response ? error.response.data.message : error.message);
  }
}

async function testGetPhone() {
  console.log('\n📱 测试获取手机号接口...');
  
  try {
    const requestData = {
      sid: TEST_CONFIG.testSid,
      isp: 1, // 移动
      ascription: 2 // 实卡
    };
    
    logInfo(`请求参数: ${JSON.stringify(requestData)}`);
    
    const response = await api.post('/api/sms/phone', requestData);
    
    if (response.status === 200 && response.data.success) {
      const phoneData = response.data.data;
      logTest('获取手机号', true, `手机号: ${phoneData.phone || '未知'}`);
      
      if (phoneData.phone) {
        logInfo(`获取到手机号: ${phoneData.phone}`);
        return phoneData.phone;
      }
    } else {
      logTest('获取手机号', false, response.data.message || '获取失败');
    }
  } catch (error) {
    logTest('获取手机号', false, 
      error.response ? error.response.data.message : error.message);
  }
  
  return null;
}

async function testGetMessage(phone) {
  console.log('\n💬 测试获取验证码接口...');
  
  if (!phone) {
    logTest('获取验证码', false, '手机号无效');
    return;
  }
  
  try {
    const requestData = {
      sid: TEST_CONFIG.testSid,
      phone: phone,
      maxRetries: 5,
      retryInterval: 1000
    };
    
    logInfo(`请求参数: ${JSON.stringify(requestData)}`);
    logInfo('注意: 这需要实际发送短信到该手机号才能收到验证码');
    
    const response = await api.post('/api/sms/message', requestData);
    
    if (response.status === 200 && response.data.success) {
      const messageData = response.data.data;
      logTest('获取验证码', true, `验证码: ${messageData.message || '未收到'}`);
      
      if (messageData.message) {
        logInfo(`收到验证码: ${messageData.message}`);
      }
    } else {
      logTest('获取验证码', false, response.data.message || '获取失败');
      logInfo('提示: 如果没有实际发送短信，获取验证码会超时，这是正常的');
    }
  } catch (error) {
    logTest('获取验证码', false, 
      error.response ? error.response.data.message : error.message);
    logInfo('提示: 获取验证码失败可能是因为没有实际发送短信');
  }
}

async function testReleasePhone(phone) {
  console.log('\n🔄 测试释放手机号接口...');
  
  if (!phone) {
    logTest('释放手机号', false, '手机号无效');
    return;
  }
  
  try {
    const requestData = {
      sid: TEST_CONFIG.testSid,
      phone: phone
    };
    
    logInfo(`请求参数: ${JSON.stringify(requestData)}`);
    
    const response = await api.delete('/api/sms/phone', { data: requestData });
    
    if (response.status === 200 && response.data.success) {
      logTest('释放手机号', true, `手机号 ${phone} 已释放`);
    } else {
      logTest('释放手机号', false, response.data.message || '释放失败');
    }
  } catch (error) {
    logTest('释放手机号', false, 
      error.response ? error.response.data.message : error.message);
  }
}

async function testCompleteFlow() {
  console.log('\n🔄 测试完整接码流程接口...');
  
  try {
    const requestData = {
      sid: TEST_CONFIG.testSid,
      maxRetries: 5,
      isp: 1, // 移动
      ascription: 2 // 实卡
    };
    
    logInfo(`请求参数: ${JSON.stringify(requestData)}`);
    
    const response = await api.post('/api/sms/complete', requestData);
    
    if (response.status === 200 && response.data.success) {
      const result = response.data.data;
      logTest('完整接码流程', true, 
        `手机号: ${result.phone}, 验证码: ${result.message || '未收到'}`);
      
      if (result.message) {
        logInfo(`完整流程成功: ${result.phone} -> ${result.message}`);
      } else {
        logInfo(`获取手机号成功: ${result.phone}，但未收到验证码（需要实际发送短信）`);
      }
    } else {
      logTest('完整接码流程', false, response.data.message || '流程失败');
    }
  } catch (error) {
    logTest('完整接码流程', false, 
      error.response ? error.response.data.message : error.message);
  }
}

async function testApiKeyValidation() {
  console.log('\n🔐 测试API密钥验证...');
  
  try {
    // 测试无API密钥
    const noKeyApi = axios.create({
      baseURL: TEST_CONFIG.baseUrl,
      timeout: TEST_CONFIG.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const response = await noKeyApi.get('/api/sms/health');
    logTest('无API密钥访问', false, '应该被拒绝但通过了');
  } catch (error) {
    if (error.response && error.response.status === 401) {
      logTest('无API密钥访问', true, '正确拒绝了无效请求');
    } else {
      logTest('无API密钥访问', false, '意外的错误: ' + error.message);
    }
  }
  
  try {
    // 测试错误的API密钥
    const wrongKeyApi = axios.create({
      baseURL: TEST_CONFIG.baseUrl,
      timeout: TEST_CONFIG.timeout,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'wrong-key'
      }
    });
    
    const response = await wrongKeyApi.get('/api/sms/health');
    logTest('错误API密钥访问', false, '应该被拒绝但通过了');
  } catch (error) {
    if (error.response && error.response.status === 401) {
      logTest('错误API密钥访问', true, '正确拒绝了无效密钥');
    } else {
      logTest('错误API密钥访问', false, '意外的错误: ' + error.message);
    }
  }
}

async function testParameterValidation() {
  console.log('\n📝 测试参数验证...');
  
  try {
    // 测试缺少必需参数
    const response = await api.post('/api/sms/phone', {});
    logTest('缺少必需参数', false, '应该返回400错误');
  } catch (error) {
    if (error.response && error.response.status === 400) {
      logTest('缺少必需参数', true, '正确返回400错误');
    } else {
      logTest('缺少必需参数', false, '意外的错误: ' + error.message);
    }
  }
  
  try {
    // 测试无效参数类型
    const response = await api.post('/api/sms/phone', {
      sid: 'invalid-sid'
    });
    logTest('无效参数类型', false, '应该返回400错误');
  } catch (error) {
    if (error.response && (error.response.status === 400 || error.response.status === 500)) {
      logTest('无效参数类型', true, '正确处理了无效参数');
    } else {
      logTest('无效参数类型', false, '意外的错误: ' + error.message);
    }
  }
}

// 主测试函数
async function runApiTests() {
  console.log('🚀 开始短信接码API接口测试');
  console.log('='.repeat(50));
  console.log(`测试服务器: ${TEST_CONFIG.baseUrl}`);
  console.log(`使用API密钥: ${TEST_CONFIG.apiKey}`);
  console.log(`测试项目ID: ${TEST_CONFIG.testSid}`);
  
  // 测试API密钥验证
  await testApiKeyValidation();
  
  // 测试参数验证
  await testParameterValidation();
  
  // 测试健康检查
  await testHealthCheck();
  
  // 测试获取账号信息
  await testGetAccountInfo();
  
  // 测试获取运营商列表
  await testGetOperators();
  
  // 测试获取省份列表
  await testGetProvinces();
  
  // 测试获取手机号
  const phone = await testGetPhone();
  
  if (phone) {
    // 测试获取验证码
    await testGetMessage(phone);
    
    // 等待一下再释放
    await delay(1000);
    
    // 测试释放手机号
    await testReleasePhone(phone);
  } else {
    logInfo('跳过验证码和释放手机号测试（未获取到手机号）');
  }
  
  // 测试完整流程
  await testCompleteFlow();
  
  // 打印测试总结
  printTestSummary();
}

function printTestSummary() {
  console.log('\n' + '='.repeat(50));
  console.log('📊 API测试总结');
  console.log('='.repeat(50));
  console.log(`总测试数: ${testResults.total}`);
  console.log(`通过: ${testResults.passed}`);
  console.log(`失败: ${testResults.failed}`);
  
  if (testResults.failed > 0) {
    console.log('\n❌ 失败的测试:');
    testResults.errors.forEach(error => {
      console.log(`  - ${error}`);
    });
  }
  
  if (testResults.passed === testResults.total) {
    console.log('\n🎉 所有API测试通过！短信接码API集成成功！');
  } else {
    console.log('\n⚠️  部分API测试失败，请检查服务器和配置');
  }
  
  console.log('\n💡 使用提示:');
  console.log('1. 确保服务器正在运行');
  console.log('2. 确保API密钥配置正确');
  console.log('3. 确保短信接码服务配置正确');
  console.log('4. 获取验证码需要实际发送短信才能成功');
}

// 运行测试
if (require.main === module) {
  runApiTests().catch(error => {
    console.error('API测试运行出错:', error);
    process.exit(1);
  });
}

module.exports = {
  runApiTests,
  TEST_CONFIG
};