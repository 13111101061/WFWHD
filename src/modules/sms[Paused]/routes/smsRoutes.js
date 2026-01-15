/**
 * 短信接码API路由
 * 提供统一的短信接码服务接口
 * 
 * ⚠️  【API路由模块 - 项目管理接口待开发】
 * 状态: 核心接口已完成，项目管理相关接口待补充
 * 已完成: 账号信息、获取手机号、接收验证码、释放号码等基础API
 * 待开发: 项目列表查询、项目创建/管理、批量操作等高级API
 * 
 * 📋 当前可用接口:
 * - GET  /account     - 获取账号信息
 * - POST /phone       - 获取手机号
 * - POST /message     - 获取验证码
 * - POST /complete    - 完整接码流程
 * - DELETE /phone     - 释放手机号
 * - GET  /operators   - 获取运营商列表
 * - GET  /provinces   - 获取省份列表
 * 
 * 🔄 待开发接口:
 * - GET  /projects    - 获取项目列表 (待服务商API确认)
 * - POST /projects    - 创建自定义项目
 * - GET  /projects/:id - 获取项目详情
 * - PUT  /projects/:id - 更新项目信息
 * 
 * 最后更新: 2024年
 * 维护者: API开发团队
 */

const express = require('express');
const router = express.Router();
const SmsCodeService = require('../services/smsCodeService');

// 创建服务实例
const smsCodeService = new SmsCodeService();

// 中间件：验证API密钥
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validApiKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',') : [];
  
  if (!apiKey || !validApiKeys.includes(apiKey)) {
    return res.status(401).json({
      success: false,
      error: 'Invalid API key',
      message: '无效的API密钥'
    });
  }
  
  next();
};

// 错误处理中间件
const handleError = (error, res) => {
  console.error('短信接码API错误:', error);
  
  res.status(500).json({
    success: false,
    error: error.message,
    message: '短信接码服务错误'
  });
};

/**
 * 获取账号信息
 * GET /api/sms/account
 */
