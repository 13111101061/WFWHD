require('dotenv').config();
const SnpanService = require('../src/modules/snpan/services/snpanService');

async function createFolderWithUploadAuth() {
  console.log('=== 使用上传秘钥创建文件夹测试 ===\n');
  
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
    
    if (!snpanService.uploadAuthcode) {
      console.log('× 上传认证失败，尝试使用账户认证创建文件夹...');
      
      // 使用账户认证创建文件夹
      console.log('\n4. 使用账户认证创建"网站上传"文件夹...');
      const folderName = '网站上传';
      const newFolder = await snpanService.addPath('', folderName);
      
      if (newFolder) {
        console.log('√ 文件夹创建成功（使用账户认证）');
        console.log('   文件夹详情:');
        console.log(`     名称: ${newFolder.c_name}`);
        console.log(`     ID: ${newFolder.id}`);
        console.log(`     时间: ${newFolder.c_time}`);
      } else {
        console.log('× 文件夹创建失败（使用账户认证）');
      }
    } else {
      console.log('√ 上传认证成功，使用上传认证创建文件夹...');
      
      // 使用上传认证创建文件夹
      console.log('\n4. 使用上传认证创建"网站上传"文件夹...');
      const folderName = '网站上传';
      const newFolder = await snpanService.addPathWithUploadAuth('', folderName);
      
      if (newFolder) {
        console.log('√ 文件夹创建成功（使用上传认证）');
        console.log('   文件夹详情:');
        console.log(`     名称: ${newFolder.c_name}`);
        console.log(`     ID: ${newFolder.id}`);
        console.log(`     时间: ${newFolder.c_time}`);
      } else {
        console.log('× 文件夹创建失败（使用上传认证）');
        
        // 如果失败，尝试使用账户认证创建
        console.log('\n5. 尝试使用账户认证创建文件夹...');
        const newFolder2 = await snpanService.addPath('', folderName);
        
        if (newFolder2) {
          console.log('√ 文件夹创建成功（使用账户认证）');
          console.log('   文件夹详情:');
          console.log(`     名称: ${newFolder2.c_name}`);
          console.log(`     ID: ${newFolder2.id}`);
          console.log(`     时间: ${newFolder2.c_time}`);
        } else {
          console.log('× 文件夹创建失败（使用账户认证）');
        }
      }
    }
    
    console.log('\n6. 验证文件夹创建结果...');
    const fileList = await snpanService.getFileList('');
    
    if (fileList && Array.isArray(fileList)) {
      console.log('√ 成功获取文件列表');
      const uploadFolder = fileList.find(item => item.c_name === '网站上传');
      
      if (uploadFolder) {
        console.log('√ "网站上传"文件夹已成功创建');
        console.log('   文件夹详情:');
        console.log(`     名称: ${uploadFolder.c_name}`);
        console.log(`     ID: ${uploadFolder.id}`);
        console.log(`     类型: ${uploadFolder.c_type}`);
        console.log(`     时间: ${uploadFolder.c_time}`);
        
        // 在新创建的文件夹中上传一个测试文件
        console.log('\n7. 在"网站上传"文件夹中上传测试文件...');
        const uploadUrl = await snpanService.getUploadUrl(uploadFolder.id.toString());
        
        if (uploadUrl) {
          console.log('√ 获取文件夹上传地址成功');
          console.log(`   上传地址: ${uploadUrl.substring(0, 60)}...`);
        } else {
          console.log('× 获取文件夹上传地址失败');
        }
      } else {
        console.log('× 未找到"网站上传"文件夹');
        console.log('   根目录文件列表:');
        fileList.forEach((item, index) => {
          console.log(`     ${index + 1}. ${item.c_name} (${item.c_type})`);
        });
      }
    } else {
      console.log('× 获取文件列表失败');
    }
    
    console.log('\n=== 测试完成 ===');
    
  } catch (error) {
    console.error('执行过程中出现错误:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 执行测试
createFolderWithUploadAuth();