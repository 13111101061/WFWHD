/**
 * VoiceRegistry - 音色注册中心
 *
 * 架构：
 * ┌─────────────────────────────────────────┐
 * │           VoiceRegistry                 │
 * │  ┌─────────────┐  ┌─────────────┐       │
 * │  │ 内存索引     │  │ 持久化后端   │       │
 * │  │ Map<id,V>   │  │ Redis/File  │       │
 * │  └─────────────┘  └─────────────┘       │
 * │         ↓                ↓              │
 * │    查询API          持久化API            │
 * └─────────────────────────────────────────┘
 */

const fs = require('fs').promises;
const path = require('path');

class VoiceRegistry {
  /**
   * @param {Object} options
   * @param {string} [options.configPath] - 配置文件路径
   * @param {Object} [options.redis] - Redis配置 { host, port }
   */
  constructor(options = {}) {
    this.configPath = options.configPath || path.join(__dirname, '../../../../voices/dist/voices.json');

    // Redis配置
    this.redisConfig = options.redis || null;
    this.redisClient = null;
    this.redisPrefix = 'voice:';

    // 索引（内存，O(1)查询）
    this.voices = new Map();
    this.providerIndex = new Map();
    this.serviceIndex = new Map();

    // 服务商状态
    this.providerStatus = new Map();  // provider -> { enabled, service }

    // 状态
    this.isReady = false;
    this.lastUpdated = null;
  }

  // ==================== 初始化 ====================

  /**
   * 初始化
   */
  async initialize() {
    if (this.isReady) return true;

    // 1. 尝试连接Redis
    if (this.redisConfig) {
      const connected = await this._connectRedis();
      if (connected) {
        // 尝试从Redis加载
        await this._loadFromRedis();

        // 如果Redis是空的，从文件导入
        if (this.voices.size === 0) {
          console.log('[VoiceRegistry] Redis empty, importing from file...');
          await this._loadFromFile();
          await this._saveToRedis();
          console.log(`[VoiceRegistry] Imported ${this.voices.size} voices to Redis`);
        }

        this.isReady = true;
        console.log(`[VoiceRegistry] ✅ Loaded ${this.voices.size} voices from Redis`);
        return true;
      }
    }

    // 2. 从文件加载
    await this._loadFromFile();
    this.isReady = true;
    console.log(`[VoiceRegistry] ✅ Loaded ${this.voices.size} voices from file`);
    return true;
  }

  // ==================== 查询（核心，O(1)） ====================

  get(id) {
    return this.voices.get(id);
  }

  getByProvider(provider) {
    const ids = this.providerIndex.get(provider);
    if (!ids) return [];
    return Array.from(ids).map(id => this.voices.get(id)).filter(Boolean);
  }

  getByProviderAndService(provider, service) {
    const key = `${provider}_${service}`;
    const ids = this.serviceIndex.get(key);
    if (!ids) return [];
    return Array.from(ids).map(id => this.voices.get(id)).filter(Boolean);
  }

  getAll() {
    return Array.from(this.voices.values());
  }

  // ==================== 运行时管理 ====================

  add(voice) {
    if (!voice.id || !voice.provider) {
      throw new Error('Voice must have id and provider');
    }

    this.voices.set(voice.id, voice);
    this._updateIndexes(voice);
    this.lastUpdated = new Date();

    return voice;
  }

  addBatch(voices) {
    const added = [];
    const errors = [];

    for (const voice of voices) {
      try {
        this.add(voice);
        added.push(voice.id);
      } catch (e) {
        errors.push({ voice, error: e.message });
      }
    }

    return { added, errors, count: added.length };
  }

  update(id, updates) {
    const existing = this.voices.get(id);
    if (!existing) {
      throw new Error(`Voice not found: ${id}`);
    }

    const updated = { ...existing, ...updates, id };
    this.voices.set(id, updated);
    this.lastUpdated = new Date();

    return updated;
  }

  remove(id) {
    const voice = this.voices.get(id);
    if (!voice) return false;

    this.voices.delete(id);
    this._removeFromIndexes(voice);
    this.lastUpdated = new Date();

    return true;
  }

  clear() {
    this.voices.clear();
    this.providerIndex.clear();
    this.serviceIndex.clear();
    this.lastUpdated = new Date();
  }

  // ==================== 持久化 ====================

  /**
   * 保存（自动选择Redis或文件）
   */
  async save() {
    if (this.redisClient) {
      await this._saveToRedis();
      console.log(`[VoiceRegistry] Saved ${this.voices.size} voices to Redis`);
    } else {
      await this._saveToFile();
      console.log(`[VoiceRegistry] Saved ${this.voices.size} voices to file`);
    }
  }

  /**
   * 重新加载
   */
  async reload() {
    if (this.redisClient) {
      await this._loadFromRedis();
    } else {
      await this._loadFromFile();
    }
    this.lastUpdated = new Date();
    console.log(`[VoiceRegistry] Reloaded ${this.voices.size} voices`);
  }

  // ==================== 统计 ====================

  getStats() {
    const providers = {};
    for (const [provider, ids] of this.providerIndex) {
      const status = this.providerStatus.get(provider);
      providers[provider] = {
        count: ids.size,
        enabled: status?.enabled !== false
      };
    }

    return {
      total: this.voices.size,
      providers,
      services: this.serviceIndex.size,
      isReady: this.isReady,
      lastUpdated: this.lastUpdated,
      storage: this.redisClient ? 'redis' : 'file'
    };
  }

  /**
   * 检查服务商是否启用
   */
  isProviderEnabled(provider) {
    const status = this.providerStatus.get(provider);
    return status?.enabled !== false;
  }

