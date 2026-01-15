require('dotenv').config();
const SnpanService = require('../src/modules/snpan/services/snpanService');

async function testUploadUrl() {
  console.log('=== 上传地址获取测试 ===\n');
  
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
    
    // 测试获取根目录上传地址
    console.log('4. 测试获取根目录上传地址...');
    const rootUploadUrl = await snpanService.getUploadUrl('');
    
    if (rootUploadUrl) {
      console.log('√ 获取根目录上传地址成功');
      console.log(`  上传地址: ${rootUploadUrl.substring(0, Math.min(100, rootUploadUrl.length))}${rootUploadUrl.length > 100 ? '...' : ''}`);
    } else {
      console.log('× 获取根目录上传地址失败');
    }
    
    // 测试获取特定文件夹的上传地址（使用第一个文件夹）
    console.log('\n5. 测试获取特定文件夹上传地址...');
    const fileList = await snpanService.getFileList('');
    if (fileList && fileList.length > 0) {
      const firstFolder = fileList.find(item => item.c_type === 'folder');
      if (firstFolder) {
        console.log(`   尝试获取文件夹 "${firstFolder.c_name}" 的上传地址...`);
        const folderUploadUrl = await snpanService.getUploadUrl(firstFolder.id.toString());
        
        if (folderUploadUrl) {
          console.log('√ 获取文件夹上传地址成功');
          console.log(`  上传地址: ${folderUploadUrl.substring(0, Math.min(100, folderUploadUrl.length))}${folderUploadUrl.length > 100 ? '...' : ''}`);
        } else {
          console.log('× 获取文件夹上传地址失败');
        }
      } else {
        console.log('   未找到文件夹');
      }
    } else {
      console.log('   无法获取文件列表');
    }
    
    console.log('\n=== 测试完成 ===');
    
  } catch (error) {
    console.error('测试过程中出现错误:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 执行测试
testUploadUrl();