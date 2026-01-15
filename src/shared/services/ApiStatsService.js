const FileStorage = require('../storage/FileStorage');
const path = require('path');

/**
 * API调用统计服务
 * 提供模块化的API调用次数统计功能，支持多种API兼容
 */
class ApiStatsService {
  constructor() {
    this.storage = new FileStorage('src/storage/data');
    this.statsFile = 'api_stats.json';
    this.dailyStatsFile = 'daily_api_stats.json';
    this.userStatsFile = 'user_api_stats.json';
  }

  /**
   * 初始化统计服务
   */
  async initialize() {
    await this.storage.ensureDataDirectory();
    
    // 确保统计文件存在
    const defaultStats = {
      totalCalls: 0,
      endpoints: {},
      lastUpdated: new Date().toISOString()
    };
    
    const defaultDailyStats = {
      dates: {},
      lastCleanup: new Date().toISOString()
    };
    

    
    // 初始化文件（如果不存在）
    try {
      await this.storage.readJson(this.statsFile);
    } catch (error) {
      await this.storage.writeJson(this.statsFile, defaultStats);
    }
    
    try {
      await this.storage.readJson(this.dailyStatsFile);
    } catch (error) {
      await this.storage.writeJson(this.dailyStatsFile, defaultDailyStats);
    }
    

  }

  /**
   * 记录API调用
   * @param {Object} callData - 调用数据
   * @param {string} callData.endpoint - API端点
   * @param {string} callData.method - HTTP方法
   */
  async recordCall(callData) {
    const timestamp = new Date();
    const dateKey = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
    const endpointKey = `${callData.method} ${callData.endpoint}`;
    
    try {
      // 更新总体统计
      await this.storage.updateJson(this.statsFile, (stats) => {
        stats.totalCalls = (stats.totalCalls || 0) + 1;
        
        // 确保endpoints对象存在
        if (!stats.endpoints) {
          stats.endpoints = {};
        }
        
        if (!stats.endpoints[endpointKey]) {
          stats.endpoints[endpointKey] = {
            totalCalls: 0,
            lastCalled: null
          };
        }
        
        const endpoint = stats.endpoints[endpointKey];
        endpoint.totalCalls += 1;
        endpoint.lastCalled = timestamp.toISOString();
        
        stats.lastUpdated = timestamp.toISOString();
        return stats;
      });
      
      // 更新每日统计
      await this.storage.updateJson(this.dailyStatsFile, (dailyStats) => {
        // 确保dates对象存在
        if (!dailyStats.dates) {
          dailyStats.dates = {};
        }
        
        if (!dailyStats.dates[dateKey]) {
          dailyStats.dates[dateKey] = {
            totalCalls: 0,
            endpoints: {}
          };
        }
        
        const dayStats = dailyStats.dates[dateKey];
        dayStats.totalCalls += 1;
        
        if (!dayStats.endpoints[endpointKey]) {
          dayStats.endpoints[endpointKey] = 0;
        }
        dayStats.endpoints[endpointKey] += 1;
        
        return dailyStats;
      });
      
    } catch (error) {
      console.error('记录API调用统计失败:', error);
      // 不抛出错误，避免影响正常API调用
    }
  }

  /**
   * 获取总体统计信息
   * @returns {Object} 统计信息
   */
  async getOverallStats() {
    try {
      return await this.storage.readJson(this.statsFile);
    } catch (error) {
      console.error('获取总体统计失败:', error);
      return { totalCalls: 0, endpoints: {}, lastUpdated: null };
    }
  }

  /**
   * 获取每日统计信息
   * @param {number} days - 获取最近几天的数据，默认30天
   * @returns {Object} 每日统计信息
   */
  async getDailyStats(days = 30) {
    try {
      const dailyStats = await this.storage.readJson(this.dailyStatsFile);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffDateKey = cutoffDate.toISOString().split('T')[0];
      
      // 过滤最近N天的数据
      const filteredDates = {};
      Object.keys(dailyStats.dates || {}).forEach(dateKey => {
        if (dateKey >= cutoffDateKey) {
          filteredDates[dateKey] = dailyStats.dates[dateKey];
        }
      });
      
      return {
        ...dailyStats,
        dates: filteredDates
      };
    } catch (error) {
      console.error('获取每日统计失败:', error);
      return { dates: {}, lastCleanup: null };
    }
  }



  /**
   * 获取热门端点
   * @param {number} limit - 返回数量限制，默认10
   * @returns {Array} 热门端点列表
   */
  async getTopEndpoints(limit = 10) {
    try {
      const stats = await this.getOverallStats();
      const endpoints = Object.entries(stats.endpoints || {})
        .map(([endpoint, data]) => ({
          endpoint,
          ...data
        }))
        .sort((a, b) => b.totalCalls - a.totalCalls)
        .slice(0, limit);
      
      return endpoints;
    } catch (error) {
      console.error('获取热门端点失败:', error);
      return [];
    }
  }

  /**
   * 清理旧数据
   * @param {number} daysToKeep - 保留天数，默认90天
   */
  async cleanupOldData(daysToKeep = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      const cutoffDateKey = cutoffDate.toISOString().split('T')[0];
      
      await this.storage.updateJson(this.dailyStatsFile, (dailyStats) => {
        const filteredDates = {};
        Object.keys(dailyStats.dates || {}).forEach(dateKey => {
          if (dateKey >= cutoffDateKey) {
            filteredDates[dateKey] = dailyStats.dates[dateKey];
          }
        });
        
        dailyStats.dates = filteredDates;
        dailyStats.lastCleanup = new Date().toISOString();
        return dailyStats;
      });
      
      console.log(`已清理${daysToKeep}天前的统计数据`);
    } catch (error) {
      console.error('清理旧数据失败:', error);
    }
  }

  /**
   * 重置统计数据
   * @param {string} type - 重置类型: 'all', 'daily', 'user', 'overall'
   */
  async resetStats(type = 'all') {
    try {
      if (type === 'all' || type === 'overall') {
        await this.storage.writeJson(this.statsFile, {
          totalCalls: 0,
          endpoints: {},
          lastUpdated: new Date().toISOString()
        });
      }
      
      if (type === 'all' || type === 'daily') {
        await this.storage.writeJson(this.dailyStatsFile, {
          dates: {},
          lastCleanup: new Date().toISOString()
        });
      }
      

      
      console.log(`已重置${type}统计数据`);
    } catch (error) {
      console.error('重置统计数据失败:', error);
      throw error;
    }
  }
}

module.exports = ApiStatsService;