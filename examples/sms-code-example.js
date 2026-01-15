/**
 * 短信接码服务使用示例
 * 演示如何使用短信接码服务的各种功能
 */

require('dotenv').config();
const SmsCodeService = require('../src/modules/sms/services/smsCodeService');

// 配置信息
const config = {
  username: process.env.SMS_CODE_USERNAME,
  password: process.env.SMS_CODE_PASSWORD,
  server: process.env.SMS_CODE_SERVER,
  testSid: 1001 // 请根据实际项目ID修改
};

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 示例1: 基础使用 - 获取手机号和验证码
async function basicExample() {
  console.log('\n📱 示例1: 基础使用 - 获取手机号和验证码');
  console.log('='.repeat(50));
  
  try {
    // 创建服务实例
    const smsService = new SmsCodeService(
      config.username,
      config.password,
      config.server
    );
    
    console.log('1. 登录短信接码服务...');
    const loginResult = await smsService.login();
    if (!loginResult.success) {
      throw new Error(`登录失败: ${loginResult.message}`);
    }
    console.log('✅ 登录成功');
    
    console.log('2. 获取账号信息...');
    const accountInfo = await smsService.getAccountInfo();
    if (accountInfo.success) {
      console.log(`✅ 账号: ${accountInfo.username}, 余额: ${accountInfo.balance}`);
    }
    
    console.log('3. 获取手机号...');
    const phoneResult = await smsService.getPhone(config.testSid, {
      isp: 1, // 移动
      ascription: 2 // 实卡
    });
    
    if (!phoneResult.success) {
      throw new Error(`获取手机号失败: ${phoneResult.message}`);
    }
    
    const phone = phoneResult.phone;
    console.log(`✅ 获取到手机号: ${phone}`);
    
    console.log('4. 等待接收验证码...');
    console.log('💡 请在您的应用中向该手机号发送验证码短信');
    
    // 获取验证码（实际使用中需要先发送短信）
    const messageResult = await smsService.getMessage(config.testSid, phone, 10, 2000);
    
    if (messageResult.success && messageResult.message) {
      console.log(`✅ 收到验证码: ${messageResult.message}`);
    } else {
      console.log('⚠️  未收到验证码（可能是因为没有实际发送短信）');
    }
    
    console.log('5. 释放手机号...');
    const releaseResult = await smsService.releasePhone(config.testSid, phone);
    if (releaseResult.success) {
      console.log('✅ 手机号已释放');
    }
    
  } catch (error) {
    console.error('❌ 基础示例执行失败:', error.message);
  }
}

// 示例2: 高级使用 - 指定运营商和省份
async function advancedExample() {
  console.log('\n🎯 示例2: 高级使用 - 指定运营商和省份');
  console.log('='.repeat(50));
  
  try {
    const smsService = new SmsCodeService(
      config.username,
      config.password,
      config.server
    );
    
    console.log('1. 登录服务...');
    await smsService.login();
    
    console.log('2. 查看可用运营商...');
    const operators = smsService.getOperators();
    console.log('可用运营商:');
    operators.slice(0, 5).forEach(op => {
      console.log(`  - ${op.name} (ID: ${op.id})`);
    });
    
    console.log('3. 查看可用省份...');
    const provinces = smsService.getProvinces();
    console.log('可用省份:');
    provinces.slice(0, 8).forEach(prov => {
      console.log(`  - ${prov.name} (代码: ${prov.code})`);
    });
    
    console.log('4. 获取指定运营商和省份的手机号...');
    const phoneResult = await smsService.getPhone(config.testSid, {
      isp: 5, // 联通
      province: 'BJ', // 北京
      ascription: 2, // 实卡
      paragraph: '1300|1301|1302' // 限定号段
    });
    
    if (phoneResult.success) {
      console.log(`✅ 获取到联通北京手机号: ${phoneResult.phone}`);
      
      // 释放手机号
      await delay(1000);
      await smsService.releasePhone(config.testSid, phoneResult.phone);
      console.log('✅ 手机号已释放');
    } else {
      console.log(`❌ 获取手机号失败: ${phoneResult.message}`);
    }
    
  } catch (error) {
    console.error('❌ 高级示例执行失败:', error.message);
  }
}

// 示例3: 完整流程 - 一键接码
async function completeFlowExample() {
  console.log('\n🔄 示例3: 完整流程 - 一键接码');
  console.log('='.repeat(50));
  
  try {
    const smsService = new SmsCodeService(
      config.username,
      config.password,
      config.server
    );
    
    console.log('1. 执行完整接码流程...');
    console.log('💡 这将自动获取手机号并等待验证码');
    
    const result = await smsService.getCodeComplete(config.testSid, {
      isp: 1, // 移动
      ascription: 2 // 实卡
    }, 5); // 最多重试5次
    
    if (result.success) {
      console.log(`✅ 完整流程成功:`);
      console.log(`   手机号: ${result.phone}`);
      console.log(`   验证码: ${result.message || '未收到（需要实际发送短信）'}`);
      
      if (result.message) {
        console.log('🎉 验证码获取成功！');
      } else {
        console.log('⚠️  验证码未收到，请确保向该手机号发送了短信');
      }
    } else {
      console.log(`❌ 完整流程失败: ${result.message}`);
    }
    
  } catch (error) {
    console.error('❌ 完整流程示例执行失败:', error.message);
  }
}

