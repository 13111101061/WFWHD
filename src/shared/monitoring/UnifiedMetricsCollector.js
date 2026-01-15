const fs = require('fs').promises;
const path = require('path');
const config = require('../config/config');

/**
 * 统一指标收集器
 * 标准化所有统计数据收集和存储
 */
class UnifiedMetricsCollector {
  constructor(options = {}) {
    this.options = {
      // 数据存储目录
      dataDir: options.dataDir || path.join(process.cwd(), 'src', 'storage', 'data'),
      // 数据保留天数
      retentionDays: options.retentionDays || 30,
      // 统计间隔（毫秒）
      interval: options.interval || 60000, // 1分钟
      // 是否启用持久化
      enablePersistence: options.enablePersistence !== false,
      ...options
    };

    // 数据文件路径
    this.files = {
      realtime: 'realtime_metrics.json',
      daily: 'daily_metrics.json',
      services: 'services_metrics.json',
      summary: 'summary_metrics.json'
    };

    // 内存存储
    this.data = {
      realtime: {
        timestamp: Date.now(),
        auth: { success: 0, failure: 0, denied: 0, total: 0 },
        tts: { requests: 0, success: 0, failure: 0, cacheHits: 0 },
        api: { requests: 0, errors: 0, avgResponseTime: 0 },
        storage: { files: 0, size: 0, cleanup: 0 }
      },
      daily: new Map(), // 按日期存储的数据
      services: new Map(), // 服务级别统计
      summary: {} // 汇总数据
    };

    // 初始化
    this.initialize();
  }

  /**
   * 初始化收集器
   */
  async initialize() {
    try {
      // 确保数据目录存在
      await fs.mkdir(this.options.dataDir, { recursive: true });

      // 加载历史数据
      if (this.options.enablePersistence) {
        await this.loadData();
      }

      // 启动定时收集
      this.startCollection();

      console.log('📊 统一指标收集器初始化成功');
    } catch (error) {
      console.error('❌ 指标收集器初始化失败:', error.message);
      throw error;
    }
  }

  /**
   * 加载历史数据
   */
  async loadData() {
    try {
      // 加载每日数据
      const dailyData = await this.loadJsonFile(this.files.daily);
      if (dailyData && dailyData.dates) {
        Object.entries(dailyData.dates).forEach(([date, data]) => {
          this.data.daily.set(date, data);
        });
      }

      // 加载服务数据
      const servicesData = await this.loadJsonFile(this.files.services);
      if (servicesData && servicesData.services) {
        Object.entries(servicesData.services).forEach(([service, data]) => {
          this.data.services.set(service, data);
        });
      }

      // 加载汇总数据
      const summaryData = await this.loadJsonFile(this.files.summary);
      if (summaryData) {
        this.data.summary = summaryData;
      }

      console.log('📈 历史数据加载完成');
    } catch (error) {
      console.warn('⚠️ 历史数据加载失败，使用空数据:', error.message);
    }
  }

