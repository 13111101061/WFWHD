/**
 * 凭证管理路由
 */

const express = require('express');
const router = express.Router();
const credentials = require('../index');

/**
 * GET /api/credentials/status
 * 获取所有服务商凭证配置状态
 */
router.get('/status', (req, res) => {
  const status = credentials.getRegistry().listAll();

  res.json({
    success: true,
    data: status,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/credentials/providers
 * 获取已配置的服务商列表
 */
router.get('/providers', (req, res) => {
  const configured = credentials.getConfiguredProviders();

  res.json({
    success: true,
    data: configured,
    count: configured.length,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/credentials/validate
 * 验证所有凭证配置
 */
router.get('/validate', (req, res) => {
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
router.get('/validate/:provider', (req, res) => {
  const { provider } = req.params;
  const result = credentials.getRegistry().validate(provider);

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;