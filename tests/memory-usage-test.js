/**
 * 内存使用测试
 * 检查rateLimitStore和AuthMonitor是否存在内存泄漏
 */

require('dotenv').config();
const { UnifiedAuthMiddleware } = require('../src/core/middleware/apiKeyMiddleware');

function formatMemoryUsage() {
  const used = process.memoryUsage();
  return {
    rss: `${Math.round(used.rss / 1024 / 1024 * 100) / 100} MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024 * 100) / 100} MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024 * 100) / 100} MB`,
    external: `${Math.round(used.external / 1024 / 1024 * 100) / 100} MB`
  };
}

async function testMemoryUsage() {
  console.log('🔍 开始内存使用测试...\n');

  const auth = new UnifiedAuthMiddleware();
  const middleware = auth.createMiddleware({ required: true });

  // 模拟大量请求来测试内存增长
  console.log('📍 初始内存使用:');
  console.log(formatMemoryUsage());
  console.log('');

  // 模拟1000个不同的API密钥请求
  for (let i = 0; i < 1000; i++) {
    const mockReq = {
      ip: '127.0.0.1',
      headers: { 'x-api-key': `test_key_${i}` },
      originalUrl: '/api/test',
      method: 'POST',
      path: '/api/test'  // 添加path属性防止空指针异常
    };

    const mockRes = {
      status: () => mockRes,
      json: () => mockRes
    };

    const mockNext = () => {};

    // 模拟中间件调用（会触发rateLimitStore的使用）
    try {
      await middleware(mockReq, mockRes, mockNext);
    } catch (error) {
      // 忽略认证错误，我们只关心内存使用
    }

    // 每100次记录一次内存
    if ((i + 1) % 100 === 0) {
      console.log(`📍 处理 ${i + 1} 个请求后的内存使用:`);
      console.log(formatMemoryUsage());
      console.log(`   RateLimitStore条目数: ${auth.rateLimitStore.size}`);
      console.log('');
    }
  }

  // 等待一段时间让清理机制运行
  console.log('⏰ 等待清理机制运行...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('📍 最终内存使用:');
  console.log(formatMemoryUsage());
  console.log(`   RateLimitStore条目数: ${auth.rateLimitStore.size}`);

  // 检查监控数据大小
  const monitorStats = auth.monitor.getStats();
  console.log(`   AuthMonitor事件数: ${monitorStats.totalEvents || 0}`);

  console.log('\n🎯 内存使用分析:');

  // 分析内存增长情况
  if (auth.rateLimitStore.size > 500) {
    console.log('⚠️  RateLimitStore可能存在内存泄漏！');
  } else {
    console.log('✅ RateLimitStore内存使用正常');
  }

  console.log('\n💡 建议:');
  console.log('- 如果RateLimitStore持续增长，需要添加定期清理机制');
  console.log('- 监控生产环境的内存使用情况');
  console.log('- 考虑设置最大条目数量限制');
}

// 运行测试
testMemoryUsage().catch(console.error);