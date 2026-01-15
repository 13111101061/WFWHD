/**
 * 短信接码服务测试脚本
 * 测试短信接码服务的各项功能
 */

require('dotenv').config();
const SmsCodeService = require('../src/modules/sms/services/smsCodeService');

// 测试配置
const TEST_CONFIG = {
  username: process.env.SMS_CODE_USERNAME || 'your-sms-username',
  password: process.env.SMS_CODE_PASSWORD || 'your-sms-password',
  server: process.env.SMS_CODE_SERVER || 'http://api.example.com',
  testSid: 1001, // 测试项目ID，请根据实际情况修改
  maxRetries: 5,  // 减少测试时的重试次数
  retryInterval: 1000 // 减少测试时的重试间隔
};

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

// 测试函数
async function testEnvironmentVariables() {
  console.log('\n📋 测试环境变量配置...');
  
  const requiredVars = ['SMS_CODE_USERNAME', 'SMS_CODE_PASSWORD', 'SMS_CODE_SERVER'];
  let allConfigured = true;
  
  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value || value.includes('your-') || value.includes('example.com')) {
      logTest(`环境变量 ${varName}`, false, '未正确配置');
      allConfigured = false;
    } else {
      logTest(`环境变量 ${varName}`, true, '已配置');
    }
  }
  
  return allConfigured;
}

async function testServiceInitialization() {
  console.log('\n🔧 测试服务初始化...');
  
  try {
    const smsService = new SmsCodeService();
    
    logTest('服务实例创建', true, '成功创建SmsCodeService实例');
    
    return smsService;
  } catch (error) {
    logTest('服务实例创建', false, error.message);
    return null;
  }
}

async function testLogin(smsService) {
  console.log('\n🔐 测试登录功能...');
  
  if (!smsService) {
    logTest('登录测试', false, '服务实例不可用');
    return false;
  }
  
  try {
    const token = await smsService.login();
    
    if (token && typeof token === 'string') {
      logTest('登录请求', true, `登录成功，Token: ${token.substring(0, 20)}...`);
      return true;
    } else {
      logTest('登录请求', false, '登录失败，未获取到token');
      return false;
    }
  } catch (error) {
    logTest('登录请求', false, error.message);
    return false;
  }
}

async function testGetAccountInfo(smsService) {
  console.log('\n💰 测试获取账号信息...');
  
  if (!smsService) {
    logTest('账号信息测试', false, '服务实例不可用');
    return;
  }
  
  try {
    const accountInfo = await smsService.getAccountInfo();
    
    if (accountInfo && accountInfo.success) {
      logTest('获取账号信息', true, 
        `余额: ${accountInfo.balance || '未知'}, 用户: ${accountInfo.username || '未知'}`);
      
      if (accountInfo.balance !== undefined) {
        logInfo(`当前账户余额: ${accountInfo.balance}`);
      }
    } else {
      logTest('获取账号信息', false, accountInfo ? accountInfo.message : '获取失败');
    }
  } catch (error) {
    logTest('获取账号信息', false, error.message);
  }
}

async function testGetOperatorsAndProvinces(smsService) {
  console.log('\n📋 测试获取运营商和省份列表...');
  
  if (!smsService) {
    logTest('运营商省份测试', false, '服务实例不可用');
    return;
  }
  
  try {
    const operators = smsService.getOperators();
    logTest('获取运营商列表', Array.isArray(operators) && operators.length > 0, 
      `运营商数量: ${operators.length}`);
    
    if (operators.length > 0) {
      logInfo(`可用运营商: ${operators.slice(0, 3).map(op => op.name).join(', ')}...`);
    }
    
    const provinces = smsService.getProvinces();
    logTest('获取省份列表', Array.isArray(provinces) && provinces.length > 0, 
      `省份数量: ${provinces.length}`);
    
    if (provinces.length > 0) {
      logInfo(`可用省份: ${provinces.slice(0, 5).map(prov => prov.name).join(', ')}...`);
    }
  } catch (error) {
    logTest('获取运营商省份列表', false, error.message);
  }
}

async function testGetPhone(smsService) {
  console.log('\n📱 测试获取手机号...');
  
  if (!smsService) {
    logTest('获取手机号测试', false, '服务实例不可用');
    return null;
  }
  
  try {
    logInfo(`尝试获取项目ID ${TEST_CONFIG.testSid} 的手机号...`);
    
    const phoneResult = await smsService.getPhone(TEST_CONFIG.testSid, {
      isp: 1, // 移动
      ascription: 2 // 实卡
    });
    
    if (phoneResult && phoneResult.success && phoneResult.phone) {
      logTest('获取手机号', true, `手机号: ${phoneResult.phone}`);
      logInfo(`获取到手机号: ${phoneResult.phone}`);
      return phoneResult.phone;
    } else {
      logTest('获取手机号', false, phoneResult ? phoneResult.message : '获取失败');
      return null;
    }
  } catch (error) {
    logTest('获取手机号', false, error.message);
    return null;
  }
}

