require('dotenv').config();
const SnpanService = require('../src/modules/snpan/services/snpanService');
const fs = require('fs');
const path = require('path');

async function completeUploadTest() {
  console.log('=== 完整文件上传测试 ===\n');
  
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
    
    // 获取上传地址
    console.log('4. 获取上传地址...');
    const uploadUrl = await snpanService.getUploadUrl('');
    
    if (!uploadUrl) {
      console.error('× 无法获取上传地址');
      return;
    }
    
    console.log('√ 上传地址获取成功\n');
    
    // 准备上传的文件
    const filePath = path.join(__dirname, '..', 'API_DOCUMENTATION.md');
    console.log(`5. 准备上传文件: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      console.error('× 文件不存在');
      return;
    }
    
    const fileStats = fs.statSync(filePath);
    console.log(`   文件大小: ${fileStats.size} 字节`);
    console.log(`   文件名: API_DOCUMENTATION.md\n`);
    
    // 输出上传指令
    console.log('6. 文件上传信息:');
    console.log(`   上传地址: ${uploadUrl}`);
    console.log('\n   请使用以下curl命令上传文件:');
    console.log(`   curl -X POST -F "file=@${filePath}" "${uploadUrl}"\n`);
    
    // 验证上传前的文件列表
    console.log('7. 上传前文件列表:');
    const beforeUploadList = await snpanService.getFileList('');
    
    if (beforeUploadList && Array.isArray(beforeUploadList)) {
      const existingFile = beforeUploadList.find(item => item.c_name === 'API_DOCUMENTATION.md');
      if (existingFile) {
        console.log('   文件已存在:');
        console.log(`     ID: ${existingFile.id}`);
        console.log(`     名称: ${existingFile.c_name}`);
        console.log(`     时间: ${existingFile.c_time}`);
      } else {
        console.log('   文件不存在，可以安全上传');
      }
    } else {
      console.log('   无法获取文件列表');
    }
    
    console.log('\n=== 准备完成 ===');
    console.log('请使用上面提供的curl命令上传文件');
    console.log('上传完成后，可以再次运行此脚本检查文件是否上传成功');
    
  } catch (error) {
    console.error('执行过程中出现错误:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 执行测试
completeUploadTest();