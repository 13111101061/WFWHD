/**
 * 凭证管理路由
 *
 * 提供凭证状态查询和管理 API
 *
 * 权限控制：
 * - 读取操作：需要认证
 * - 写入操作：需要 admin.access 权限
 */

const express = require('express');
const router = express.Router();
const credentials = require('../index');
const { unifiedAuth } = require('../../../core/middleware/apiKeyMiddleware');

// ==================== 读取接口（需要认证） ====================

/**
 * GET /api/credentials/status
 * 获取所有服务商凭证配置状态
 */
router.get('/status',
  unifiedAuth.createMiddleware({ required: true, service: 'credentials' }),
  (req, res) => {
    const status = credentials.getRegistry().listAll();

    res.json({
      success: true,
      data: status,
      poolMode: credentials.isPoolMode(),
      timestamp: new Date().toISOString()
    });
  });

/**
 * GET /api/credentials/providers
 * 获取已配置的服务商列表
 */
router.get('/providers',
  unifiedAuth.createMiddleware({ required: true, service: 'credentials' }),
  (req, res) => {
    const providers = credentials.listProviders();

    res.json({
      success: true,
      data: providers,
      count: providers.length,
      poolMode: credentials.isPoolMode(),
      timestamp: new Date().toISOString()
    });
  });

/**
 * GET /api/credentials/validate
 * 验证所有凭证配置
 */
router.get('/validate',
  unifiedAuth.createMiddleware({ required: true, service: 'credentials' }),
  (req, res) => {
    const results = credentials.getRegistry().validateAll();

    const summary = {
      total: results.length,
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length
    };

    res.json({
      success: true,
      data: results,
      summary,
      timestamp: new Date().toISOString()
    });
  });

/**
 * GET /api/credentials/validate/:provider
 * 验证指定服务商凭证
 */
router.get('/validate/:provider',
  unifiedAuth.createMiddleware({ required: true, service: 'credentials' }),
  (req, res) => {
    const { provider } = req.params;
    const result = credentials.getRegistry().validate(provider);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  });

// ==================== 池化管理 API（需要认证） ====================

/**
 * GET /api/credentials/providers/:provider/accounts
 * 获取服务商账号列表
 */
router.get('/providers/:provider/accounts',
  unifiedAuth.createMiddleware({ required: true, service: 'credentials' }),
  (req, res) => {
    const { provider } = req.params;

    const accounts = credentials.getProviderAccounts(provider);

    if (accounts.length === 0) {
      // 检查服务商是否存在
      const providerInfo = credentials.listProviders().find(p => p.key === provider);
      if (!providerInfo) {
        return res.status(404).json({
          success: false,
          error: `Provider "${provider}" not found`
        });
      }

      // 服务商存在但没有池化账号
      return res.json({
        success: true,
        data: [],
        message: 'Provider is in single-account mode',
        poolMode: false,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: accounts,
      poolMode: true,
      timestamp: new Date().toISOString()
    });
  });

/**
 * GET /api/credentials/providers/:provider/accounts/:accountId
 * 获取单个账号详情（不含凭证）
 */
router.get('/providers/:provider/accounts/:accountId',
  unifiedAuth.createMiddleware({ required: true, service: 'credentials' }),
  (req, res) => {
    const { provider, accountId } = req.params;

    // getAccount() 返回已脱敏的账号信息
    const account = credentials.getAccount(provider, accountId);

    if (!account) {
      return res.status(404).json({
        success: false,
        error: `Account "${accountId}" not found in provider "${provider}"`
      });
    }

    res.json({
      success: true,
      data: account,
      timestamp: new Date().toISOString()
    });
  });

/**
 * GET /api/credentials/providers/:provider/health
 * 获取服务商健康状态
 */
router.get('/providers/:provider/health',
  unifiedAuth.createMiddleware({ required: true, service: 'credentials' }),
  (req, res) => {
    const { provider } = req.params;

    const health = credentials.getHealthStatus(provider);

    if (!health) {
      // 检查服务商是否存在
      const providerInfo = credentials.listProviders().find(p => p.key === provider);
      if (!providerInfo) {
        return res.status(404).json({
          success: false,
          error: `Provider "${provider}" not found`
        });
      }

      // 服务商存在但没有池化
      return res.json({
        success: true,
        data: {
          provider,
          name: providerInfo.name,
          overallStatus: providerInfo.configured ? 'healthy' : 'unconfigured',
          poolMode: false
        },
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString()
    });
  });

// ==================== 写入接口（需要管理员权限） ====================

/**
 * PATCH /api/credentials/providers/:provider/accounts/:accountId
 * 更新账号状态（启用/禁用）
 */
router.patch('/providers/:provider/accounts/:accountId',
  unifiedAuth.createMiddleware({
    required: true,
    permissions: ['admin.access'],
    service: 'credentials'
  }),
  (req, res) => {
    const { provider, accountId } = req.params;
    const { enabled } = req.body;

    // 验证账号存在
    const account = credentials.getAccount(provider, accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: `Account "${accountId}" not found in provider "${provider}"`
      });
    }

    // 更新状态
    if (enabled === true) {
      credentials.enableAccount(provider, accountId);
    } else if (enabled === false) {
      credentials.disableAccount(provider, accountId);
    }

    const updatedAccount = credentials.getAccount(provider, accountId);

    res.json({
      success: true,
      data: {
        id: accountId,
        enabled: updatedAccount.enabled
      },
      message: `Account ${accountId} ${enabled ? 'enabled' : 'disabled'}`,
      timestamp: new Date().toISOString()
    });
  });

/**
 * POST /api/credentials/providers/:provider/accounts/:accountId/reset
 * 重置账号熔断状态
 */
router.post('/providers/:provider/accounts/:accountId/reset',
  unifiedAuth.createMiddleware({
    required: true,
    permissions: ['admin.access'],
    service: 'credentials'
  }),
  (req, res) => {
    const { provider, accountId } = req.params;

    // 验证账号存在
    const account = credentials.getAccount(provider, accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: `Account "${accountId}" not found in provider "${provider}"`
      });
    }

    credentials.resetCircuit(provider, accountId);

    const health = credentials.getHealthStatus(provider);
    const accountHealth = health?.accounts?.find(a => a.id === accountId);

    res.json({
      success: true,
      data: {
        id: accountId,
        health: accountHealth
      },
      message: `Circuit breaker reset for account ${accountId}`,
      timestamp: new Date().toISOString()
    });
  });

module.exports = router;