router.get('/account', validateApiKey, async (req, res) => {
  try {
    const accountInfo = await smsCodeService.getAccountInfo();
    
    res.json({
      success: true,
      data: accountInfo,
      message: '获取账号信息成功'
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * 获取手机号
 * POST /api/sms/phone
 * Body: {
 *   sid: number,           // 项目ID (必需)
 *   isp?: number,          // 运营商 (1=移动, 5=联通, 9=电信, 14=广电, 16=虚拟运营商)
 *   province?: string,     // 省份代码
 *   ascription?: number,   // 号码类型 (1=虚拟, 2=实卡)
 *   paragraph?: string,    // 限定号段 (如: "1380|1580|1880")
 *   exclude?: string,      // 排除号段
 *   uid?: string          // 指定对接码
 * }
 */
router.post('/phone', validateApiKey, async (req, res) => {
  try {
    const { sid, ...options } = req.body;
    
    if (!sid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: sid',
        message: '缺少必需参数: 项目ID'
      });
    }
    
    const phoneInfo = await smsCodeService.getPhone(sid, options);
    
    res.json({
      success: true,
      data: phoneInfo,
      message: '获取手机号成功'
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * 指定手机号接收短信
 * POST /api/sms/phone/specific
 * Body: {
 *   sid: number,    // 项目ID (必需)
 *   phone: string   // 手机号 (必需)
 * }
 */
router.post('/phone/specific', validateApiKey, async (req, res) => {
  try {
    const { sid, phone } = req.body;
    
    if (!sid || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: sid, phone',
        message: '缺少必需参数: 项目ID或手机号'
      });
    }
    
    const phoneInfo = await smsCodeService.getSpecificPhone(sid, phone);
    
    res.json({
      success: true,
      data: phoneInfo,
      message: '指定手机号成功'
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * 获取验证码
 * POST /api/sms/message
 * Body: {
 *   sid: number,           // 项目ID (必需)
 *   phone: string,         // 手机号 (必需)
 *   maxRetries?: number,   // 最大重试次数 (默认30)
 *   retryInterval?: number // 重试间隔毫秒 (默认2000)
 * }
 */
router.post('/message', validateApiKey, async (req, res) => {
  try {
    const { sid, phone, maxRetries = 30, retryInterval = 2000 } = req.body;
    
    if (!sid || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: sid, phone',
        message: '缺少必需参数: 项目ID或手机号'
      });
    }
    
    const messageInfo = await smsCodeService.getMessage(sid, phone, maxRetries, retryInterval);
    
    res.json({
      success: true,
      data: messageInfo,
      message: '获取验证码成功'
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * 完整接码流程
 * POST /api/sms/complete
 * Body: {
 *   sid: number,           // 项目ID (必需)
 *   maxRetries?: number,   // 获取验证码最大重试次数 (默认30)
 *   isp?: number,          // 运营商
 *   province?: string,     // 省份代码
 *   ascription?: number,   // 号码类型
 *   paragraph?: string,    // 限定号段
 *   exclude?: string,      // 排除号段
 *   uid?: string          // 指定对接码
 * }
 */
router.post('/complete', validateApiKey, async (req, res) => {
  try {
    const { sid, maxRetries = 30, ...options } = req.body;
    
    if (!sid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: sid',
        message: '缺少必需参数: 项目ID'
      });
    }
    
    const result = await smsCodeService.getCodeComplete(sid, options, maxRetries);
    
    res.json({
      success: true,
      data: result,
      message: '完整接码流程成功'
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * 释放手机号
 * DELETE /api/sms/phone
 * Body: {
 *   sid: number,    // 项目ID (必需)
 *   phone: string   // 手机号 (必需)
 * }
 */
router.delete('/phone', validateApiKey, async (req, res) => {
  try {
    const { sid, phone } = req.body;
    
    if (!sid || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: sid, phone',
        message: '缺少必需参数: 项目ID或手机号'
      });
    }
    
    const result = await smsCodeService.releasePhone(sid, phone);
    
    res.json({
      success: true,
      data: result,
      message: '释放手机号成功'
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * 释放全部手机号
 * DELETE /api/sms/phone/all
 */
router.delete('/phone/all', validateApiKey, async (req, res) => {
  try {
    const result = await smsCodeService.releaseAllPhones();
    
    res.json({
      success: true,
      data: result,
      message: '释放全部手机号成功'
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * 拉黑手机号
 * POST /api/sms/blacklist
 * Body: {
 *   sid: number,    // 项目ID (必需)
 *   phone: string   // 手机号 (必需)
 * }
 */
router.post('/blacklist', validateApiKey, async (req, res) => {
  try {
    const { sid, phone } = req.body;
    
    if (!sid || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: sid, phone',
        message: '缺少必需参数: 项目ID或手机号'
      });
    }
    
    const result = await smsCodeService.blacklistPhone(sid, phone);
    
    res.json({
      success: true,
      data: result,
      message: '拉黑手机号成功'
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * 获取运营商列表
 * GET /api/sms/operators
 */
router.get('/operators', validateApiKey, async (req, res) => {
  try {
    const operators = smsCodeService.getOperators();
    
    res.json({
      success: true,
      data: operators,
      message: '获取运营商列表成功'
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * 获取省份列表
 * GET /api/sms/provinces
 */
router.get('/provinces', validateApiKey, async (req, res) => {
  try {
    const provinces = smsCodeService.getProvinces();
    
    res.json({
      success: true,
      data: provinces,
      message: '获取省份列表成功'
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * 健康检查
 * GET /api/sms/health
 */
router.get('/health', async (req, res) => {
  try {
    // 检查服务状态
    const accountInfo = await smsCodeService.getAccountInfo();
    
    res.json({
      success: true,
      data: {
        status: 'healthy',
        service: '短信接码服务',
        balance: accountInfo.balance,
        timestamp: new Date().toISOString()
      },
      message: '服务运行正常'
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      data: {
        status: 'unhealthy',
        service: '短信接码服务',
        error: error.message,
        timestamp: new Date().toISOString()
      },
      message: '服务异常'
    });
  }
});

module.exports = router;