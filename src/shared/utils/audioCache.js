/**
 * 简单的音频缓存机制
 * 用于缓存已生成的音频文件，避免重复请求相同文本
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// 缓存目录
const CACHE_DIR = path.join(__dirname, '..', '..', 'storage', 'cache', 'audio_cache');

// 确保缓存目录存在
async function ensureCacheDirectory() {
  try {
    await fs.access(CACHE_DIR);
  } catch (error) {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  }
}

// 生成文本的哈希值作为缓存键
function generateCacheKey(text, service, options) {
  const cacheData = {
    text,
    service,
    options
  };
  
  const hash = crypto
    .createHash('md5')
    .update(JSON.stringify(cacheData))
    .digest('hex');
    
  return hash;
}

// 检查缓存是否存在
async function hasCache(key) {
  try {
    const cachePath = path.join(CACHE_DIR, `${key}.json`);
    await fs.access(cachePath);
    return true;
  } catch (error) {
    return false;
  }
}

// 获取缓存信息
async function getCache(key) {
  try {
    const cachePath = path.join(CACHE_DIR, `${key}.json`);
    const cacheData = await fs.readFile(cachePath, 'utf8');
    return JSON.parse(cacheData);
  } catch (error) {
    return null;
  }
}

// 保存缓存信息
async function setCache(key, data) {
  try {
    await ensureCacheDirectory();
    const cachePath = path.join(CACHE_DIR, `${key}.json`);
    await fs.writeFile(cachePath, JSON.stringify(data), 'utf8');
    return true;
  } catch (error) {
    console.error('保存缓存失败:', error);
    return false;
  }
}

// 检查音频文件是否存在
async function audioFileExists(filepath) {
  try {
    await fs.access(filepath);
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  generateCacheKey,
  hasCache,
  getCache,
  setCache,
  audioFileExists
};