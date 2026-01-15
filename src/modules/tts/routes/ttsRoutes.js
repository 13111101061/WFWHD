const express = require('express');
const router = express.Router();

const cosyVoiceService = require('../services/cosyVoiceService');

/**
 * @route POST /api/tts
 * @desc 文本转语音
 * @access Public
 */
router.post('/', async (req, res) => {
  try {
    const { text, voice, speed, pitch, model, format, sample_rate } = req.body;
    
    // 验证请求参数
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: text'
      });
    }
    
    // 参数验证
    if (typeof text !== 'string' || text.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Text must be a non-empty string'
      });
    }
    
    // 检查文本长度是否超过限制 (2000字符)
    if (text.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Text length must not exceed 2000 characters'
      });
    }
    
    // 可选参数验证
    if (speed && (typeof speed !== 'number' || speed < 0.5 || speed > 2.0)) {
      return res.status(400).json({
        success: false,
        error: 'Speed must be a number between 0.5 and 2.0'
      });
    }
    
    if (pitch && (typeof pitch !== 'number' || pitch < 0.5 || pitch > 1.5)) {
      return res.status(400).json({
        success: false,
        error: 'Pitch must be a number between 0.5 and 1.5'
      });
    }
    
    // 调用CosyVoice服务
    const result = await cosyVoiceService.convertTextToSpeech(text, { 
      voice, 
      rate: speed, 
      pitch, 
      model,
      format,
      sample_rate
    });
    
    // 验证服务响应
    if (!result || !result.audioUrl) {
      console.error('CosyVoice service returned invalid response:', result);
      return res.status(500).json({
        success: false,
        error: 'Invalid response from TTS service',
        message: 'Failed to get audio URL from TTS service'
      });
    }
    
    res.json({
      success: true,
      data: {
        text: result.text || text,
        audioUrl: result.audioUrl,
        taskId: result.taskId || null,
        duration: result.duration || 0,
        // 添加时间戳
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('TTS API Error:', {
      message: error.message,
      stack: error.stack,
      // 如果有内部错误对象，也记录它
      innerError: error.innerError || null
    });
    
    // 根据错误类型返回不同的响应
    const statusCode = error.statusCode || 500;
    const errorMessage = error.statusCode ? error.message : 'Internal server error';
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: error.message,
      // 在开发环境提供更多信息
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * @route GET /api/tts/voices
 * @desc 获取支持的语音列表
 * @access Public
 */
router.get('/voices', (req, res) => {
  try {
    const voices = cosyVoiceService.getAvailableVoices();
    
    res.json({
      success: true,
      data: voices
    });
  } catch (error) {
    console.error('Get voices error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve voices',
      message: error.message
    });
  }
});

module.exports = router;