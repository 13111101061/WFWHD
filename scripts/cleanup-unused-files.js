/**
 * 清理未使用文件的脚本
 * 整理和归档不需要的文件
 */

const fs = require('fs').promises;
const path = require('path');

async function organizeFiles() {
  console.log('🗂️  开始整理文件...\n');

  // 1. 创建归档目录
  const archiveDir = path.join(__dirname, '..', '_archive');
  try {
    await fs.access(archiveDir);
  } catch {
    await fs.mkdir(archiveDir, { recursive: true });
    console.log('✅ 创建归档目录: _archive');
  }

  // 2. 移动调试文件到归档目录
  const debugFiles = [
    'tests/debug/debug-service-chain.js',
    'tests/debug/debug-tts.js',
    'tests/debug/debug-unified-api.js'
  ];

  for (const file of debugFiles) {
    try {
      const sourcePath = path.join(__dirname, '..', file);
      const fileName = path.basename(file);
      const targetPath = path.join(archiveDir, fileName);

      await fs.rename(sourcePath, targetPath);
      console.log(`📦 归档调试文件: ${file}`);
    } catch (error) {
      console.log(`⚠️  跳过文件（可能不存在）: ${file}`);
    }
  }

  // 3. 移动重复的测试文件
  const duplicateTests = [
    'tests/quick-test-tts.js',
    'tests/test-all-services.js',
    'tests/test-cosyvoice-only.js'
  ];

  for (const file of duplicateTests) {
    try {
      const sourcePath = path.join(__dirname, '..', file);
      const fileName = path.basename(file);
      const targetPath = path.join(archiveDir, fileName);

      await fs.rename(sourcePath, targetPath);
      console.log(`📦 归档重复测试文件: ${file}`);
    } catch (error) {
      console.log(`⚠️  跳过文件（可能不存在）: ${file}`);
    }
  }

  // 4. 清理空目录
  const debugDir = path.join(__dirname, '..', 'tests', 'debug');
  try {
    const files = await fs.readdir(debugDir);
    if (files.length === 0) {
      await fs.rmdir(debugDir);
      console.log('🗑️  删除空目录: tests/debug');
    }
  } catch (error) {
    console.log('ℹ️  debug目录不为空，保留');
  }

  // 5. 创建一个简化说明文件
  const readmeContent = `# 📁 已归档文件

## 📂 这里包含的文件
- debug-*.js - 调试脚本（开发时用）
- test-*.js - 重复的测试文件
- 其他不需要的文件

## 🔧 什么时候需要这些文件？
- 深度调试问题时可以查看debug文件
- 特定服务测试时可以查看相应的test文件
- 一般情况下不需要理会

## ⚠️ 注意
这些文件不影响主要功能，可以安全忽略。
如需恢复，请将文件移回原位置。

---
整理时间: ${new Date().toISOString()}
`;

  await fs.writeFile(path.join(archiveDir, 'README.md'), readmeContent);
  console.log('📝 创建归档说明文件');

  console.log('\n🎉 文件整理完成！');
  console.log('📦 归档目录: _archive/');
  console.log('🔗 主要文件都保留在原位置');
  console.log('🧹 代码更简洁了');
}

// 检查是否真的要执行
if (process.argv.includes('--confirm')) {
  organizeFiles().catch(console.error);
} else {
  console.log('🔍 文件整理预览（不会实际执行）');
  console.log('💡 使用 --confirm 参数来执行整理');
  console.log('');
  console.log('将要整理的文件:');
  console.log('  📦 tests/debug/* (调试文件)');
  console.log('  📦 tests/quick-test-tts.js (重复测试)');
  console.log('  📦 tests/test-all-services.js (重复测试)');
  console.log('  📦 tests/test-cosyvoice-only.js (重复测试)');
  console.log('');
  console.log('这些文件将被移动到 _archive/ 目录');
  console.log('不会删除任何重要代码！');
}

module.exports = { organizeFiles };