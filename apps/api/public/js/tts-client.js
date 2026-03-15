/**
 * TTS客户端调用库
 * 提供简单易用的前端TTS调用接口
 */

class TTSClient {
  constructor(baseUrl = 'http://localhost:3000', apiKey = 'key2') {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.audioCache = new Map();
  }

  /**
   * 获取所有声音模型
   */
  async getModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/voice-models/models`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('获取模型失败:', error);
      throw error;
    }
  }

  /**
   * 获取按分类筛选的模型
   */
  async getModelsByCategory(category) {
    try {
      const response = await fetch(`${this.baseUrl}/api/voice-models/categories/${category}`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (data.success) {
        return data.data.models;
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('获取分类模型失败:', error);
      throw error;
    }
  }

  /**
   * 按标签筛选模型
   */
  async getModelsByTag(tag) {
    try {
      const response = await fetch(`${this.baseUrl}/api/voice-models/tags/${tag}`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (data.success) {
        return data.data.models;
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('获取标签模型失败:', error);
      throw error;
    }
  }

  /**
   * 按语言筛选模型
   */
  async getModelsByLanguage(language) {
    try {
      const response = await fetch(`${this.baseUrl}/api/voice-models/languages/${language}`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (data.success) {
        return data.data.models;
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('获取语言模型失败:', error);
      throw error;
    }
  }

  /**
   * 搜索模型
   */
  async searchModels(query) {
    try {
      const response = await fetch(`${this.baseUrl}/api/voice-models/search?q=${encodeURIComponent(query)}`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (data.success) {
        return data.data.models;
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('搜索模型失败:', error);
      throw error;
    }
  }

  /**
   * 获取单个模型详情
   */
  async getModel(modelId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/voice-models/models/${modelId}`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('获取模型详情失败:', error);
      throw error;
    }
  }

  /**
   * 文本转语音合成
   */
  async synthesize(text, options = {}) {
    const defaultOptions = {
      service: 'aliyun_qwen_http',
      voice: 'aliyun-qwen_http-cherry',
      speed: 1.0,
      pitch: 1.0,
      volume: 5
    };

    const requestParams = { ...defaultOptions, ...options, text };

    try {
      const response = await fetch(`${this.baseUrl}/api/tts/synthesize`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestParams)
      });

      const data = await response.json();
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('语音合成失败:', error);
      throw error;
    }
  }

  /**
   * 批量文本转语音
   */
  async batchSynthesize(texts, options = {}) {
    const requestParams = {
      service: options.service || 'aliyun_qwen_http',
      texts: texts,
      options: {
        voice: options.voice || 'aliyun-qwen_http-cherry',
        speed: options.speed || 1.0,
        pitch: options.pitch || 1.0
      }
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/tts/batch`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestParams)
      });

      const data = await response.json();
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('批量语音合成失败:', error);
      throw error;
    }
  }

  /**
   * 创建音频播放器
   */
  createAudioPlayer(audioUrl) {
    const audio = new Audio(audioUrl);

    return {
      audio,
      play: () => audio.play(),
      pause: () => audio.pause(),
      stop: () => {
        audio.pause();
        audio.currentTime = 0;
      },
      setVolume: (volume) => {
        audio.volume = Math.max(0, Math.min(1, volume));
      },
      setPlaybackRate: (rate) => {
        audio.playbackRate = Math.max(0.5, Math.min(2, rate));
      },
      on: (event, callback) => {
        audio.addEventListener(event, callback);
      }
    };
  }

  /**
   * 快速播放语音
   */
  async playAudio(text, options = {}) {
    try {
      const result = await this.synthesize(text, options);
      if (result.audioUrl) {
        const player = this.createAudioPlayer(result.audioUrl);
        player.play();
        return player;
      } else {
        throw new Error('合成成功但未返回音频URL');
      }
    } catch (error) {
      console.error('播放音频失败:', error);
      throw error;
    }
  }

  /**
   * 缓存音频文件
   */
  async cacheAudio(text, options = {}) {
    const cacheKey = `${text}_${JSON.stringify(options)}`;

    try {
      const result = await this.synthesize(text, options);
      this.audioCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('缓存音频失败:', error);
      throw error;
    }
  }

  /**
   * 获取缓存的音频
   */
  getCachedAudio(text, options = {}) {
    const cacheKey = `${text}_${JSON.stringify(options)}`;
    return this.audioCache.get(cacheKey);
  }

  /**
   * 检查音频是否已缓存
   */
  isAudioCached(text, options = {}) {
    const cacheKey = `${text}_${JSON.stringify(options)}`;
    return this.audioCache.has(cacheKey);
  }

  /**
   * 清除音频缓存
   */
  clearAudioCache() {
    this.audioCache.clear();
  }

  /**
   * 下载音频文件
   */
  async downloadAudio(text, filename, options = {}) {
    try {
      const result = await this.synthesize(text, options);
      if (result.audioUrl) {
        const response = await fetch(result.audioUrl);
        const blob = await response.blob();

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        return true;
      }
      return false;
    } catch (error) {
      console.error('下载音频失败:', error);
      return false;
    }
  }

  /**
   * 获取音频时长（需要加载音频后获取）
   */
  async getAudioDuration(audioUrl) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl);

      audio.addEventListener('loadedmetadata', () => {
        resolve(audio.duration);
      });

      audio.addEventListener('error', () => {
        reject(new Error('音频加载失败'));
      });
    });
  }

  /**
   * 检查服务状态
   */
  async checkServiceStatus() {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      const data = await response.json();
      return data.status === 'OK';
    } catch (error) {
      console.error('检查服务状态失败:', error);
      return false;
    }
  }
}

// 导出给浏览器使用
if (typeof window !== 'undefined') {
  window.TTSClient = TTSClient;
}

// 导出给Node.js使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TTSClient;
}
