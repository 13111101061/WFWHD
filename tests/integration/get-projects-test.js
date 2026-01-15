/**
 * 获取项目列表测试脚本
 * 用于探索短信接码服务的项目列表API
 * 
 * ⚠️  【待开发模块 - 暂时搁置】
 * 状态: 开发中断，功能未完成
 * 原因: 短信接码服务商未提供获取项目列表的API接口
 * 解决方案: 目前使用自定义项目ID (672xxxxx格式) 替代
 * 
 * 📝 开发说明:
 * - 此模块尝试通过多种API参数获取项目列表
 * - 测试结果显示服务商可能不提供此功能
 * - 建议后续开发者联系服务商确认API文档
 * - 或考虑使用项目ID枚举的方式实现
 * 
 * 🔄 恢复开发时需要:
 * 1. 确认服务商是否提供项目列表API
 * 2. 更新API文档和接口参数
 * 3. 完善错误处理和重试机制
 * 4. 集成到主要的短信接码服务中
 * 
 * 最后更新: 2024年
 * 开发者: AI Assistant
 */

require('dotenv').config();
const axios = require('axios');

const config = {
  username: process.env.SMS_CODE_USERNAME,
  password: process.env.SMS_CODE_PASSWORD,
  server: process.env.SMS_CODE_SERVER
};

async function login() {
  try {
    console.log('正在登录...');
    const response = await axios.get(config.server, {
      params: {
        api: 'login',
        user: config.username,
        pass: config.password
      }
    });
    
    if (response.data.code === 0) {
      console.log('✅ 登录成功');
      return response.data.token;
    } else {
      throw new Error(`登录失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('❌ 登录失败:', error.message);
    return null;
  }
}

async function testGetProjects(token) {
  console.log('\n=== 尝试获取项目列表 ===');
  
  // 尝试不同的API参数
  const apiCalls = [
    'getShopList',
    'getProjectList', 
    'getShops',
    'getProjects',
    'shopList',
    'projectList',
    'getList',
    'list'
  ];
  
  for (const api of apiCalls) {
    try {
      console.log(`\n尝试API: ${api}`);
      const response = await axios.get(config.server, {
        params: {
          api: api,
          token: token
        },
        timeout: 5000
      });
      
      console.log(`响应状态: ${response.status}`);
      console.log(`响应数据:`, JSON.stringify(response.data, null, 2));
      
      if (response.data.code === 0 || response.data.code === 200) {
        console.log(`✅ ${api} 成功！`);
      }
    } catch (error) {
      console.log(`❌ ${api} 失败: ${error.response?.data?.msg || error.message}`);
    }
  }
}

async function searchPinduoduo(token) {
  console.log('\n=== 搜索拼多多项目 ===');
  
  // 尝试搜索拼多多相关的项目ID
  const searchTerms = ['拼多多', 'pinduoduo', 'pdd'];
  
  for (const term of searchTerms) {
    try {
      console.log(`\n搜索关键词: ${term}`);
      const response = await axios.get(config.server, {
        params: {
          api: 'search',
          token: token,
          keyword: term
        },
        timeout: 5000
      });
      
      console.log(`搜索结果:`, JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log(`搜索 ${term} 失败: ${error.response?.data?.msg || error.message}`);
    }
  }
}

async function tryMoreProjectIds(token) {
  console.log('\n=== 尝试更多项目ID范围 ===');
  
  // 扩大搜索范围
  const ranges = [
    { start: 1, end: 50, step: 1 },      // 1-50
    { start: 100, end: 200, step: 10 },  // 100, 110, 120...200
    { start: 500, end: 600, step: 10 },  // 500, 510, 520...600
    { start: 1000, end: 1100, step: 5 }, // 1000, 1005, 1010...1100
    { start: 2000, end: 2100, step: 10 },// 2000, 2010, 2020...2100
    { start: 5000, end: 5100, step: 10 },// 5000, 5010, 5020...5100
    { start: 10000, end: 10100, step: 10 }// 10000, 10010...10100
  ];
  
  let foundProjects = [];
  
  for (const range of ranges) {
    console.log(`\n搜索范围: ${range.start} - ${range.end} (步长: ${range.step})`);
    
    for (let sid = range.start; sid <= range.end; sid += range.step) {
      try {
        const response = await axios.get(config.server, {
          params: {
            api: 'getPhone',
            token: token,
            sid: sid
          },
          timeout: 3000
        });
        
        if (response.data.code === 0 || response.data.code === 200) {
          const projectInfo = {
            id: sid,
            name: response.data.shop_name,
            country: response.data.country_name
          };
          foundProjects.push(projectInfo);
          console.log(`✅ 找到项目! ID: ${sid}, 名称: ${response.data.shop_name}`);
        }
      } catch (error) {
        const errorMsg = error.response?.data?.msg || error.message;
        if (!errorMsg.includes('没有找到项目ID')) {
          // 只显示非"项目不存在"的错误
          console.log(`⚠️  项目ID ${sid}: ${errorMsg}`);
        }
      }
      
      // 添加小延迟避免请求过快
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  if (foundProjects.length > 0) {
    console.log('\n🎉 找到的可用项目:');
    foundProjects.forEach(project => {
      console.log(`  - ID: ${project.id}, 名称: ${project.name}, 国家: ${project.country}`);
    });
  } else {
    console.log('\n😞 未找到任何可用项目');
  }
  
  return foundProjects;
}

async function main() {
  console.log('=== 获取项目列表测试 ===');
  console.log('⚠️  注意: 此模块为待开发状态，功能未完成');
  console.log('📋 当前状态: 暂时搁置，使用自定义项目ID替代');
  console.log('');
  
  try {
    const token = await login();
    if (!token) {
      console.log('登录失败，无法继续测试');
      return;
    }

    await testGetProjects(token);
    await searchPinduoduo(token);
    
    const foundProjects = await tryMoreProjectIds(token);
    
    console.log('\n=== 测试完成 ===');
    if (foundProjects && foundProjects.length > 0) {
      console.log('🎉 找到的项目ID:');
      foundProjects.forEach(project => {
        console.log(`  - ID: ${project.id}, 名称: ${project.name || '未知'}`);
      });
      
      // 检查是否有拼多多相关项目
      const pinduoduoProjects = foundProjects.filter(p => 
        p.name && (p.name.includes('拼多多') || p.name.includes('PDD') || p.name.toLowerCase().includes('pinduoduo'))
      );
      
      if (pinduoduoProjects.length > 0) {
        console.log('\n🛍️  拼多多相关项目:');
        pinduoduoProjects.forEach(project => {
          console.log(`  - ID: ${project.id}, 名称: ${project.name}`);
        });
      }
    } else {
      console.log('❌ 未找到任何可用的项目ID');
      console.log('💡 建议: 使用自定义项目ID (test-pinduoduo-project.js) 进行测试');
    }
    
  } catch (error) {
    console.error('测试过程中发生错误:', error.message);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };