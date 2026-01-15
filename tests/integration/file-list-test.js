require('dotenv').config();
const SnpanService = require('../src/modules/snpan/services/snpanService');

async function testGetFileList() {
  console.log('=== 测试获取文件列表 ===\n');
  
  try {
    // 检查环境变量
    console.log('1. 检查环境变量配置...');
    console.log(`   SNPAN_AID: ${process.env.SNPAN_AID ? '已配置' : '未配置'}`);
    console.log(`   SNPAN_KEY: ${process.env.SNPAN_KEY ? '已配置' : '未配置'}\n`);
    
    if (!process.env.SNPAN_AID || !process.env.SNPAN_KEY) {
      console.error('× 缺少必要的环境变量配置');
      return;
    }
    
    // 初始化SDK实例
    console.log('2. 初始化SNPan SDK...');
    const snpanService = new SnpanService(
      process.env.SNPAN_AID,
      process.env.SNPAN_KEY
    );
    
    // 等待认证初始化完成
    console.log('3. 等待认证初始化...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(`   Authcode: ${snpanService.authcode ? '获取成功' : '获取失败'}\n`);
    
    if (!snpanService.authcode) {
      console.error('× SDK初始化失败，无法获取认证码');
      return;
    }
    
    // 测试获取文件列表
    console.log('4. 测试获取文件列表...');
    const fileList = await snpanService.getFileList('');
    
    if (fileList) {
      console.log('√ 获取文件列表成功');
      console.log(`  文件数量: ${fileList.count || 'N/A'}`);
      console.log(`  当前页: ${fileList.page || 'N/A'}`);
      console.log(`  总页数: ${fileList.pagecount || 'N/A'}`);
      
      if (fileList.data && Array.isArray(fileList.data)) {
        console.log(`  文件项数: ${fileList.data.length}`);
        console.log('  文件列表:');
        fileList.data.forEach((file, index) => {
          console.log(`    ${index + 1}. ${file.c_name || file.id || '未知文件'}`);
        });
      }
    } else {
      console.log('× 获取文件列表失败');
    }
    
    console.log('\n=== 测试完成 ===');
    
  } catch (error) {
    console.error('测试过程中出现错误:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 执行测试
testGetFileList();