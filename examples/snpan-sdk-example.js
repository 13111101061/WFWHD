/**
 * Snpan SDK 使用示例
 * 
 * 这个示例演示了如何使用Snpan SDK进行文件管理操作
 */

const SnpanService = require('../src/modules/snpan/services/snpanService');

// 初始化SDK实例
// 请在.env文件中配置SNPAN_AID和SNPAN_KEY
const snpanService = new SnpanService(
  process.env.SNPAN_AID || 'your-snpan-aid-here',
  process.env.SNPAN_KEY || 'your-snpan-key-here'
);

async function main() {
  try {
    // 等待认证初始化完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('=== Snpan SDK 使用示例 ===\n');
    
    // 1. 获取上传地址
    console.log('1. 获取上传地址:');
    const uploadUrl = await snpanService.getUploadUrl('');
    console.log('上传地址:', uploadUrl);
    console.log();
    
    // 2. 获取文件列表
    console.log('2. 获取文件列表:');
    const fileList = await snpanService.getFileList('');
    console.log('文件列表:', fileList);
    console.log();
    
    // 3. 新增文件夹
    console.log('3. 新增文件夹:');
    const newFolder = await snpanService.addPath('', '测试文件夹');
    console.log('新增文件夹结果:', newFolder);
    console.log();
    
    // 4. 获取鉴权链接
    console.log('4. 获取鉴权链接:');
    const signUrl = await snpanService.getSign('https://qz.snpan.cn/file/snpanmee0imgd5ves32i0.png');
    console.log('鉴权链接:', signUrl);
    console.log();
    
    console.log('=== 示例执行完成 ===');
  } catch (error) {
    console.error('执行示例时出错:', error);
  }
}

// 执行示例
main();