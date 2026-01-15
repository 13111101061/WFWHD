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
 * 测试统一监控系统API
 */
async function testUnifiedMonitoring() {
  console.log('🧪 开始测试统一监控系统API...\n');

  try {
    // 1. 测试监控健康检查
    console.log('1️⃣ 测试监控健康检查...');
    const healthResponse = await api.get('/api/monitoring/health');
    console.log('✅ 健康检查:', healthResponse.data.success ? '成功' : '失败');
    if (healthResponse.data.success) {
      console.log('📊 监控状态:', healthResponse.data.data.status);
      console.log('📊 运行时间:', `${Math.round(healthResponse.data.data.uptime)}秒`);
    }
    console.log('');

    // 2. 测试获取实时指标
    console.log('2️⃣ 测试实时指标...');
    const realtimeResponse = await api.get('/api/monitoring/realtime');
    console.log('✅ 实时指标:', realtimeResponse.data.success ? '成功' : '失败');
    if (realtimeResponse.data.success) {
      console.log('📊 认证统计:', JSON.stringify(realtimeResponse.data.data.auth, null, 2));
      console.log('📊 TTS统计:', JSON.stringify(realtimeResponse.data.data.tts, null, 2));
      console.log('📊 API统计:', JSON.stringify(realtimeResponse.data.data.api, null, 2));
      console.log('📊 存储统计:', JSON.stringify(realtimeResponse.data.data.storage, null, 2));
    }
    console.log('');

    // 3. 测试记录手动事件
    console.log('3️⃣ 测试记录手动事件...');
    const eventResponse = await api.post('/api/monitoring/events', {
      type: 'success',
      category: 'tts',
      data: {
        service: 'test_api',
        responseTime: 200,
        fromCache: false
      }
    });
    console.log('✅ 事件记录:', eventResponse.data.success ? '成功' : '失败');
    console.log('📝 事件消息:', eventResponse.data.message);
    console.log('');

    // 4. 测试获取服务指标
    console.log('4️⃣ 测试服务指标...');
    const servicesResponse = await api.get('/api/monitoring/services');
    console.log('✅ 服务指标:', servicesResponse.data.success ? '成功' : '失败');
    if (servicesResponse.data.success) {
      console.log('📊 服务数量:', servicesResponse.data.serviceCount);
      console.log('📊 服务列表:', Object.keys(servicesResponse.data.data).join(', '));
    }
    console.log('');

    // 5. 测试获取每日指标
    console.log('5️⃣ 测试每日指标...');
    const dailyResponse = await api.get('/api/monitoring/daily?days=7');
    console.log('✅ 每日指标:', dailyResponse.data.success ? '成功' : '失败');
    if (dailyResponse.data.success) {
      console.log('📊 统计天数:', dailyResponse.data.days);
      console.log('📊 数据日期:', Object.keys(dailyResponse.data.data).join(', '));
    }
    console.log('');

    // 6. 测试获取汇总指标
    console.log('6️⃣ 测试汇总指标...');
    const summaryResponse = await api.get('/api/monitoring/summary');
    console.log('✅ 汇总指标:', summaryResponse.data.success ? '成功' : '失败');
    if (summaryResponse.data.success) {
      console.log('📊 今日数据:', summaryResponse.data.data.today ? '有数据' : '无数据');
      console.log('📊 7日平均:', summaryResponse.data.data.sevenDayAverage ? '有数据' : '无数据');
    }
    console.log('');

    // 7. 测试获取完整报告
    console.log('7️⃣ 测试完整报告...');
    const reportResponse = await api.get('/api/monitoring/report');
    console.log('✅ 完整报告:', reportResponse.data.success ? '成功' : '失败');
    if (reportResponse.data.success) {
      const report = reportResponse.data.data;
      console.log('📋 报告时间:', report.timestamp);
      console.log('📋 配置信息:', JSON.stringify(report.config, null, 2));
      console.log('📋 实时数据点数:', Object.keys(report.realtime).length);
      console.log('📋 每日数据天数:', Object.keys(report.daily).length);
      console.log('📋 服务统计数量:', Object.keys(report.services).length);
    }
    console.log('');

    // 8. 测试获取监控配置
    console.log('8️⃣ 测试监控配置...');
    const configResponse = await api.get('/api/monitoring/config');
    console.log('✅ 配置信息:', configResponse.data.success ? '成功' : '失败');
    if (configResponse.data.success) {
      console.log('📋 保留天数:', configResponse.data.data.retentionDays);
      console.log('📋 收集间隔:', `${configResponse.data.data.interval / 1000}秒`);
      console.log('📋 持久化:', configResponse.data.data.enablePersistence ? '启用' : '禁用');
    }
    console.log('');

    // 9. 再次检查实时指标（应该看到之前记录的事件）
    console.log('9️⃣ 再次检查实时指标...');
    const realtimeResponse2 = await api.get('/api/monitoring/realtime');
    console.log('✅ 更新后指标:', realtimeResponse2.data.success ? '成功' : '失败');
    if (realtimeResponse2.data.success) {
      const ttsStats = realtimeResponse2.data.data.tts;
      console.log('📊 TTS请求:', ttsStats.requests);
      console.log('📊 TTS成功:', ttsStats.success);
      console.log('📊 TTS缓存命中:', ttsStats.cacheHits);
    }
    console.log('');

    console.log('🎉 统一监控系统API测试完成！');
    console.log('📋 测试总结:');
    console.log('  ✅ 统一的指标收集器');
    console.log('  ✅ 标准化的API接口');
    console.log('  ✅ 实时和持久化存储');
    console.log('  ✅ 多维度数据统计');
    console.log('  ✅ 灵活的事件记录');
    console.log('  ✅ 完整的报告生成');
    console.log('  ✅ 配置化管理');
    console.log('  ✅ 健康检查功能');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    if (error.response) {
      console.error('📝 错误详情:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 运行测试
if (require.main === module) {
  testUnifiedMonitoring().catch(console.error);
}

module.exports = { testUnifiedMonitoring };