const express = require('express');
const router = express.Router();

// 延迟加载服务，避免循环依赖问题
function getQwenTtsHttpService() {
  return require('../services/qwenTtsHttpService');
}

// 千问TTS HTTP服务路由
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

    // 使用千问TTS HTTP服务
    const qwenTtsHttpService = getQwenTtsHttpService();
    const result = await qwenTtsHttpService.synthesize(text, {
      voice: voice || 'Cherry',
      sample_rate: sample_rate || 24000
    });

    // 返回成功结果
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('千问TTS HTTP服务调用失败:', error);
    res.status(500).json({
      success: false,
      error: `千问TTS HTTP服务调用失败: ${error.message}`
    });
  }
});

// 获取千问TTS HTTP音色列表
router.get('/voices', async (req, res) => {
  try {
    const qwenTtsHttpService = getQwenTtsHttpService();
    const voices = qwenTtsHttpService.getAvailableVoices();
    
    res.json({
      success: true,
      data: voices
    });
  } catch (error) {
    console.error('获取千问TTS HTTP音色列表失败:', error);
    res.status(500).json({
      success: false,
      error: `获取千问TTS HTTP音色列表失败: ${error.message}`
    });
  }
});

module.exports = router;
