/**
 * 拼多多项目测试脚本
 * 使用自定义项目ID进行测试
 */

require('dotenv').config();
const SmsCodeService = require('../src/modules/sms/services/smsCodeService');

// 测试配置 - 使用672开头的项目ID
const TEST_CONFIG = {
  username: process.env.SMS_CODE_USERNAME,
  password: process.env.SMS_CODE_PASSWORD,
  server: process.env.SMS_CODE_SERVER,
  // 拼多多项目ID - 672开头，一万以后的数字
  pinduoduoProjectIds: [
    67210001, // 拼多多主项目
    67210002, // 拼多多备用项目1
    67210003, // 拼多多备用项目2
    67210004, // 拼多多备用项目3
    67210005, // 拼多多备用项目4
    67210010, // 拼多多特殊项目1
    67210020, // 拼多多特殊项目2
    67210100, // 拼多多高级项目
    67211000, // 拼多多企业项目
    67212000  // 拼多多VIP项目
  ],
  maxRetries: 3,
  retryInterval: 2000
};

// 测试结果统计
let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

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

async function testPinduoduoProjects() {
  console.log('=== 拼多多项目测试 ===');
  console.log(`服务器: ${TEST_CONFIG.server}`);
  console.log(`用户名: ${TEST_CONFIG.username}`);
  console.log(`测试项目ID数量: ${TEST_CONFIG.pinduoduoProjectIds.length}`);
  
  const smsService = new SmsCodeService();
  
  try {
    // 登录测试
    console.log('\n🔐 登录短信接码服务...');
    const token = await smsService.login();
    logTest('登录', !!token, token ? `Token: ${token.substring(0, 20)}...` : '登录失败');
    
    if (!token) {
      console.log('登录失败，无法继续测试');
      return;
    }
    
    // 测试每个拼多多项目ID
    console.log('\n📱 测试拼多多项目ID...');
    let successfulProjects = [];
    
    for (const projectId of TEST_CONFIG.pinduoduoProjectIds) {
      try {
        logInfo(`测试项目ID: ${projectId}`);
        
        // 尝试获取手机号
        const phoneResult = await smsService.getPhone(projectId, {
          isp: 1, // 中国移动
          ascription: 2 // 实卡
        });
        
        if (phoneResult && phoneResult.success && phoneResult.phone) {
          successfulProjects.push({
            id: projectId,
            phone: phoneResult.phone,
            operator: phoneResult.operator,
            province: phoneResult.province
          });
          
          logTest(`项目ID ${projectId}`, true, `获取手机号成功: ${phoneResult.phone}`);
          
          // 立即释放手机号，避免占用
          try {
            await smsService.releasePhone(projectId, phoneResult.phone);
            logInfo(`已释放手机号: ${phoneResult.phone}`);
          } catch (releaseError) {
            logInfo(`释放手机号失败: ${releaseError.message}`);
          }
          
        } else {
          logTest(`项目ID ${projectId}`, false, phoneResult ? phoneResult.message : '获取手机号失败');
        }
        
      } catch (error) {
        logTest(`项目ID ${projectId}`, false, error.message);
      }
      
      // 添加延迟避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 显示成功的项目
    if (successfulProjects.length > 0) {
      console.log('\n🎉 可用的拼多多项目ID:');
      successfulProjects.forEach(project => {
        console.log(`  - ID: ${project.id}`);
        console.log(`    手机号: ${project.phone}`);
        console.log(`    运营商: ${project.operator}`);
        console.log(`    省份: ${project.province}`);
        console.log('');
      });
      
      // 选择第一个成功的项目进行完整流程测试
      const testProject = successfulProjects[0];
      console.log(`\n🔄 使用项目ID ${testProject.id} 进行完整接码流程测试...`);
      
      try {
        const completeResult = await smsService.getCodeComplete(testProject.id, {
          isp: 1,
          ascription: 2,
          maxRetries: TEST_CONFIG.maxRetries
        });
        
        if (completeResult && completeResult.success) {
          logTest('完整接码流程', true, `手机号: ${completeResult.phone}, 验证码: ${completeResult.code || '等待中'}`);
        } else {
          logTest('完整接码流程', false, completeResult ? completeResult.message : '流程失败');
        }
      } catch (error) {
        logTest('完整接码流程', false, error.message);
      }
    } else {
      console.log('\n😞 没有找到可用的拼多多项目ID');
      console.log('💡 建议: 可以尝试其他项目ID或联系服务提供商');
    }
    
  } catch (error) {
    console.error('测试过程中发生错误:', error.message);
  }
}

function printTestSummary() {
  console.log('\n==================================================');
  console.log('📊 拼多多项目测试总结');
  console.log('==================================================');
  console.log(`总测试数: ${testResults.total}`);
  console.log(`通过: ${testResults.passed}`);
  console.log(`失败: ${testResults.failed}`);
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ 失败的测试:');
    testResults.errors.forEach(error => {
      console.log(`  - ${error}`);
    });
  }
  
  if (testResults.failed > 0) {
    console.log('\n⚠️  部分测试失败，请检查配置和网络连接');
  } else {
    console.log('\n🎉 所有测试通过！');
  }
  
  console.log('\n💡 使用提示:');
  console.log('1. 记录可用的项目ID用于实际应用');
  console.log('2. 确保账户有足够的余额');
  console.log('3. 获取验证码需要实际发送短信才能成功');
  console.log('4. 项目ID 672xxxxx 是自定义的，避免与其他用户冲突');
}

async function main() {
  try {
    await testPinduoduoProjects();
  } catch (error) {
    console.error('主程序执行失败:', error.message);
  } finally {
    printTestSummary();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, TEST_CONFIG };