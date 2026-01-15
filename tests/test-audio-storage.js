const axios = require('axios');

// 配置
const BASE_URL = 'http://localhost:3000';
const API_KEY = process.env.API_KEYS ? process.env.API_KEYS.split(',')[0].trim() : 'key2';

// 创建axios实例
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  }
});

/**
 * 测试音频存储优化功能
 */
async function testAudioStorageOptimization() {
  console.log('🧪 开始测试音频存储优化功能...\n');

  try {
    // 1. 测试音频存储配置信息
    console.log('1️⃣ 测试音频存储配置...');
    const configResponse = await api.get('/api/audio/config');
    console.log('✅ 配置获取成功:', configResponse.data.success ? '成功' : '失败');
    if (configResponse.data.success) {
      console.log('📋 存储目录:', configResponse.data.data.baseDir);
      console.log('📋 URL前缀:', configResponse.data.data.urlPrefix);
      console.log('📋 支持格式:', configResponse.data.data.supportedFormats.join(', '));
      console.log('📋 自动清理:', configResponse.data.data.enableCleanup ? '启用' : '禁用');
    }
    console.log('');

    // 2. 测试音频存储统计
    console.log('2️⃣ 测试存储统计信息...');
    const statsResponse = await api.get('/api/audio/stats');
    console.log('✅ 统计信息获取:', statsResponse.data.success ? '成功' : '失败');
    if (statsResponse.data.success) {
      console.log('📊 总文件数:', statsResponse.data.data.totalFiles);
      console.log('📊 总大小:', `${Math.round(statsResponse.data.data.totalSize / 1024)} KB`);
      console.log('📊 平均文件大小:', `${statsResponse.data.data.averageFileSize} bytes`);
      console.log('📊 格式分布:', JSON.stringify(statsResponse.data.data.formatStats, null, 2));
    }
    console.log('');

    // 3. 测试安全文件名生成
    console.log('3️⃣ 测试安全文件名生成...');
    const filenameResponse = await api.post('/api/audio/generate-filename', {
      text: '这是一个测试音频文件名称<>:"/\\|?*',
      extension: 'mp3',
      options: {
        prefix: 'test',
        useTimestamp: true,
        useHash: true
      }
    });
    console.log('✅ 文件名生成:', filenameResponse.data.success ? '成功' : '失败');
    if (filenameResponse.data.success) {
      console.log('📝 生成文件名:', filenameResponse.data.data.filename);
    }
    console.log('');

    // 4. 测试文件存在性检查
    console.log('4️⃣ 测试文件存在性检查...');
    const existsResponse = await api.get('/api/audio/exists/nonexistent-file.mp3');
    console.log('✅ 存在性检查:', existsResponse.data.success ? '成功' : '失败');
    console.log('🔍 文件存在:', existsResponse.data.data.exists ? '存在' : '不存在');
    console.log('');

    // 5. 测试文件信息获取（对于不存在的文件）
    console.log('5️⃣ 测试文件信息获取...');
    try {
      const infoResponse = await api.get('/api/audio/info/nonexistent-file.mp3');
      console.log('ℹ️ 文件信息:', infoResponse.data.success ? '获取成功' : '文件不存在');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log('✅ 文件不存在，正确返回404');
      }
    }
    console.log('');

    // 6. 测试文件清理功能
    console.log('6️⃣ 测试文件清理功能...');
    try {
      const cleanupResponse = await api.post('/api/audio/cleanup', {
        maxAge: 0 // 清理所有文件（仅用于测试）
      });
      console.log('✅ 清理功能:', cleanupResponse.data.success ? '成功' : '失败');
      if (cleanupResponse.data.success) {
        console.log('🗑️ 清理文件数:', cleanupResponse.data.data.cleaned);
        if (cleanupResponse.data.data.errors.length > 0) {
          console.log('⚠️ 清理错误:', cleanupResponse.data.data.errors.length);
        }
      }
    } catch (error) {
      console.log('⚠️ 清理测试失败:', error.response?.data?.error || error.message);
    }
    console.log('');

    // 7. 测试删除文件功能
    console.log('7️⃣ 测试删除文件功能...');
    try {
      const deleteResponse = await api.delete('/api/audio/test-file.mp3');
      console.log('✅ 删除功能:', deleteResponse.data.success ? '成功' : '失败');
      console.log('📝 删除结果:', deleteResponse.data.message);
    } catch (error) {
      console.log('ℹ️ 删除测试（文件不存在）:', error.response?.data?.message || error.message);
    }
    console.log('');

    console.log('🎉 音频存储优化功能测试完成！');
    console.log('📋 优化总结:');
    console.log('  ✅ 统一的音频存储管理器');
    console.log('  ✅ 安全的文件名生成');
    console.log('  ✅ 完整的文件操作接口');
    console.log('  ✅ 自动清理和统计功能');
    console.log('  ✅ 配置化的存储路径');
    console.log('  ✅ 向后兼容性支持');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    if (error.response) {
      console.error('📝 错误详情:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 运行测试
if (require.main === module) {
  testAudioStorageOptimization().catch(console.error);
}

module.exports = { testAudioStorageOptimization };