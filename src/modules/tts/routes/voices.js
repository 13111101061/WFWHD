/**
 * TTS 音色路由（v2.1 简化版）
 * 统一处理音色查询相关接口
 */

const express = require('express');
const router = express.Router();
const { voiceManager } = require('../core/VoiceManager');
const { ttsFactory } = require('../core/TtsFactory');
const { autoRequestLogger } = require('../middlewares');

// 应用日志中间件
router.use(autoRequestLogger);

/**
 * 获取所有音色（支持过滤）
 * GET /api/voices?provider=aliyun&service=qwen_http&tags=女声,温柔
 */
router.get('/', async (req, res, next) => {
  try {
    await voiceManager.waitForReady(5000);
    
    const { provider, service, tags, search, gender, limit = 100 } = req.query;
    let voices;
    
    // 搜索模式
    if (search) {
      voices = voiceManager.search(search, { 
        provider, 
        limit: parseInt(limit) 
      });
    }
    // 标签过滤
    else if (tags) {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      voices = voiceManager.getByTags(tagList, true); // matchAll
      
      if (provider) {
        voices = voices.filter(v => v.provider === provider);
      }
    }
    // 提供商+服务
    else if (provider && service) {
      voices = voiceManager.getByProviderAndService(provider, service);
    }
    // 仅提供商
    else if (provider) {
      voices = voiceManager.getByProvider(provider);
    }
    // 性别过滤
    else if (gender) {
      voices = voiceManager.getAll().filter(v => v.gender === gender);
    }
    // 全部
    else {
      voices = voiceManager.getAll();
    }
    
    // 限制数量
    voices = voices.slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: voices,
      count: voices.length,
      filters: { provider, service, tags, search, gender },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取音色详情
 * GET /api/voices/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    await voiceManager.waitForReady(5000);
    
    const { id } = req.params;
    const voice = voiceManager.getById(id);
    
    if (!voice) {
      return res.status(404).json({
        success: false,
        error: 'Voice not found',
        id,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      data: voice,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取分类数据
 * GET /api/voices/categories/all
 */
router.get('/categories/all', async (req, res, next) => {
  try {
    await voiceManager.waitForReady(5000);
    
    const allVoices = voiceManager.getAll();
    const categories = {
      byProvider: {},
      byGender: { female: [], male: [] },
      byLanguage: {},
      byTag: {}
    };
    
    for (const voice of allVoices) {
      // 按提供商
      if (!categories.byProvider[voice.provider]) {
        categories.byProvider[voice.provider] = [];
      }
      categories.byProvider[voice.provider].push(voice.id);
      
      // 按性别
      if (voice.gender === 'female') {
        categories.byGender.female.push(voice.id);
      } else if (voice.gender === 'male') {
        categories.byGender.male.push(voice.id);
      }
      
      // 按语言
      for (const lang of voice.languages || []) {
        if (!categories.byLanguage[lang]) {
          categories.byLanguage[lang] = [];
        }
        categories.byLanguage[lang].push(voice.id);
      }
      
      // 按标签
      for (const tag of voice.tags || []) {
        if (!categories.byTag[tag]) {
          categories.byTag[tag] = [];
        }
        categories.byTag[tag].push(voice.id);
      }
    }
    
    res.json({
      success: true,
      data: categories,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取提供商列表
 * GET /api/voices/providers
 */
router.get('/meta/providers', async (req, res, next) => {
  try {
    const providers = ttsFactory.getAvailableProviders();
    const stats = voiceManager.getProviderStats();
    
    const enrichedProviders = providers.map(p => ({
      ...p,
      stats: stats[p.provider] || { count: 0 }
    }));
    
    res.json({
      success: true,
      data: enrichedProviders,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取标签统计
 * GET /api/voices/tags
 */
router.get('/meta/tags', async (req, res, next) => {
  try {
    const stats = voiceManager.getTagStats();
    const sortedTags = Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
    
    res.json({
      success: true,
      data: sortedTags,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