  /**
   * 获取所有启用的服务商
   */
  getEnabledProviders() {
    return Array.from(this.providerStatus.entries())
      .filter(([_, status]) => status.enabled !== false)
      .map(([provider, _]) => provider);
  }

  /**
   * 获取所有禁用的服务商
   */
  getDisabledProviders() {
    return Array.from(this.providerStatus.entries())
      .filter(([_, status]) => status.enabled === false)
      .map(([provider, status]) => ({ provider, ...status }));
  }

  // ==================== 私有方法 ====================

  _updateIndexes(voice) {
    // 提供商索引
    if (!this.providerIndex.has(voice.provider)) {
      this.providerIndex.set(voice.provider, new Set());
    }
    this.providerIndex.get(voice.provider).add(voice.id);

    // 服务索引
    if (voice.service) {
      const key = `${voice.provider}_${voice.service}`;
      if (!this.serviceIndex.has(key)) {
        this.serviceIndex.set(key, new Set());
      }
      this.serviceIndex.get(key).add(voice.id);
    }
  }

  _removeFromIndexes(voice) {
    // 从提供商索引删除
    const providerIds = this.providerIndex.get(voice.provider);
    if (providerIds) {
      providerIds.delete(voice.id);
      if (providerIds.size === 0) {
        this.providerIndex.delete(voice.provider);
      }
    }

    // 从服务索引删除
    if (voice.service) {
      const key = `${voice.provider}_${voice.service}`;
      const serviceIds = this.serviceIndex.get(key);
      if (serviceIds) {
        serviceIds.delete(voice.id);
        if (serviceIds.size === 0) {
          this.serviceIndex.delete(key);
        }
      }
    }
  }

  _buildIndex(voices, meta = {}) {
    this.voices.clear();
    this.providerIndex.clear();
    this.serviceIndex.clear();
    this.providerStatus.clear();

    // 从meta中读取服务商状态
    if (meta.providers) {
      for (const provider of meta.providers.enabled || []) {
        this.providerStatus.set(provider, { enabled: true });
      }
      for (const item of meta.providers.disabled || []) {
        const provider = typeof item === 'string' ? item : item.provider;
        this.providerStatus.set(provider, { enabled: false });
      }
    }

    // 从sources中读取状态（备用）
    if (meta.sources) {
      for (const source of meta.sources) {
        if (source.provider && !this.providerStatus.has(source.provider)) {
          this.providerStatus.set(source.provider, { enabled: source.enabled !== false });
        }
      }
    }

    for (const voice of voices) {
      if (!voice.id || !voice.provider) continue;
      this.voices.set(voice.id, voice);
      this._updateIndexes(voice);
    }
  }

  // ==================== Redis操作 ====================

  async _connectRedis() {
    try {
      const { createClient } = require('redis');
      const host = this.redisConfig.host || '127.0.0.1';
      const port = this.redisConfig.port || 6379;

      this.redisClient = createClient({
        url: `redis://${host}:${port}`
      });

      this.redisClient.on('error', (err) => {
        console.error('[VoiceRegistry] Redis error:', err.message);
      });

      await this.redisClient.connect();
      console.log(`[VoiceRegistry] Redis connected: ${host}:${port}`);
      return true;

    } catch (e) {
      console.warn('[VoiceRegistry] Redis connection failed:', e.message);
      this.redisClient = null;
      return false;
    }
  }

  async _loadFromRedis() {
    try {
      // 使用KEYS命令获取所有voice keys（简单直接）
      const keys = await this.redisClient.keys(this.redisPrefix + '*');

      // 批量获取
      const voices = [];
      for (const key of keys) {
        const data = await this.redisClient.get(key);
        if (data) {
          voices.push(JSON.parse(data));
        }
      }

      this._buildIndex(voices);

    } catch (e) {
      console.error('[VoiceRegistry] Load from Redis failed:', e.message);
      throw e;
    }
  }

  async _saveToRedis() {
    try {
      // 先清空旧数据
      const keys = await this.redisClient.keys(this.redisPrefix + '*');
      if (keys.length > 0) {
        await this.redisClient.del(keys);
      }

      // 写入新数据
      for (const [id, voice] of this.voices) {
        await this.redisClient.set(
          this.redisPrefix + id,
          JSON.stringify(voice)
        );
      }

    } catch (e) {
      console.error('[VoiceRegistry] Save to Redis failed:', e.message);
      throw e;
    }
  }

  // ==================== 文件操作 ====================

  async _loadFromFile() {
    try {
      const raw = await fs.readFile(this.configPath, 'utf8');
      const data = JSON.parse(raw);
      this._buildIndex(data.voices || [], data._meta || {});
    } catch (e) {
      console.warn('[VoiceRegistry] Load from file failed:', e.message);
      this._buildIndex([]);
    }
  }

  async _saveToFile() {
    const data = {
      _meta: {
        version: '3.0',
        savedAt: new Date().toISOString(),
        totalVoices: this.voices.size
      },
      voices: this.getAll()
    };

    await fs.writeFile(this.configPath, JSON.stringify(data, null, 2));
  }

  // ==================== 关闭 ====================

  async close() {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.redisClient = null;
      console.log('[VoiceRegistry] Redis connection closed');
    }
  }
}

// 默认实例：自动检测Redis配置
const defaultRedisConfig = process.env.REDIS_HOST ? {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379')
} : null;

const voiceRegistry = new VoiceRegistry({
  redis: defaultRedisConfig
});

module.exports = {
  VoiceRegistry,
  voiceRegistry
};