async function testGetMessage(smsService, phone) {
  console.log('\n💬 测试获取验证码...');
  
  if (!smsService || !phone) {
    logTest('获取验证码测试', false, '服务实例不可用或手机号无效');
    return;
  }
  
  try {
    logInfo(`等待手机号 ${phone} 接收验证码...`);
    logInfo('注意: 这需要实际发送短信到该手机号才能收到验证码');
    
    // 使用较短的重试次数和间隔进行测试
    const messageResult = await smsService.getMessage(
      TEST_CONFIG.testSid, 
      phone, 
      TEST_CONFIG.maxRetries, 
      TEST_CONFIG.retryInterval
    );
    
    if (messageResult && messageResult.success && messageResult.message) {
      logTest('获取验证码', true, `验证码: ${messageResult.message}`);
      logInfo(`收到验证码: ${messageResult.message}`);
    } else {
      logTest('获取验证码', false, messageResult ? messageResult.message : '获取超时');
      logInfo('提示: 如果没有实际发送短信，获取验证码会超时，这是正常的');
    }
  } catch (error) {
    logTest('获取验证码', false, error.message);
    logInfo('提示: 获取验证码失败可能是因为没有实际发送短信');
  }
}

async function testReleasePhone(smsService, phone) {
  console.log('\n🔄 测试释放手机号...');
  
  if (!smsService || !phone) {
    logTest('释放手机号测试', false, '服务实例不可用或手机号无效');
    return;
  }
  
  try {
    const releaseResult = await smsService.releasePhone(TEST_CONFIG.testSid, phone);
    
    if (releaseResult && releaseResult.success) {
      logTest('释放手机号', true, `手机号 ${phone} 已释放`);
    } else {
      logTest('释放手机号', false, releaseResult ? releaseResult.message : '释放失败');
    }
  } catch (error) {
    logTest('释放手机号', false, error.message);
  }
}

async function testCompleteFlow(smsService) {
  console.log('\n🔄 测试完整接码流程...');
  
  if (!smsService) {
    logTest('完整流程测试', false, '服务实例不可用');
    return;
  }
  
  try {
    logInfo(`开始完整接码流程，项目ID: ${TEST_CONFIG.testSid}`);
    
    const result = await smsService.getCodeComplete(TEST_CONFIG.testSid, {
      isp: 1, // 移动
      ascription: 2 // 实卡
    }, TEST_CONFIG.maxRetries);
    
    if (result && result.success) {
      logTest('完整接码流程', true, 
        `手机号: ${result.phone}, 验证码: ${result.message || '未收到'}`);
      
      if (result.message) {
        logInfo(`完整流程成功: ${result.phone} -> ${result.message}`);
      } else {
        logInfo(`获取手机号成功: ${result.phone}，但未收到验证码（需要实际发送短信）`);
      }
    } else {
      logTest('完整接码流程', false, result ? result.message : '流程失败');
    }
  } catch (error) {
    logTest('完整接码流程', false, error.message);
  }
}

// 主测试函数
async function runTests() {
  console.log('🚀 开始短信接码服务测试');
  console.log('='.repeat(50));
  
  // 检查环境变量
  const envConfigured = await testEnvironmentVariables();
  
  if (!envConfigured) {
    console.log('\n⚠️  环境变量未正确配置，某些测试可能会失败');
    console.log('请在 .env 文件中配置正确的短信接码服务信息');
  }
  
  // 初始化服务
  const smsService = await testServiceInitialization();
  
  if (!smsService) {
    console.log('\n❌ 服务初始化失败，跳过后续测试');
    printTestSummary();
    return;
  }
  
  // 测试登录
  const loginSuccess = await testLogin(smsService);
  
  if (!loginSuccess) {
    console.log('\n⚠️  登录失败，某些功能测试可能会失败');
  }
  
  // 测试账号信息
  await testGetAccountInfo(smsService);
  
  // 测试运营商和省份列表
  await testGetOperatorsAndProvinces(smsService);
  
  // 测试获取手机号
  const phone = await testGetPhone(smsService);
  
  if (phone) {
    // 测试获取验证码
    await testGetMessage(smsService, phone);
    
    // 测试释放手机号
    await testReleasePhone(smsService, phone);
  } else {
    logInfo('跳过验证码和释放手机号测试（未获取到手机号）');
  }
  
  // 测试完整流程
  await testCompleteFlow(smsService);
  
  // 打印测试总结
  printTestSummary();
}

function printTestSummary() {
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试总结');
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
    console.log('\n🎉 所有测试通过！短信接码服务集成成功！');
  } else {
    console.log('\n⚠️  部分测试失败，请检查配置和网络连接');
  }
  
  console.log('\n💡 使用提示:');
  console.log('1. 确保在 .env 文件中配置了正确的短信接码服务信息');
  console.log('2. 确保账户有足够的余额');
  console.log('3. 测试项目ID请根据实际情况修改');
  console.log('4. 获取验证码需要实际发送短信才能成功');
}

// 运行测试
if (require.main === module) {
  runTests().catch(error => {
    console.error('测试运行出错:', error);
    process.exit(1);
  });
}

module.exports = {
  runTests,
  TEST_CONFIG
};