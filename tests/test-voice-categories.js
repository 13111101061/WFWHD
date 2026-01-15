/**
 * 音色分类系统测试
 * 测试新的音色ID映射和分类生成功能
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const API_KEY = process.env.API_KEYS ? process.env.API_KEYS.split(',')[0].trim() : 'key1';

// 创建axios实例
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

/**
 * 测试分类API
 */
async function testCategoriesAPI() {
  console.log('📋 测试1: 获取音色分类数据\n');

  try {
    const response = await api.get('/api/tts/voices/categories');

    console.log('✅ 请求成功');
    console.log(`   状态码: ${response.status}`);
    console.log(`   ETag: ${response.headers.etag}`);
    console.log(`   Last-Modified: ${response.headers['last-modified']}`);
    console.log(`   Cache-Control: ${response.headers['cache-control']}`);

    const data = response.data.data;
    console.log(`\n📊 分类统计:`);
    console.log(`   版本: ${data.version}`);
    console.log(`   生成时间: ${data.generatedAt}`);
    console.log(`   总音色数: ${data.source.totalVoices}`);
    console.log(`   分类数量: ${data.categories.length}`);

    console.log(`\n📋 分类列表:`);
    data.categories.forEach(cat => {
      console.log(`   ${cat.icon} ${cat.title}: ${cat.count} 个音色`);
    });

    // 显示第一个分类的详细信息
    if (data.categories.length > 0) {
      const firstCat = data.categories[0];
      console.log(`\n🔍 "${firstCat.title}" 分类详情:`);
      firstCat.items.slice(0, 3).forEach(item => {
        console.log(`   - ${item.title} (${item.systemId})`);
        console.log(`     提供商: ${item.provider}/${item.service}`);
        if (item.badges && item.badges.length > 0) {
          console.log(`     徽章: ${item.badges.join(', ')}`);
        }
        if (item.popularity !== undefined) {
          console.log(`     热门度: ${item.popularity}`);
        }
      });
    }

    return response;
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('   响应数据:', error.response.data);
    }
    throw error;
  }
}

/**
 * 测试缓存机制
 */
async function testCaching() {
  console.log('\n\n📋 测试2: 缓存机制（ETag）\n');

  try {
    // 第一次请求
    const response1 = await api.get('/api/tts/voices/categories');
    const etag = response1.headers.etag;

    console.log('✅ 第一次请求成功');
    console.log(`   状态码: ${response1.status}`);
    console.log(`   ETag: ${etag}`);

    // 第二次请求（带ETag）
    const response2 = await api.get('/api/tts/voices/categories', {
      headers: {
        'If-None-Match': etag
      },
      validateStatus: (status) => status === 304 || status === 200
    });

    console.log('\n✅ 第二次请求成功（带ETag）');
    console.log(`   状态码: ${response2.status}`);

    if (response2.status === 304) {
      console.log('   ✅ 缓存命中！服务器返回304 Not Modified');
    } else {
      console.log('   ⚠️  缓存未命中，返回完整数据');
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    throw error;
  }
}

/**
 * 测试旧API兼容性
 */
async function testBackwardCompatibility() {
  console.log('\n\n📋 测试3: 旧API兼容性\n');

  try {
    // 测试旧的models接口
    const response = await api.get('/api/tts/voices/models');

    console.log('✅ 旧API仍然可用');
    console.log(`   状态码: ${response.status}`);
    console.log(`   模型数量: ${response.data.count}`);

    // 检查数据格式
    if (response.data.data && response.data.data.length > 0) {
      const firstModel = response.data.data[0];
      console.log(`\n🔍 第一个模型:`);
      console.log(`   ID: ${firstModel.id || firstModel.systemId}`);
      console.log(`   名称: ${firstModel.name}`);
      console.log(`   提供商: ${firstModel.provider}`);
      console.log(`   服务: ${firstModel.service}`);
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    throw error;
  }
}

/**
 * 测试systemId查询
 */
async function testSystemIdQuery() {
  console.log('\n\n📋 测试4: SystemId查询\n');

  try {
    const systemId = 'aliyun-cosyvoice-longxiaochun';
    const response = await api.get(`/api/tts/voices/models/${systemId}`);

    console.log('✅ SystemId查询成功');
    console.log(`   状态码: ${response.status}`);
    console.log(`   模型ID: ${response.data.data.id || response.data.data.systemId}`);
    console.log(`   模型名称: ${response.data.data.name}`);
    console.log(`   VoiceId: ${response.data.data.voiceId}`);

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    throw error;
  }
}

/**
 * 测试统计信息
 */
async function testStats() {
  console.log('\n\n📋 测试5: 统计信息\n');

  try {
    const response = await api.get('/api/tts/voices/stats');

    console.log('✅ 统计信息获取成功');
    console.log(`   总模型数: ${response.data.data.totalModels}`);
    console.log(`   提供商数: ${response.data.data.totalProviders}`);
    console.log(`   标签数: ${response.data.data.totalTags}`);
    console.log(`   已加载: ${response.data.data.isLoaded ? '是' : '否'}`);

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    throw error;
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('🧪 开始测试音色分类系统\n');
  console.log('='.repeat(60));

  try {
    await testCategoriesAPI();
    await testCaching();
    await testBackwardCompatibility();
    await testSystemIdQuery();
    await testStats();

    console.log('\n' + '='.repeat(60));
    console.log('🎉 所有测试通过！\n');

  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ 测试失败\n');
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
