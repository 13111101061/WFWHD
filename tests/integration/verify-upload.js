require('dotenv').config();
const SnpanService = require('../src/modules/snpan/services/snpanService');

async function verifyUpload() {
  console.log('=== 验证文件上传结果 ===\n');
  
  try {
    // 初始化SNPan服务
    console.log('1. 初始化SNPan服务...');
    const snpanService = new SnpanService(
      process.env.SNPAN_ACCOUNT_AID,
      process.env.SNPAN_ACCOUNT_KEY,
      process.env.SNPAN_UPLOAD_AID,
      process.env.SNPAN_UPLOAD_KEY
    );
    
    // 等待认证初始化完成
    console.log('2. 等待认证初始化完成...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 检查认证状态
    console.log('3. 检查认证状态:');
    console.log(`   账户认证: ${snpanService.accountAuthcode ? '成功' : '失败'}`);
    console.log(`   上传认证: ${snpanService.uploadAuthcode ? '成功' : '失败'}\n`);
    
    if (!snpanService.accountAuthcode) {
      console.error('× 账户认证失败，无法继续');
      return;
    }
    
    // 获取文件列表
    console.log('4. 获取文件列表...');
    const fileList = await snpanService.getFileList('');
    
    if (fileList && Array.isArray(fileList)) {
      console.log('√ 成功获取文件列表');
      console.log(`   文件总数: ${fileList.length}\n`);
      
      // 查找上传的文件
      const uploadedFile = fileList.find(item => item.c_name === 'API_DOCUMENTATION.md');
      
      if (uploadedFile) {
        console.log('√ 文件上传成功!');
        console.log('   文件详情:');
        console.log(`     名称: ${uploadedFile.c_name}`);
        console.log(`     ID: ${uploadedFile.id}`);
        console.log(`     类型: ${uploadedFile.c_type}`);
        console.log(`     大小: ${uploadedFile.c_size}`);
        console.log(`     上传时间: ${uploadedFile.c_time}`);
        console.log(`     文件链接: https://zz.snpan.cn/file/${uploadedFile.id}`);
      } else {
        console.log('○ 未找到上传的文件');
        console.log('   文件列表中的文件:');
        fileList.forEach((item, index) => {
          console.log(`     ${index + 1}. ${item.c_name} (${item.c_type})`);
        });
      }
    } else {
      console.log('× 获取文件列表失败');
    }
    
    console.log('\n=== 验证完成 ===');
    
  } catch (error) {
    console.error('执行过程中出现错误:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 执行验证
verifyUpload();