/**
 * TTS 健康检查路由
 * 统一的健康状态检查端点
 */

const express = require('express');
const router = express.Router();
const { voiceManager } = require('../core/VoiceManager');
const { ttsFactory } = require('../core/TtsFactory');
const { ttsServiceManager } = require('../core/TtsServiceManager');

/**
 * TTS 系统健康检查
 * GET /api/tts/health
 */
router.get('/', async (req, res) => {
  try {
    const vmHealth = voiceManager.getHealth();
    const factoryStats = await ttsFactory.getStats();
    const serviceStats = ttsServiceManager.getStats();
    
    // 综合状态判断
    let overallStatus = 'healthy';
    if (vmHealth.status !== 'healthy') {
      overallStatus = 'degraded';
    }
    if (serviceStats.overview.failedRequests > serviceStats.overview.successfulRequests) {
      overallStatus = 'unhealthy';
    }
    
    res.json({
      success: true,
      status: overallStatus,
      timestamp: new Date().toISOString(),
      components: {
        voiceManager: {
          status: vmHealth.status,
          voices: vmHealth.voices,
          providers: vmHealth.providers,
          isReady: vmHealth.isReady
        },
        factory: {
          cachedServices: factoryStats.cachedServices,
          availableProviders: factoryStats.availableProviders
        },
        serviceManager: {
          totalRequests: serviceStats.overview.totalRequests,
          successRate: serviceStats.overview.successRate,
          averageSynthesisTime: serviceStats.overview.averageSynthesisTime,
          activeCircuitBreakers: serviceStats.circuitBreakers.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * VoiceManager 详细状态
 * GET /api/tts/health/voice-manager
 */
router.get('/voice-manager', async (req, res) => {
  try {
    const health = voiceManager.getHealth();
    const stats = voiceManager.getStats();
    const providerStats = voiceManager.getProviderStats();
    
    res.json({
      success: true,
      data: {
        health,
        stats,
        providerStats
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * TTS 服务统计
 * GET /api/tts/health/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = ttsServiceManager.getStats();
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 简单存活检查
 * GET /api/tts/health/ping
 */
router.get('/ping', (req, res) => {
  res.json({
    success: true,
    pong: true,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
