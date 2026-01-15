require('dotenv').config();
const SnpanService = require('../src/modules/snpan/services/snpanService');
const fs = require('fs');
const path = require('path');

async function uploadWithUploadKey() {
  console.log('=== 使用上传秘钥上传文件 ===\n');
  
  try {
    // 初始化SDK实例
    console.log('1. 初始化SNPan SDK...');
    const snpanService = new SnpanService(
      process.env.SNPAN_ACCOUNT_AID,
      process.env.SNPAN_ACCOUNT_KEY,
      process.env.SNPAN_UPLOAD_AID,
      process.env.SNPAN_UPLOAD_KEY
    );
    
    // 等待认证初始化完成
    console.log('2. 等待认证初始化...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(`   账户认证: ${snpanService.accountAuthcode ? '成功' : '失败'}`);
    console.log(`   上传认证: ${snpanService.uploadAuthcode ? '成功' : '失败'}\n`);
    
    if (!snpanService.accountAuthcode) {
      console.error('× 账户认证失败');
      return;
    }
    
    if (!snpanService.uploadAuthcode) {
      console.error('× 上传认证失败');
      return;
    }
    
    // 获取上传地址（使用账户认证）
    console.log('3. 获取根目录上传地址...');
    const uploadUrl = await snpanService.getUploadUrl('');
    
    if (!uploadUrl) {
      console.error('× 无法获取上传地址');
      return;
    }
    
    console.log('√ 获取上传地址成功\n');
    
    // 准备要上传的文件
    const filePath = path.join(__dirname, '..', 'API_DOCUMENTATION.md');
    console.log(`4. 准备上传文件: ${filePath}`);
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      console.error('× 文件不存在');
      return;
    }
    
    const fileStats = fs.statSync(filePath);
    console.log(`   文件大小: ${fileStats.size} 字节`);
    console.log(`   文件名: API_DOCUMENTATION.md\n`);
    
    // 读取文件内容
    const fileContent = fs.readFileSync(filePath);
    console.log('5. 读取文件内容完成\n');
    
    // 由于我们无法直接测试上传功能（需要前端实现），我们输出上传所需的信息
    console.log('6. 上传信息汇总:');
    console.log(`   上传地址: ${uploadUrl}`);
    console.log(`   文件名: API_DOCUMENTATION.md`);
    console.log(`   文件大小: ${fileStats.size} 字节`);
    console.log('\n   请使用以下curl命令进行上传测试:');
    console.log(`   curl -X POST -F "file=@${filePath}" "${uploadUrl}"\n`);
    
    // 验证文件是否已存在
    console.log('7. 检查文件是否已存在...');
    const fileList = await snpanService.getFileList('');
    
    if (fileList && Array.isArray(fileList)) {
      const existingFile = fileList.find(item => item.c_name === 'API_DOCUMENTATION.md');
      
      if (existingFile) {
        console.log('√ 文件已存在于网盘中');
        console.log(`   文件ID: ${existingFile.id}`);
        console.log(`   上传时间: ${existingFile.c_time}`);
      } else {
        console.log('○ 文件尚未上传');
      }
    } else {
      console.log('⚠ 无法检查文件是否存在');
    }
    
    console.log('\n=== 准备完成 ===');
    console.log('请使用上面提供的curl命令上传文件');
    
  } catch (error) {
    console.error('执行过程中出现错误:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 执行上传准备
uploadWithUploadKey();