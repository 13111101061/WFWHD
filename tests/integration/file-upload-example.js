require('dotenv').config();
const SnpanService = require('../src/modules/snpan/services/snpanService');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function fileUploadExample() {
  console.log('=== 文件上传示例 ===\n');
  
  try {
    // 初始化SDK实例
    console.log('1. 初始化SNPan SDK...');
    const snpanService = new SnpanService(
      process.env.SNPAN_AID,
      process.env.SNPAN_KEY
    );
    
    // 等待认证初始化完成
    console.log('2. 等待认证初始化...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    if (!snpanService.authcode) {
      console.error('× SDK初始化失败，无法获取认证码');
      return;
    }
    
    console.log('√ 认证成功\n');
    
    // 获取上传地址
    console.log('3. 获取上传地址...');
    const uploadUrl = await snpanService.getUploadUrl('');
    
    if (!uploadUrl) {
      console.error('× 无法获取上传地址');
      return;
    }
    
    console.log('√ 获取上传地址成功');
    console.log(`   上传地址: ${uploadUrl.substring(0, 60)}...\n`);
    
    // 创建一个测试文件用于上传
    console.log('4. 创建测试文件...');
    const testFileName = `test-file-${Date.now()}.txt`;
    const testFileContent = `这是一个测试文件，创建于 ${new Date().toISOString()}\n文件名: ${testFileName}`;
    
    // 将测试内容写入临时文件
    const testFilePath = path.join(__dirname, testFileName);
    fs.writeFileSync(testFilePath, testFileContent);
    console.log(`√ 创建测试文件: ${testFileName}\n`);
    
    // 上传文件
    console.log('5. 上传文件...');
    const fileStream = fs.createReadStream(testFilePath);
    
    try {
      // 使用axios上传文件
      const response = await axios({
        method: 'POST',
        url: uploadUrl,
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        data: {
          file: fileStream
        }
      });
      
      console.log('√ 文件上传成功');
      console.log('   上传响应:');
      console.log(JSON.stringify(response.data, null, 2));
      
      // 清理临时文件
      fs.unlinkSync(testFilePath);
      console.log('\n√ 清理临时文件');
      
    } catch (uploadError) {
      console.error('× 文件上传失败:', uploadError.message);
      
      // 尝试输出更多错误信息
      if (uploadError.response) {
        console.error('   响应状态:', uploadError.response.status);
        console.error('   响应数据:', JSON.stringify(uploadError.response.data, null, 2));
      }
      
      // 清理临时文件
      fs.unlinkSync(testFilePath);
    }
    
    console.log('\n=== 示例完成 ===');
    
  } catch (error) {
    console.error('执行过程中出现错误:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 执行示例
fileUploadExample();