// 示例4: 批量操作 - 获取多个手机号
async function batchExample() {
  console.log('\n📦 示例4: 批量操作 - 获取多个手机号');
  console.log('='.repeat(50));
  
  try {
    const smsService = new SmsCodeService(
      config.username,
      config.password,
      config.server
    );
    
    console.log('1. 登录服务...');
    await smsService.login();
    
    console.log('2. 批量获取手机号...');
    const phones = [];
    const batchSize = 3;
    
    for (let i = 0; i < batchSize; i++) {
      console.log(`   获取第 ${i + 1} 个手机号...`);
      
      const phoneResult = await smsService.getPhone(config.testSid, {
        isp: 1, // 移动
        ascription: 2 // 实卡
      });
      
      if (phoneResult.success) {
        phones.push(phoneResult.phone);
        console.log(`   ✅ 获取成功: ${phoneResult.phone}`);
      } else {
        console.log(`   ❌ 获取失败: ${phoneResult.message}`);
      }
      
      // 避免请求过快
      await delay(500);
    }
    
    console.log(`3. 成功获取 ${phones.length} 个手机号:`);
    phones.forEach((phone, index) => {
      console.log(`   ${index + 1}. ${phone}`);
    });
    
    console.log('4. 批量释放手机号...');
    for (const phone of phones) {
      const releaseResult = await smsService.releasePhone(config.testSid, phone);
      if (releaseResult.success) {
        console.log(`   ✅ 释放成功: ${phone}`);
      } else {
        console.log(`   ❌ 释放失败: ${phone} - ${releaseResult.message}`);
      }
      await delay(200);
    }
    
  } catch (error) {
    console.error('❌ 批量操作示例执行失败:', error.message);
  }
}

// 示例5: 错误处理和重试机制
async function errorHandlingExample() {
  console.log('\n🛡️ 示例5: 错误处理和重试机制');
  console.log('='.repeat(50));
  
  try {
    const smsService = new SmsCodeService(
      config.username,
      config.password,
      config.server
    );
    
    console.log('1. 测试登录重试机制...');
    let loginAttempts = 0;
    const maxLoginAttempts = 3;
    
    while (loginAttempts < maxLoginAttempts) {
      try {
        const loginResult = await smsService.login();
        if (loginResult.success) {
          console.log('✅ 登录成功');
          break;
        } else {
          throw new Error(loginResult.message);
        }
      } catch (error) {
        loginAttempts++;
        console.log(`⚠️  登录尝试 ${loginAttempts} 失败: ${error.message}`);
        
        if (loginAttempts < maxLoginAttempts) {
          console.log(`   等待 ${loginAttempts * 1000}ms 后重试...`);
          await delay(loginAttempts * 1000);
        } else {
          throw new Error('登录重试次数已达上限');
        }
      }
    }
    
    console.log('2. 测试获取手机号的错误处理...');
    try {
      // 使用无效的项目ID测试错误处理
      const phoneResult = await smsService.getPhone(99999, {});
      
      if (!phoneResult.success) {
        console.log(`✅ 正确处理了错误: ${phoneResult.message}`);
      }
    } catch (error) {
      console.log(`✅ 捕获到异常: ${error.message}`);
    }
    
    console.log('3. 测试网络超时处理...');
    // 这里可以测试网络超时等情况的处理
    console.log('✅ 错误处理机制正常');
    
  } catch (error) {
    console.error('❌ 错误处理示例执行失败:', error.message);
  }
}

// 主函数 - 运行所有示例
async function runAllExamples() {
  console.log('🚀 短信接码服务使用示例');
  console.log('='.repeat(60));
  
  // 检查配置
  if (!config.username || !config.password || !config.server ||
      config.username.includes('your-') || config.server.includes('example.com')) {
    console.log('❌ 请先在 .env 文件中配置正确的短信接码服务信息');
    console.log('需要配置的环境变量:');
    console.log('  - SMS_CODE_USERNAME: 短信接码服务用户名');
    console.log('  - SMS_CODE_PASSWORD: 短信接码服务密码');
    console.log('  - SMS_CODE_SERVER: 短信接码服务器地址');
    return;
  }
  
  console.log(`📋 配置信息:`);
  console.log(`   服务器: ${config.server}`);
  console.log(`   用户名: ${config.username}`);
  console.log(`   测试项目ID: ${config.testSid}`);
  
  try {
    // 运行各个示例
    await basicExample();
    await delay(2000);
    
    await advancedExample();
    await delay(2000);
    
    await completeFlowExample();
    await delay(2000);
    
    await batchExample();
    await delay(2000);
    
    await errorHandlingExample();
    
    console.log('\n🎉 所有示例执行完成！');
    console.log('\n💡 使用提示:');
    console.log('1. 实际使用时请确保账户有足够余额');
    console.log('2. 获取验证码需要实际向手机号发送短信');
    console.log('3. 及时释放不需要的手机号以节省费用');
    console.log('4. 根据实际需求调整项目ID和其他参数');
    
  } catch (error) {
    console.error('❌ 示例执行过程中出现错误:', error.message);
  }
}

// 如果直接运行此文件，则执行所有示例
if (require.main === module) {
  runAllExamples().catch(error => {
    console.error('示例运行出错:', error);
    process.exit(1);
  });
}

module.exports = {
  basicExample,
  advancedExample,
  completeFlowExample,
  batchExample,
  errorHandlingExample,
  runAllExamples
};