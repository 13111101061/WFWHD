require('dotenv').config();
const SnpanService = require('../src/modules/snpan/services/snpanService');

async function testDetailedFileList() {
  console.log('=== 详细文件列表测试 ===\n');
  
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
    
    // 测试获取文件列表（根目录）
    console.log('4. 测试获取根目录文件列表...');
    const rootFileList = await snpanService.getFileList('');
    
    if (rootFileList) {
      console.log('√ 获取根目录文件列表成功');
      console.log('  详细响应数据:');
      console.log(JSON.stringify(rootFileList, null, 2));
      
      if (rootFileList.data && Array.isArray(rootFileList.data)) {
        console.log(`  文件/文件夹数量: ${rootFileList.data.length}`);
        if (rootFileList.data.length > 0) {
          console.log('  文件/文件夹列表:');
          rootFileList.data.forEach((item, index) => {
            console.log(`    ${index + 1}. ${item.c_name || item.id || '未知项'} (${item.c_type || '未知类型'})`);
          });
        }
      }
    } else {
      console.log('× 获取根目录文件列表失败');
    }
    
    // 测试创建文件夹
    console.log('\n5. 测试创建文件夹...');
    const folderName = `测试文件夹_${Date.now()}`;
    const newFolder = await snpanService.addPath('', folderName);
    
    let folderId = null;
    if (newFolder) {
      console.log('√ 创建文件夹成功');
      console.log('  详细响应数据:');
      console.log(JSON.stringify(newFolder, null, 2));
      
      if (newFolder.id) {
        folderId = newFolder.id;
        console.log(`  新文件夹ID: ${folderId}`);
        console.log(`  新文件夹名称: ${folderName}`);
      }
    } else {
      console.log('× 创建文件夹失败');
    }
    
    // 如果创建了文件夹，测试获取上传地址
    if (folderId) {
      console.log('\n6. 测试获取上传地址...');
      const uploadUrl = await snpanService.getUploadUrl(folderId);
      
      if (uploadUrl) {
        console.log('√ 获取上传地址成功');
        console.log(`  上传地址: ${uploadUrl.substring(0, Math.min(100, uploadUrl.length))}${uploadUrl.length > 100 ? '...' : ''}`);
      } else {
        console.log('× 获取上传地址失败');
      }
      
      // 清理测试数据
      console.log('\n7. 清理测试数据...');
      const deleteResult = await snpanService.delPath(folderId);
      
      if (deleteResult) {
        console.log('√ 清理测试数据成功');
      } else {
        console.log('× 清理测试数据失败');
      }
    }
    
    console.log('\n=== 测试完成 ===');
    
  } catch (error) {
    console.error('测试过程中出现错误:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 执行测试
testDetailedFileList();