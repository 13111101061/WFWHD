const ApiStatsService = require('../services/ApiStatsService');

// 创建全局统计服务实例
let statsService = null;

/**
 * 初始化API统计服务
 */
const initializeStatsService = async () => {
  if (!statsService) {
    statsService = new ApiStatsService();
    await statsService.initialize();
  }
  return statsService;
};

/**
 * API调用统计中间件
 * 记录API调用的基本统计信息
 * 
 * @param {Object} options - 配置选项
 * @param {boolean} options.enabled - 是否启用统计，默认true
 * @param {Array<string>} options.excludePaths - 排除的路径列表
 * @param {Array<string>} options.includeOnly - 仅包含的路径列表
 */
const apiStatsMiddleware = (options = {}) => {
  const {
    enabled = true,
    excludePaths = [],
    includeOnly = []
  } = options;

  return async (req, res, next) => {
    // 如果统计功能被禁用，直接跳过
    if (!enabled) {
      return next();
    }

    const startTime = Date.now();
    const originalPath = req.path;
    const method = req.method;
    
    // 检查路径是否应该被排除
    if (excludePaths.length > 0) {
      const shouldExclude = excludePaths.some(path => {
        if (typeof path === 'string') {
          return originalPath.startsWith(path);
        }
        if (path instanceof RegExp) {
          return path.test(originalPath);
        }
        return false;
      });
      
      if (shouldExclude) {
        return next();
      }
    }
    
    // 检查路径是否在包含列表中（如果指定了包含列表）
    if (includeOnly.length > 0) {
      const shouldInclude = includeOnly.some(path => {
        if (typeof path === 'string') {
          return originalPath.startsWith(path);
        }
        if (path instanceof RegExp) {
          return path.test(originalPath);
        }
        return false;
      });
      
      if (!shouldInclude) {
        return next();
      }
    }

    // 初始化统计服务
    try {
      await initializeStatsService();
    } catch (error) {
      console.error('初始化API统计服务失败:', error);
      return next();
    }

    // 使用finish事件更稳健地捕获响应完成
    res.on('finish', () => {
      // 记录统计信息
      recordApiCall();
    });

    // 记录API调用的函数
    const recordApiCall = async () => {
      try {
        // 构建调用数据
        const callData = {
          endpoint: originalPath,
          method: method
        };
        
        // 记录统计信息（异步，不阻塞响应）
        setImmediate(async () => {
          try {
            await statsService.recordCall(callData);
          } catch (error) {
            console.error('记录API统计失败:', error);
          }
        });
        
      } catch (error) {
        console.error('处理API统计时出错:', error);
      }
    };

    next();
  };
};

/**
 * 获取统计服务实例
 * @returns {ApiStatsService} 统计服务实例
 */
const getStatsService = () => {
  return statsService;
};

/**
 * 预设的中间件配置
 */
const presets = {
  // 基础配置：记录所有API调用
  basic: () => apiStatsMiddleware(),
  
  // 仅API端点：只记录/api开头的路径
  apiOnly: () => apiStatsMiddleware({
    includeOnly: ['/api']
  }),
  
  // 排除静态资源：排除常见的静态文件路径
  excludeStatic: () => apiStatsMiddleware({
    excludePaths: [
      '/static',
      '/assets',
      '/images',
      '/css',
      '/js',
      '/favicon.ico',
      '/robots.txt'
    ]
  }),
  
  // 完整配置：记录所有API调用但排除静态资源
  full: () => apiStatsMiddleware({
    excludePaths: [
      '/static',
      '/assets',
      '/images',
      '/css',
      '/js',
      '/favicon.ico',
      '/robots.txt',
      '/health'
    ]
  })
};

module.exports = {
  apiStatsMiddleware,
  getStatsService,
  initializeStatsService,
  presets
};