/**
 * SNPan SDK 测试脚本
 * 用于测试SNPan SDK是否能正常连接和操作文件
 */

const SnpanService = require('../src/modules/snpan/services/snpanService');
require('dotenv').config();

async function testSnpanSDK() {
  console.log('=== SNPan SDK 测试 ===\n');
  
  // 检查环境变量
  console.log('1. 检查环境变量配置...');
  console.log(`   SNPAN_AID: ${process.env.SNPAN_AID ? '已配置' : '未配置'}`);
  console.log(`   SNPAN_KEY: ${process.env.SNPAN_KEY ? '已配置' : '未配置'}\n`);
  
  if (!process.env.SNPAN_AID || !process.env.SNPAN_KEY) {
    console.error('× 缺少必要的环境变量配置');
    return;
  }
  
  try {
    // 初始化SDK实例
    const snpanService = new SnpanService(
      process.env.SNPAN_AID,
      process.env.SNPAN_KEY
    );
    
    console.log('2. 等待SDK初始化...');
    // 等待认证初始化完成
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`   Authcode: ${snpanService.authcode ? '获取成功' : '获取失败'}\n`);
    
    if (!snpanService.authcode) {
      console.error('× SDK初始化失败，无法获取认证码');
      return;
    }
    
    // 3. 测试获取文件列表
    console.log('3. 测试获取文件列表...');
    const fileList = await snpanService.getFileList('');
    if (fileList) {
      console.log('√ 获取文件列表成功');
      console.log(`  文件数量: ${fileList.count || 'N/A'}`);
      console.log(`  当前页: ${fileList.page || 'N/A'}`);
      console.log(`  总页数: ${fileList.pagecount || 'N/A'}\n`);
    } else {
      console.log('× 获取文件列表失败\n');
    }
    
    // 4. 测试创建文件夹
    console.log('4. 测试创建文件夹...');
    const folderName = `测试文件夹_${Date.now()}`;
    const newFolder = await snpanService.addPath('', folderName);
    let folderId = null;
    
    if (newFolder && newFolder.id) {
      folderId = newFolder.id;
      console.log('√ 创建文件夹成功');
      console.log(`  文件夹ID: ${folderId}`);
      console.log(`  文件夹名称: ${folderName}\n`);
    } else {
      console.log('× 创建文件夹失败');
      if (newFolder && newFolder.msg) {
        console.log(`  错误信息: ${newFolder.msg}\n`);
      }
    }
    
    // 5. 测试获取上传地址
    console.log('5. 测试获取上传地址...');
    const uploadUrl = await snpanService.getUploadUrl('');
    if (uploadUrl) {
      console.log('√ 获取上传地址成功');
      console.log(`  上传地址长度: ${uploadUrl.length}\n`);
    } else {
      console.log('× 获取上传地址失败\n');
    }
    
    // 6. 测试获取鉴权链接
    console.log('6. 测试获取鉴权链接...');
    const signUrl = await snpanService.getSign('https://qz.snpan.cn/file/snpanmee0imgd5ves32i0.png');
    if (signUrl) {
      console.log('√ 获取鉴权链接成功');
      console.log(`  鉴权链接: ${signUrl.url ? (signUrl.url.length > 60 ? signUrl.url.substring(0, 60) + '...' : signUrl.url) : 'N/A'}\n`);
    } else {
      console.log('× 获取鉴权链接失败');
      if (signUrl && signUrl.msg) {
        console.log(`  错误信息: ${signUrl.msg}\n`);
      }
    }
    
    // 7. 清理测试数据（如果创建了文件夹）
    if (folderId) {
      console.log('7. 清理测试数据...');
      const deleteResult = await snpanService.delPath(folderId);
      if (deleteResult) {
        console.log('√ 清理测试数据成功\n');
      } else {
        console.log('× 清理测试数据失败\n');
      }
    }
    
    console.log('=== 测试完成 ===');
    
  } catch (error) {
    console.error('测试过程中出现错误:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 执行测试
testSnpanSDK();