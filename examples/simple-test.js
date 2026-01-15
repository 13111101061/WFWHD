/**
 * 简化的基本操作测试
 * 测试基本的文件操作是否正常
 */

const path = require('path');
const fs = require('fs').promises;

async function testBasicFileOperations() {
  console.log('🧪 测试基本文件操作...');
  
  try {
    // 1. 测试数据目录创建
    const dataDir = path.resolve('src/storage/data');
    console.log('数据目录:', dataDir);
    
    try {
      await fs.access(dataDir);
      console.log('✓ 数据目录已存在');
    } catch (error) {
      console.log('创建数据目录...');
      await fs.mkdir(dataDir, { recursive: true });
      console.log('✓ 数据目录创建成功');
    }
    
    // 2. 测试FileStorage类
    console.log('\n测试FileStorage类...');
    const FileStorage = require('./src/shared/storage/FileStorage');
    const storage = new FileStorage(dataDir);
    
    // 等待确保目录创建完成
    await storage.ensureDataDirectory();
    console.log('✓ FileStorage初始化成功');
    
    // 3. 测试基本的JSON读写
    console.log('\n测试JSON读写...');
    const testData = { test: 'hello', timestamp: new Date().toISOString() };
    
    await storage.writeJson('test.json', testData);
    console.log('✓ JSON写入成功');
    
    const readData = await storage.readJson('test.json');
    console.log('✓ JSON读取成功:', readData);
    
    console.log('\n🎉 所有基本测试通过！');

    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 运行测试
if (require.main === module) {
  testBasicFileOperations().then(() => {
    console.log('\n测试完成');
    process.exit(0);
  }).catch(error => {
    console.error('测试异常:', error);
    process.exit(1);
  });
}

module.exports = testBasicFileOperations;