  /**
   * 加载JSON文件
   */
  async loadJsonFile(filename) {
    const filePath = path.join(this.options.dataDir, filename);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  /**
   * 保存JSON文件
   */
  async saveJsonFile(filename, data) {
    const filePath = path.join(this.options.dataDir, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * 启动定时收集
   */
  startCollection() {
    // 每分钟收集一次实时数据
    setInterval(() => {
      this.collectRealtimeMetrics();
    }, this.options.interval);

    // 每小时持久化数据
    setInterval(() => {
      this.persistData();
    }, 60 * 60 * 1000);

    // 每天清理过期数据
    setInterval(() => {
      this.cleanupOldData();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * 记录认证事件
   */
  recordAuthEvent(type, data = {}) {
    this.data.realtime.auth.total++;
    this.data.realtime.auth[type]++;

    // 记录到当日数据
    const today = new Date().toISOString().split('T')[0];
    this.ensureDailyData(today);
    this.data.daily.get(today).auth.total++;
    this.data.daily.get(today).auth[type]++;
  }

  /**
   * 记录TTS事件
   */
  recordTtsEvent(type, data = {}) {
    this.data.realtime.tts.requests++;

    if (type === 'success') {
      this.data.realtime.tts.success++;
      if (data.fromCache) {
        this.data.realtime.tts.cacheHits++;
      }
    } else if (type === 'failure') {
      this.data.realtime.tts.failure++;
    }

    // 记录服务级别数据
    if (data.service) {
      this.ensureServiceData(data.service);
      const serviceData = this.data.services.get(data.service);
      serviceData.total++;
      if (type === 'success') {
        serviceData.success++;
      } else if (type === 'failure') {
        serviceData.failure++;
      }
      if (data.responseTime) {
        serviceData.totalTime = (serviceData.totalTime || 0) + data.responseTime;
      }
    }

    // 记录到当日数据
    const today = new Date().toISOString().split('T')[0];
    this.ensureDailyData(today);
    this.data.daily.get(today).tts.requests++;
    this.data.daily.get(today).tts[type]++;
  }

  /**
   * 记录API请求
   */
  recordApiRequest(data = {}) {
    this.data.realtime.api.requests++;

    if (data.error) {
      this.data.realtime.api.errors++;
    }

    if (data.responseTime) {
      // 计算平均响应时间
      const total = this.data.realtime.api.avgResponseTime * (this.data.realtime.api.requests - 1) + data.responseTime;
      this.data.realtime.api.avgResponseTime = Math.round(total / this.data.realtime.api.requests);
    }

    // 记录到当日数据
    const today = new Date().toISOString().split('T')[0];
    this.ensureDailyData(today);
    this.data.daily.get(today).api.requests++;
    if (data.error) {
      this.data.daily.get(today).api.errors++;
    }
  }

  /**
   * 记录存储事件
   */
  recordStorageEvent(type, data = {}) {
    if (type === 'file_saved') {
      this.data.realtime.storage.files++;
    } else if (type === 'file_deleted') {
      this.data.realtime.storage.files = Math.max(0, this.data.realtime.storage.files - 1);
    } else if (type === 'cleanup') {
      this.data.realtime.storage.cleanup++;
    }

    if (data.size) {
      this.data.realtime.storage.size += data.size;
    }
  }

  /**
   * 确保当日数据存在
   */
  ensureDailyData(date) {
    if (!this.data.daily.has(date)) {
      this.data.daily.set(date, {
        date,
        auth: { success: 0, failure: 0, denied: 0, total: 0 },
        tts: { requests: 0, success: 0, failure: 0, cacheHits: 0 },
        api: { requests: 0, errors: 0, avgResponseTime: 0 },
        storage: { files: 0, size: 0, cleanup: 0 }
      });
    }
  }

  /**
   * 确保服务数据存在
   */
  ensureServiceData(service) {
    if (!this.data.services.has(service)) {
      this.data.services.set(service, {
        service,
        total: 0,
        success: 0,
        failure: 0,
        totalTime: 0,
        lastUsed: new Date().toISOString()
      });
    }
    this.data.services.get(service).lastUsed = new Date().toISOString();
  }

  /**
   * 收集实时指标
   */
  collectRealtimeMetrics() {
    this.data.realtime.timestamp = Date.now();

    // 更新汇总数据
    this.updateSummary();

    // 发出指标更新事件
    if (this.onMetricsUpdate) {
      this.onMetricsUpdate(this.getRealtimeMetrics());
    }
  }

  /**
   * 更新汇总数据
   */
  updateSummary() {
    const now = new Date().toISOString();

    // 计算今日数据
    const today = new Date().toISOString().split('T')[0];
    const todayData = this.data.daily.get(today) || {};

    // 计算7天平均
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAvg = this.calculateAverage(sevenDaysAgo);

    this.data.summary = {
      timestamp: now,
      today: todayData,
      sevenDayAverage: sevenDaysAvg,
      realtime: this.data.realtime,
      serviceCount: this.data.services.size,
      storageFiles: this.data.realtime.storage.files,
      storageSize: this.data.realtime.storage.size
    };
  }

  /**
   * 计算平均值
   */
  calculateAverage(sinceDate) {
    const since = sinceDate.toISOString().split('T')[0];
    let count = 0;
    let sum = {
      auth: { total: 0, success: 0, failure: 0 },
      tts: { requests: 0, success: 0, failure: 0 },
      api: { requests: 0, errors: 0 }
    };

    for (const [date, data] of this.data.daily) {
      if (date >= since) {
        count++;
        sum.auth.total += data.auth.total;
        sum.auth.success += data.auth.success;
        sum.auth.failure += data.auth.failure;
        sum.tts.requests += data.tts.requests;
        sum.tts.success += data.tts.success;
        sum.tts.failure += data.tts.failure;
        sum.api.requests += data.api.requests;
        sum.api.errors += data.api.errors;
      }
    }

    if (count === 0) return null;

    return {
      days: count,
      auth: {
        total: Math.round(sum.auth.total / count),
        success: Math.round(sum.auth.success / count),
        failure: Math.round(sum.auth.failure / count),
        successRate: sum.auth.total > 0 ? `${(sum.auth.success / sum.auth.total * 100).toFixed(1)}%` : '0%'
      },
      tts: {
        requests: Math.round(sum.tts.requests / count),
        success: Math.round(sum.tts.success / count),
        failure: Math.round(sum.tts.failure / count),
        successRate: sum.tts.requests > 0 ? `${(sum.tts.success / sum.tts.requests * 100).toFixed(1)}%` : '0%'
      },
      api: {
        requests: Math.round(sum.api.requests / count),
        errors: Math.round(sum.api.errors / count),
        errorRate: sum.api.requests > 0 ? `${(sum.api.errors / sum.api.requests * 100).toFixed(1)}%` : '0%'
      }
    };
  }

  /**
   * 持久化数据
   */
  async persistData() {
    if (!this.options.enablePersistence) return;

    try {
      // 保存每日数据
      const dailyData = {
        lastUpdate: new Date().toISOString(),
        dates: Object.fromEntries(this.data.daily)
      };
      await this.saveJsonFile(this.files.daily, dailyData);

      // 保存服务数据
      const servicesData = {
        lastUpdate: new Date().toISOString(),
        services: Object.fromEntries(this.data.services)
      };
      await this.saveJsonFile(this.files.services, servicesData);

      // 保存汇总数据
      await this.saveJsonFile(this.files.summary, this.data.summary);

      console.log('💾 指标数据已持久化');
    } catch (error) {
      console.error('❌ 数据持久化失败:', error.message);
    }
  }

  /**
   * 清理过期数据
   */
  async cleanupOldData() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.options.retentionDays);
    const cutoff = cutoffDate.toISOString().split('T')[0];

    let deleted = 0;
    for (const [date] of this.data.daily) {
      if (date < cutoff) {
        this.data.daily.delete(date);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`🧹 清理了 ${deleted} 天的过期数据`);
      await this.persistData();
    }
  }

  /**
   * 获取实时指标
   */
  getRealtimeMetrics() {
    return { ...this.data.realtime };
  }

  /**
   * 获取每日指标
   */
  getDailyMetrics(days = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString().split('T')[0];

    const result = {};
    for (const [date, data] of this.data.daily) {
      if (date >= cutoff) {
        result[date] = data;
      }
    }

    return result;
  }

  /**
   * 获取服务指标
   */
  getServiceMetrics() {
    return Object.fromEntries(this.data.services);
  }

  /**
   * 获取汇总指标
   */
  getSummaryMetrics() {
    return this.data.summary;
  }

  /**
   * 获取完整指标报告
   */
  getFullReport() {
    return {
      timestamp: new Date().toISOString(),
      realtime: this.getRealtimeMetrics(),
      daily: this.getDailyMetrics(7),
      services: this.getServiceMetrics(),
      summary: this.getSummaryMetrics(),
      config: {
        retentionDays: this.options.retentionDays,
        interval: this.options.interval,
        enablePersistence: this.options.enablePersistence
      }
    };
  }

  /**
   * 重置所有指标
   */
  reset() {
    this.data.realtime = {
      timestamp: Date.now(),
      auth: { success: 0, failure: 0, denied: 0, total: 0 },
      tts: { requests: 0, success: 0, failure: 0, cacheHits: 0 },
      api: { requests: 0, errors: 0, avgResponseTime: 0 },
      storage: { files: 0, size: 0, cleanup: 0 }
    };
    this.data.services.clear();
    console.log('📊 所有指标已重置');
  }
}

// 创建全局实例
const unifiedMetrics = new UnifiedMetricsCollector();

module.exports = {
  UnifiedMetricsCollector,
  unifiedMetrics
};