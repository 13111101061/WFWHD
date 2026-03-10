/**
 * VoiceManager - 音色管理器（v2.0）
 *
 * @deprecated 此类已废弃，请使用 VoiceRegistry
 *
 * 迁移指南:
 * - 旧: const { voiceManager } = require('./core/VoiceManager');
 * - 新: const { voiceRegistry } = require('./core/VoiceRegistry');
 *
 * VoiceRegistry 提供更简洁的API：
 * - 查询: get(id), getByProvider(provider), getAll()
 * - 管理: add(voice), remove(id), update(id, data)
 * - 持久化: save(), reload()
 *
 * 此文件将在下一版本删除
 */

const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');
const EventEmitter = require('events');

class VoiceManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // 配置选项
    this.configPath = path.resolve(
      options.configPath || 
      process.env.VOICE_CONFIG_PATH || 
      path.join(__dirname, '../../../../voices/dist/voices.json')
    );
    this.enableHotReload = options.enableHotReload !== false;
    this.tagIndexThreshold = options.tagIndexThreshold || 500;
    this.retryInterval = options.retryInterval || 5000;
    
    // 状态
    this.store = new Map();           // id -> Voice (主索引)
    this.providerIndex = new Map();   // provider -> Voice[] (提供商索引)
    this.tagIndex = null;             // tag -> Set<id> (标签倒排索引，可选)
    this.serviceIndex = new Map();    // service -> Voice[] (服务类型索引)
    
    this.isReady = false;
    this.isLoading = false;
    this.watcher = null;
    this.lastError = null;
    this.lastLoadTime = null;
    
    // 统计
    this.stats = {
      loadCount: 0,
      errorCount: 0,
      hotReloadCount: 0
    };
  }

  /**
   * 初始化 - 加载配置并启动热监听
   */
  async initialize() {
    if (this.isReady || this.isLoading) {
      return;
    }

    console.log('[VoiceManager] Initializing...');
    console.log(`[VoiceManager] Config path: ${this.configPath}`);
    
    const success = await this.load();
    
    if (success && this.enableHotReload) {
      this.startWatching();
    }
    
    return success;
  }

  /**
   * 加载配置（核心方法）
   * 策略：先加载到新Map，验证通过后原子替换
   */
  async load(force = false) {
    if (this.isLoading && !force) {
      console.log('[VoiceManager] Load already in progress, skipping...');
      return false;
    }

    this.isLoading = true;
    this.lastError = null;
    
    try {
      // 1. 检查文件存在
      try {
        await fs.access(this.configPath);
      } catch (err) {
        throw new Error(`Config file not found: ${this.configPath}`);
      }

      // 2. 读取并解析
      const raw = await fs.readFile(this.configPath, 'utf8');
      const data = JSON.parse(raw);
      
      if (!data.voices || !Array.isArray(data.voices)) {
        throw new Error('Invalid voices.json: missing voices array');
      }

      // 3. 构建新索引
      const newStore = new Map();
      const newProviderIndex = new Map();
      const newServiceIndex = new Map();
      
      let skipCount = 0;
      
      for (const voice of data.voices) {
        // 基础校验
        if (!voice.id || !voice.provider) {
          console.warn(`[VoiceManager] Skip invalid voice (missing id/provider):`, voice);
          skipCount++;
          continue;
        }

        // 检查重复
        if (newStore.has(voice.id)) {
          console.warn(`[VoiceManager] Duplicate voice id: ${voice.id}, skipping`);
          skipCount++;
          continue;
        }
        
        // 存入主索引
        newStore.set(voice.id, voice);
        
        // 构建提供商索引
        if (!newProviderIndex.has(voice.provider)) {
          newProviderIndex.set(voice.provider, []);
        }
        newProviderIndex.get(voice.provider).push(voice);
        
        // 构建服务类型索引
        const service = voice.service || 'default';
        if (!newServiceIndex.has(service)) {
          newServiceIndex.set(service, []);
        }
        newServiceIndex.get(service).push(voice);
      }

      // 4. 条件构建标签倒排索引（大数据量时启用）
      let newTagIndex = null;
      if (newStore.size >= this.tagIndexThreshold) {
        newTagIndex = this.buildTagIndex(newStore);
        console.log(`[VoiceManager] Tag index built: ${newTagIndex.size} tags`);
      }

      // 5. 原子替换（无锁切换）
      const oldStore = this.store;
      this.store = newStore;
      this.providerIndex = newProviderIndex;
      this.serviceIndex = newServiceIndex;
      this.tagIndex = newTagIndex;
      
      // 6. 清理旧数据（帮助GC）
      oldStore.clear();
      
      // 7. 更新状态
      this.isReady = true;
      this.isLoading = false;
      this.lastLoadTime = new Date();
      this.stats.loadCount++;
      
      // 8. 输出摘要
      const providers = Array.from(newProviderIndex.keys());
      console.log(`[VoiceManager] ✅ Loaded ${newStore.size} voices (${skipCount} skipped)`);
      console.log(`[VoiceManager]    Providers: ${providers.join(', ')}`);
      
      this.emit('loaded', { 
        total: newStore.size,
        skipped: skipCount,
        providers: providers,
        timestamp: this.lastLoadTime
      });
      
      return true;
      
    } catch (error) {
      this.isLoading = false;
      this.lastError = error;
      this.stats.errorCount++;
      
      console.error('[VoiceManager] ❌ Load failed:', error.message);
      
      // 首次加载失败时初始化空状态，避免undefined错误
      if (!this.isReady) {
        console.warn('[VoiceManager] Initializing with empty store');
        this.store = new Map();
        this.providerIndex = new Map();
        this.serviceIndex = new Map();
        this.tagIndex = null;
      }
      // 非首次加载失败保持旧数据（优雅降级）
      else {
        console.log('[VoiceManager] Keeping old data (graceful degradation)');
      }
      
      this.emit('loadFailed', error);
      
      // 定时重试（如果配置允许）
      if (this.retryInterval > 0 && this.enableHotReload) {
        setTimeout(() => this.load(true), this.retryInterval);
      }
      
      return false;
    }
  }

  /**
   * 构建标签倒排索引
   */
  buildTagIndex(store) {
    const index = new Map();
    
    for (const [id, voice] of store) {
      for (const tag of voice.tags || []) {
        if (!index.has(tag)) {
          index.set(tag, new Set());
        }
        index.get(tag).add(id);
      }
    }
    
    return index;
  }

  /**
   * 启动文件监听（热重载）
   */
  startWatching() {
    if (this.watcher) {
      return;
    }

    console.log('[VoiceManager] Starting file watcher...');
    
    this.watcher = chokidar.watch(this.configPath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,  // 等待300ms确保写入完成
        pollInterval: 100
      }
    });

    this.watcher.on('change', async () => {
      console.log('\n[VoiceManager] 📡 Config file changed, reloading...');
      const success = await this.load(true);
      if (success) {
        this.stats.hotReloadCount++;
        this.emit('hotReloaded', { 
          timestamp: new Date().toISOString(),
          totalReloads: this.stats.hotReloadCount
        });
      }
    });

    this.watcher.on('error', (error) => {
      console.error('[VoiceManager] Watch error:', error);
    });
  }

  /**
   * 停止监听
   */
  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('[VoiceManager] File watcher stopped');
    }
  }

  // ==================== 查询接口 ====================

  /**
   * 精确查询（O(1)）
   */
  getById(id) {
    return this.store.get(id);
  }

  /**
   * 按提供商查询
   */
  getByProvider(provider) {
    return this.providerIndex.get(provider) || [];
  }

  /**
   * 按服务类型查询
   */
  getByService(service) {
    return this.serviceIndex.get(service) || [];
  }

  /**
   * 组合查询：按提供商+服务类型
   */
  getByProviderAndService(provider, service) {
    const byProvider = this.getByProvider(provider);
    if (!service) return byProvider;
    return byProvider.filter(v => v.service === service);
  }

  /**
   * 查询全部
   */
  getAll() {
    return Array.from(this.store.values());
  }

  /**
   * 按标签过滤
   * 策略：<threshold时直接过滤，>=threshold时用倒排索引
   */
  getByTags(tags, matchAll = false) {
    if (!Array.isArray(tags) || tags.length === 0) {
      return this.getAll();
    }

    // 小数据量直接过滤（简单高效）
    if (this.store.size < this.tagIndexThreshold || !this.tagIndex) {
      return this.getAll().filter(voice => {
        if (!voice.tags) return false;
        return matchAll 
          ? tags.every(tag => voice.tags.includes(tag))
          : tags.some(tag => voice.tags.includes(tag));
      });
    }

    // 大数据量用倒排索引
    const resultIds = new Set();
    
    if (matchAll) {
      // 所有标签都必须匹配（交集）
      let first = true;
      for (const tag of tags) {
        const ids = this.tagIndex.get(tag);
        if (!ids) return []; // 任一标签无结果，整体无结果
        
        if (first) {
          ids.forEach(id => resultIds.add(id));
          first = false;
        } else {
          // 取交集
          for (const id of Array.from(resultIds)) {
            if (!ids.has(id)) resultIds.delete(id);
          }
        }
      }
    } else {
      // 任一标签匹配（并集）
      for (const tag of tags) {
        this.tagIndex.get(tag)?.forEach(id => resultIds.add(id));
      }
    }

    return Array.from(resultIds)
      .map(id => this.store.get(id))
      .filter(v => v !== undefined);
  }

  /**
   * 搜索（支持名称、描述、标签模糊匹配）
   */
  search(keyword, options = {}) {
    const { 
      provider = null,
      tags = null,
      limit = 50 
    } = options;
    
    const lower = keyword.toLowerCase();
    let results = this.getAll();

    // 先按提供商过滤（如果指定）
    if (provider) {
      results = results.filter(v => v.provider === provider);
    }

    // 再按标签过滤（如果指定）
    if (tags && tags.length > 0) {
      results = results.filter(v => 
        tags.some(tag => v.tags?.includes(tag))
      );
    }

    // 模糊匹配
    results = results.filter(voice => 
      voice.displayName?.toLowerCase().includes(lower) ||
      voice.name?.toLowerCase().includes(lower) ||
      voice.description?.toLowerCase().includes(lower) ||
      voice.id?.toLowerCase().includes(lower) ||
      voice.tags?.some(t => t.toLowerCase().includes(lower))
    );

    return results.slice(0, limit);
  }

  /**
   * 获取所有标签统计
   */
  getTagStats() {
    const stats = {};
    
    for (const voice of this.store.values()) {
      for (const tag of voice.tags || []) {
        stats[tag] = (stats[tag] || 0) + 1;
      }
    }
    
    return stats;
  }

  /**
   * 获取提供商统计
   */
  getProviderStats() {
    const stats = {};
    
    for (const [provider, voices] of this.providerIndex) {
      stats[provider] = {
        count: voices.length,
        services: [...new Set(voices.map(v => v.service))],
        genders: {
          female: voices.filter(v => v.gender === 'female').length,
          male: voices.filter(v => v.gender === 'male').length
        }
      };
    }
    
    return stats;
  }

  /**
   * 健康检查
   */
  getHealth() {
    return {
      status: this.isReady ? 'healthy' : this.isLoading ? 'loading' : 'unhealthy',
      isReady: this.isReady,
      isLoading: this.isLoading,
      voices: this.store.size,
      providers: Array.from(this.providerIndex.keys()),
      tags: this.tagIndex?.size || 0,
      lastLoadTime: this.lastLoadTime,
      lastError: this.lastError ? this.lastError.message : null,
      stats: { ...this.stats }
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalVoices: this.store.size,
      totalProviders: this.providerIndex.size,
      totalTags: this.tagIndex?.size || 0,
      isLoaded: this.isReady,
      lastUpdated: this.lastLoadTime,
      configPath: this.configPath
    };
  }

  /**
   * 强制刷新
   */
  async reload() {
    console.log('[VoiceManager] Force reload...');
    return this.load(true);
  }

  /**
   * 等待就绪（事件驱动，无轮询）
   */
  waitForReady(timeout = 10000) {
    // 已就绪直接返回
    if (this.isReady) {
      return Promise.resolve(true);
    }

    // 使用事件监听替代轮询
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve(this.isReady); // 超时返回当前状态
      }, timeout);

      const onReady = () => {
        cleanup();
        resolve(true);
      };

      const onFailed = () => {
        cleanup();
        resolve(this.isReady); // 加载失败返回当前状态
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.off('loaded', onReady);
        this.off('loadFailed', onFailed);
      };

      // 双重检查：防止在绑定监听器期间状态改变
      if (this.isReady) {
        cleanup();
        resolve(true);
        return;
      }

      this.once('loaded', onReady);
      this.once('loadFailed', onFailed);
    });
  }
}

// 创建单例实例
const voiceManager = new VoiceManager();

module.exports = {
  VoiceManager,
  voiceManager
};
