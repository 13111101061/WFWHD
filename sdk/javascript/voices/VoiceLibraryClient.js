/**
 * TTS音色工厂 SDK - JavaScript/前端版
 *
 * 提供前端访问音色库的完整功能
 * 支持音色查询、筛选、分组等功能
 *
 * @author TTS Team
 * @version 1.0.0
 */

class VoiceLibraryClient {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   * @param {string} config.apiBaseUrl - API基础URL (默认: '/api')
   * @param {string} config.apiKey - API密钥 (可选)
   * @param {number} config.timeout - 请求超时时间(毫秒, 默认: 10000)
   */
  constructor(config = {}) {
    this.apiBaseUrl = config.apiBaseUrl || '/api';
    this.apiKey = config.apiKey || null;
    this.timeout = config.timeout || 10000;

    // 缓存
    this.cache = {
      voices: null,
      providers: null,
      tags: null,
      timestamp: null,
      ttl: config.cacheTTL || 300000 // 5分钟缓存
    };

    // 事件监听器
    this.eventListeners = {};
  }

  /**
   * 添加事件监听器
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  /**
   * 触发事件
   * @private
   */
  _emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => callback(data));
    }
  }

  /**
   * 发送HTTP请求
   * @private
   */
  async _request(endpoint, options = {}) {
    const url = `${this.apiBaseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          message: `HTTP ${response.status}: ${response.statusText}`
        }));
        throw new Error(error.message || '请求失败');
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('请求超时');
      }

      throw error;
    }
  }

  /**
   * 检查缓存是否有效
   * @private
   */
  _isCacheValid() {
    return this.cache.voices &&
           this.cache.timestamp &&
           (Date.now() - this.cache.timestamp) < this.cache.ttl;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache = {
      voices: null,
      providers: null,
      tags: null,
      timestamp: null,
      ttl: this.cache.ttl
    };
    console.log('✅ 音色库缓存已清除');
  }

  /**
   * ================================
   * 核心 API 方法
   * ================================
   */

  /**
   * 获取所有音色列表
   * @param {Object} options - 查询选项
   * @param {boolean} options.useCache - 是否使用缓存(默认: true)
   * @param {boolean} options.forceRefresh - 强制刷新(默认: false)
   * @returns {Promise<Array>} 音色列表
   */
  async getVoices(options = {}) {
    const { useCache = true, forceRefresh = false } = options;

    // 检查缓存
    if (useCache && !forceRefresh && this._isCacheValid()) {
      console.log('📦 使用缓存的音色数据');
      return this.cache.voices;
    }

    try {
      console.log('🌐 从服务器获取音色数据...');
      const result = await this._request('/voice-models/models');

      if (!result.success || !result.data) {
        throw new Error(result.message || '获取音色列表失败');
      }

      // 更新缓存
      this.cache.voices = result.data.models || result.data;
      this.cache.timestamp = Date.now();

      console.log(`✅ 成功加载 ${this.cache.voices.length} 个音色`);

      this._emit('voicesLoaded', this.cache.voices);
      return this.cache.voices;

    } catch (error) {
      console.error('❌ 获取音色列表失败:', error.message);
      throw error;
    }
  }

  /**
   * 根据系统ID获取单个音色
   * @param {string} systemId - 音色系统ID (如: 'aliyun-qwen-kai')
   * @returns {Promise<Object>} 音色对象
   */
  async getVoiceById(systemId) {
    try {
      const voices = await this.getVoices();
      const voice = voices.find(v => v.id === systemId);

      if (!voice) {
        throw new Error(`未找到音色: ${systemId}`);
      }

      return voice;
    } catch (error) {
      console.error(`❌ 获取音色失败 [${systemId}]:`, error.message);
      throw error;
    }
  }

  /**
   * 根据服务商获取音色列表
   * @param {string} provider - 服务商名称 (如: 'aliyun', 'tencent')
   * @returns {Promise<Array>} 音色列表
   */
  async getVoicesByProvider(provider) {
    try {
      const voices = await this.getVoices();
      return voices.filter(v => v.provider === provider);
    } catch (error) {
      console.error(`❌ 获取${provider}音色失败:`, error.message);
      throw error;
    }
  }

  /**
   * 根据标签获取音色列表
   * @param {string} tag - 标签名称 (如: '双语', '热门', '可爱')
   * @returns {Promise<Array>} 音色列表
   */
  async getVoicesByTag(tag) {
    try {
      const voices = await this.getVoices();
      return voices.filter(v => v.tags && v.tags.includes(tag));
    } catch (error) {
      console.error(`❌ 获取${tag}标签音色失败:`, error.message);
      throw error;
    }
  }

  /**
   * 搜索音色
   * @param {string} keyword - 搜索关键词
   * @param {Object} options - 搜索选项
   * @param {Array<string>} options.fields - 搜索字段 (默认: ['name', 'tags'])
   * @returns {Promise<Array>} 匹配的音色列表
   */
  async searchVoices(keyword, options = {}) {
    try {
      const voices = await this.getVoices();
      const { fields = ['name', 'tags', 'description'] } = options;
      const keywordLower = keyword.toLowerCase();

      return voices.filter(voice => {
        return fields.some(field => {
          const value = voice[field];
          if (!value) return false;

          if (Array.isArray(value)) {
            return value.some(v =>
              String(v).toLowerCase().includes(keywordLower)
            );
          }

          return String(value).toLowerCase().includes(keywordLower);
        });
      });
    } catch (error) {
      console.error(`❌ 搜索音色失败 [${keyword}]:`, error.message);
      throw error;
    }
  }

  /**
   * 获取所有服务商列表
   * @returns {Promise<Array>} 服务商列表
   */
  async getProviders() {
    try {
      const voices = await this.getVoices();
      const providersMap = new Map();

      voices.forEach(voice => {
        if (!providersMap.has(voice.provider)) {
          providersMap.set(voice.provider, {
            provider: voice.provider,
            service: voice.service,
            count: 0,
            models: []
          });
        }

        const provider = providersMap.get(voice.provider);
        provider.count++;
        if (!provider.models.includes(voice.model)) {
          provider.models.push(voice.model);
        }
      });

      return Array.from(providersMap.values());
    } catch (error) {
      console.error('❌ 获取服务商列表失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取所有标签列表
   * @returns {Promise<Array>} 标签列表
   */
  async getTags() {
    try {
      const voices = await this.getVoices();
      const tagsMap = new Map();

      voices.forEach(voice => {
        if (voice.tags && Array.isArray(voice.tags)) {
          voice.tags.forEach(tag => {
            if (!tagsMap.has(tag)) {
              tagsMap.set(tag, {
                name: tag,
                count: 0
              });
            }
            tagsMap.get(tag).count++;
          });
        }
      });

      return Array.from(tagsMap.values()).sort((a, b) => b.count - a.count);
    } catch (error) {
      console.error('❌ 获取标签列表失败:', error.message);
      throw error;
    }
  }

  /**
   * 按性别筛选音色
   * @param {string} gender - 性别 ('male' | 'female')
   * @returns {Promise<Array>} 音色列表
   */
  async getVoicesByGender(gender) {
    try {
      const voices = await this.getVoices();
      return voices.filter(v => v.gender === gender);
    } catch (error) {
      console.error(`❌ 获取${gender}音色失败:`, error.message);
      throw error;
    }
  }

  /**
   * 按语言筛选音色
   * @param {string} language - 语言代码 (如: 'zh-CN', 'en-US')
   * @returns {Promise<Array>} 音色列表
   */
  async getVoicesByLanguage(language) {
    try {
      const voices = await this.getVoices();
      return voices.filter(v =>
        v.languages && v.languages.includes(language)
      );
    } catch (error) {
      console.error(`❌ 获取${language}音色失败:`, error.message);
      throw error;
    }
  }

  /**
   * 高级筛选
   * @param {Object} filters - 筛选条件
   * @param {string} filters.provider - 服务商
   * @param {string} filters.gender - 性别
   * @param {string} filters.language - 语言
   * @param {Array<string>} filters.tags - 标签数组
   * @param {string} filters.search - 搜索关键词
   * @returns {Promise<Array>} 筛选后的音色列表
   */
  async filterVoices(filters = {}) {
    try {
      let voices = await this.getVoices();

      // 服务商筛选
      if (filters.provider) {
        voices = voices.filter(v => v.provider === filters.provider);
      }

      // 性别筛选
      if (filters.gender) {
        voices = voices.filter(v => v.gender === filters.gender);
      }

      // 语言筛选
      if (filters.language) {
        voices = voices.filter(v =>
          v.languages && v.languages.includes(filters.language)
        );
      }

      // 标签筛选
      if (filters.tags && filters.tags.length > 0) {
        voices = voices.filter(v =>
          filters.tags.every(tag => v.tags && v.tags.includes(tag))
        );
      }

      // 关键词搜索
      if (filters.search) {
        const keyword = filters.search.toLowerCase();
        voices = voices.filter(v =>
          v.name.toLowerCase().includes(keyword) ||
          (v.description && v.description.toLowerCase().includes(keyword)) ||
          (v.tags && v.tags.some(t => t.toLowerCase().includes(keyword)))
        );
      }

      return voices;
    } catch (error) {
      console.error('❌ 筛选音色失败:', error.message);
      throw error;
    }
  }

  /**
   * ================================
   * 工具方法
   * ================================
   */

  /**
   * 获取音色统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStatistics() {
    try {
      const voices = await this.getVoices();

      const stats = {
        total: voices.length,
        byProvider: {},
        byGender: { male: 0, female: 0 },
        byLanguage: {},
        byTag: {},
        byModel: {}
      };

      voices.forEach(voice => {
        // 按服务商统计
        if (!stats.byProvider[voice.provider]) {
          stats.byProvider[voice.provider] = 0;
        }
        stats.byProvider[voice.provider]++;

        // 按性别统计
        if (voice.gender) {
          stats.byGender[voice.gender]++;
        }

        // 按语言统计
        if (voice.languages) {
          voice.languages.forEach(lang => {
            if (!stats.byLanguage[lang]) {
              stats.byLanguage[lang] = 0;
            }
            stats.byLanguage[lang]++;
          });
        }

        // 按标签统计
        if (voice.tags) {
          voice.tags.forEach(tag => {
            if (!stats.byTag[tag]) {
              stats.byTag[tag] = 0;
            }
            stats.byTag[tag]++;
          });
        }

        // 按模型统计
        if (voice.model) {
          if (!stats.byModel[voice.model]) {
            stats.byModel[voice.model] = 0;
          }
          stats.byModel[voice.model]++;
        }
      });

      return stats;
    } catch (error) {
      console.error('❌ 获取统计信息失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取推荐音色
   * @param {Object} options - 推荐选项
   * @param {number} options.limit - 返回数量 (默认: 10)
   * @param {string} options.provider - 指定服务商
   * @returns {Promise<Array>} 推荐音色列表
   */
  async getRecommendedVoices(options = {}) {
    const { limit = 10, provider } = options;

    try {
      let voices = await this.getVoices();

      // 优先选择带"热门"标签的音色
      const hotVoices = voices.filter(v =>
        v.tags && v.tags.includes('热门')
      );

      // 如果热门音色不足，补充其他音色
      let recommended = hotVoices.length >= limit
        ? hotVoices
        : [...hotVoices, ...voices.filter(v =>
            !v.tags || !v.tags.includes('热门')
          )];

      // 服务商筛选
      if (provider) {
        recommended = recommended.filter(v => v.provider === provider);
      }

      return recommended.slice(0, limit);
    } catch (error) {
      console.error('❌ 获取推荐音色失败:', error.message);
      throw error;
    }
  }

  /**
   * 导出音色数据为JSON
   * @param {Object} options - 导出选项
   * @param {boolean} options.pretty - 是否格式化 (默认: true)
   * @returns {Promise<string>} JSON字符串
   */
  async exportToJSON(options = {}) {
    const { pretty = true } = options;

    try {
      const voices = await this.getVoices();
      return JSON.stringify(voices, null, pretty ? 2 : 0);
    } catch (error) {
      console.error('❌ 导出音色数据失败:', error.message);
      throw error;
    }
  }

  /**
   * 批量获取音色详情
   * @param {Array<string>} systemIds - 音色系统ID数组
   * @returns {Promise<Array>} 音色详情数组
   */
  async getVoicesByIds(systemIds) {
    try {
      const voices = await this.getVoices();
      const voiceMap = new Map(
        voices.map(v => [v.id, v])
      );

      return systemIds.map(id => voiceMap.get(id)).filter(Boolean);
    } catch (error) {
      console.error('❌ 批量获取音色失败:', error.message);
      throw error;
    }
  }

  /**
   * ================================
   * 别名方法（兼容性）
   * ================================
   */

  /**
   * 获取所有音色（别名）
   */
  async getAll(options) {
    return this.getVoices(options);
  }

  /**
   * 搜索音色（别名）
   */
  async search(keyword, options) {
    return this.searchVoices(keyword, options);
  }

  /**
   * 按标签获取（别名）
   */
  async getByTag(tag) {
    return this.getVoicesByTag(tag);
  }

  /**
   * 按服务商获取（别名）
   */
  async getByProvider(provider) {
    return this.getVoicesByProvider(provider);
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  // Node.js 环境
  module.exports = VoiceLibraryClient;
} else {
  // 浏览器环境
  window.VoiceLibraryClient = VoiceLibraryClient;
}
