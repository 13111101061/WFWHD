const express = require('express');
const router = express.Router();

// 延迟加载服务，避免循环依赖问题
function getQwenTtsService() {
  return require('../services/qwenTtsService');
}

// 千问TTS服务路由
router.post('/', async (req, res) => {
  try {
    const { text, voice, sample_rate } = req.body;
    
    // 参数验证
    if (!text) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: text'
      });
    }

    // 使用千问TTS服务
    const qwenTtsService = getQwenTtsService();
    const result = await qwenTtsService.synthesize(text, {
      voice: voice || 'Cherry',
      sample_rate: sample_rate || 24000
    });

    // 返回成功结果
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('千问TTS服务调用失败:', error);
    res.status(500).json({
      success: false,
      error: `千问TTS服务调用失败: ${error.message}`
    });
  }
});

// 获取千问TTS音色列表
router.get('/voices', async (req, res) => {
  try {
    const qwenTtsService = getQwenTtsService();
    const voices = qwenTtsService.getAvailableVoices();
    
    res.json({
      success: true,
      data: voices
    });
  } catch (error) {
    console.error('获取千问TTS音色列表失败:', error);
    res.status(500).json({
      success: false,
      error: `获取千问TTS音色列表失败: ${error.message}`
    });
  }
});

module.exports = router;
