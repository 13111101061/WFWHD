require('dotenv').config();
const SnpanService = require('../src/modules/snpan/services/snpanService');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function uploadApiDocument() {
  console.log('=== 上传API文档到网盘 ===\n');
  
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
    
    // 上传文件
    console.log('5. 开始上传文件...');
    
    // 创建表单数据
    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    formData.append('file', fileStream);
    
    try {
      const response = await axios({
        method: 'POST',
        url: uploadUrl,
        data: formData,
        headers: {
          ...formData.getHeaders()
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });
      
      console.log('√ 文件上传成功');
      console.log('   上传响应:');
      console.log(JSON.stringify(response.data, null, 2));
      
      // 验证文件是否已上传
      console.log('\n6. 验证文件是否已上传...');
      const fileList = await snpanService.getFileList('');
      
      if (fileList && fileList.length > 0) {
        const uploadedFile = fileList.find(item => 
          item.c_name === 'API_DOCUMENTATION.md' || 
          item.c_name === 'API_DOCUMENTATION'
        );
        
        if (uploadedFile) {
          console.log('√ 文件已成功上传到网盘');
          console.log(`   文件名: ${uploadedFile.c_name}`);
          console.log(`   文件ID: ${uploadedFile.id}`);
          console.log(`   上传时间: ${uploadedFile.c_time}`);
        } else {
          console.log('⚠ 文件可能已上传，但在根目录中未找到');
        }
      } else {
        console.log('⚠ 无法验证文件是否已上传');
      }
      
    } catch (uploadError) {
      console.error('× 文件上传失败:', uploadError.message);
      
      // 输出更多错误信息
      if (uploadError.response) {
        console.error('   响应状态:', uploadError.response.status);
        console.error('   响应数据:', JSON.stringify(uploadError.response.data, null, 2));
      }
    }
    
    console.log('\n=== 上传完成 ===');
    
  } catch (error) {
    console.error('执行过程中出现错误:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 执行上传
uploadApiDocument();