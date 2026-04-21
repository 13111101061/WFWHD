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
const VoiceNormalizer = require('../application/VoiceNormalizer');

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
    const raw = this.voices.get(id);
    if (!raw) return null;

    // 兼容层：自动转换旧格式
    return VoiceNormalizer.fromLegacy(raw);
  }

  getByProvider(provider) {
    const ids = this.providerIndex.get(provider);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.voices.get(id))
      .filter(Boolean)
      .map(voice => VoiceNormalizer.fromLegacy(voice));
  }

  getByProviderAndService(provider, service) {
    const key = `${provider}_${service}`;
    const ids = this.serviceIndex.get(key);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.voices.get(id))
      .filter(Boolean)
      .map(voice => VoiceNormalizer.fromLegacy(voice));
  }

  getAll() {
    return Array.from(this.voices.values())
      .map(voice => VoiceNormalizer.fromLegacy(voice));
  }

  // ==================== 写入（严格类型） ====================

  /**
   * 添加已标准化的 StoredVoice
   * 只接受 StoredVoice 结构，拒绝其他格式
   *
   * @param {Object} storedVoice - 必须是 StoredVoice 结构 (identity/profile/runtime/meta)
   * @returns {Object} 存储的音色对象
   * @throws {Error} 如果不是有效的 StoredVoice 结构
   */
  addStored(storedVoice) {
    this._validateStoredVoice(storedVoice);

    const id = storedVoice.identity.id;
    this.voices.set(id, storedVoice);
    this._updateIndexes(storedVoice);
    this.lastUpdated = new Date();

    return storedVoice;
  }

  /**
   * 批量添加已标准化的 StoredVoice
   * @param {Array} storedVoices - StoredVoice 数组
   * @returns {Object} { added, errors, count }
   */
  addStoredBatch(storedVoices) {
    const added = [];
    const errors = [];

    for (const stored of storedVoices) {
      try {
        this.addStored(stored);
        added.push(stored.identity.id);
      } catch (e) {
        errors.push({ id: stored?.identity?.id || 'unknown', error: e.message });
      }
    }

    return { added, errors, count: added.length };
  }

  /**
   * 迁移入口：添加遗留格式音色（仅用于历史数据迁移）
   * 内部调用 VoiceNormalizer.fromLegacy() 转换
   *
   * @param {Object} legacyVoice - 旧格式音色对象
   * @returns {Object} 转换后的 StoredVoice
   */
  addLegacyForMigration(legacyVoice) {
    const stored = VoiceNormalizer.fromLegacy(legacyVoice);
    return this.addStored(stored);
  }

  /**
   * 批量迁移遗留格式
   * @param {Array} legacyVoices - 旧格式音色数组
   * @returns {Object} { added, errors, count }
   */
  addLegacyBatchForMigration(legacyVoices) {
    const added = [];
    const errors = [];

    for (const legacy of legacyVoices) {
      try {
        const stored = VoiceNormalizer.fromLegacy(legacy);
        this.addStored(stored);
        added.push(stored.identity.id);
      } catch (e) {
        errors.push({ id: legacy?.id || 'unknown', error: e.message });
      }
    }

    return { added, errors, count: added.length };
  }

  /**
   * 校验是否为有效的 StoredVoice 结构
   * @private
   */
  _validateStoredVoice(voice) {
    if (!voice || typeof voice !== 'object') {
      throw new Error('VoiceRegistry: voice must be an object');
    }

    if (!voice.identity || !voice.profile || !voice.runtime) {
      throw new Error(
        'VoiceRegistry: voice must be StoredVoice structure with identity/profile/runtime layers. ' +
        'Use VoiceWriteService for form submission or addLegacyForMigration() for legacy data.'
      );
    }

    if (!voice.identity.id) {
      throw new Error('VoiceRegistry: voice.identity.id is required');
    }

    if (!voice.identity.provider) {
      throw new Error('VoiceRegistry: voice.identity.provider is required');
    }
  }

  // ==================== 向后兼容（废弃） ====================

  /**
   * @deprecated Use addStored() instead
   * 保留向后兼容，但会严格校验
   */
  add(voice) {
    // 如果是新格式，调用 addStored
    if (voice.identity && voice.profile && voice.runtime) {
      return this.addStored(voice);
    }

    // 拒绝其他格式，提示正确用法
    throw new Error(
      'VoiceRegistry.add() only accepts StoredVoice structure. ' +
      'Use VoiceWriteService.create() for form submission, ' +
      'or addLegacyForMigration() for legacy data migration.'
    );
  }

  /**
   * @deprecated Use addStoredBatch() instead
   */
  addBatch(voices) {
    return this.addStoredBatch(voices);
  }

  update(id, updates) {
    const existing = this.voices.get(id);
    if (!existing) {
      throw new Error(`Voice not found: ${id}`);
    }

    // 1. 先移除旧索引
    this._removeFromIndexes(existing);

    // 2. 合并更新（支持新结构的深层合并）
    let updated;
    if (existing.identity && existing.profile && existing.runtime) {
      // 新格式：分层合并
      updated = {
        ...existing,
        identity: {
          ...existing.identity,
          ...(updates.identity || {})
        },
        profile: {
          ...existing.profile,
          ...(updates.profile || {})
        },
        runtime: {
          ...existing.runtime,
          ...(updates.runtime || {})
        },
        meta: {
          ...existing.meta,
          updatedAt: new Date().toISOString(),
          ...(updates.meta || {})
        }
      };
      // 删除嵌套更新对象，避免重复
      delete updated.identity?.id; // id 不可变
      updated.identity.id = id;
    } else {
      // 旧格式：平铺合并
      updated = { ...existing, ...updates, id };
    }

    // 3. 存储并重建索引
    this.voices.set(id, updated);
    this._updateIndexes(updated);

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
    // 统一从 identity.* 或平铺字段取值（兼容新旧格式）
    const id = voice.identity?.id || voice.id;
    const provider = voice.identity?.provider || voice.provider;
    const service = voice.identity?.service || voice.service;

    if (!id || !provider) return;

    // 提供商索引
    if (!this.providerIndex.has(provider)) {
      this.providerIndex.set(provider, new Set());
    }
    this.providerIndex.get(provider).add(id);

    // 服务索引
    if (service) {
      const key = `${provider}_${service}`;
      if (!this.serviceIndex.has(key)) {
        this.serviceIndex.set(key, new Set());
      }
      this.serviceIndex.get(key).add(id);
    }
  }

  _removeFromIndexes(voice) {
    // 统一从 identity.* 或平铺字段取值（兼容新旧格式）
    const id = voice.identity?.id || voice.id;
    const provider = voice.identity?.provider || voice.provider;
    const service = voice.identity?.service || voice.service;

    if (!id || !provider) return;

    // 从提供商索引删除
    const providerIds = this.providerIndex.get(provider);
    if (providerIds) {
      providerIds.delete(id);
      if (providerIds.size === 0) {
        this.providerIndex.delete(provider);
      }
    }

    // 从服务索引删除
    if (service) {
      const key = `${provider}_${service}`;
      const serviceIds = this.serviceIndex.get(key);
      if (serviceIds) {
        serviceIds.delete(id);
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
      // 支持新格式 (identity.id) 和旧格式 (id)
      const id = voice.identity?.id || voice.id;
      const provider = voice.identity?.provider || voice.provider;
      const service = voice.identity?.service || voice.service;

      if (!id || !provider) continue;
      this.voices.set(id, voice);
      this._updateIndexes({ id, provider, service });
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
      // 1. 加载 meta 数据
      let meta = {};
      const metaData = await this.redisClient.get(this.redisPrefix + '_meta');
      if (metaData) {
        meta = JSON.parse(metaData);
      }

      // 2. 加载 voices 数据
      const keys = await this.redisClient.keys(this.redisPrefix + '*');
      const voices = [];

      for (const key of keys) {
        // 跳过 meta key
        if (key === this.redisPrefix + '_meta') continue;

        const data = await this.redisClient.get(key);
        if (data) {
          voices.push(JSON.parse(data));
        }
      }

      // 3. 构建索引（传递 meta）
      this._buildIndex(voices, meta);

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

      // 写入 voices 数据
      for (const [id, voice] of this.voices) {
        await this.redisClient.set(
          this.redisPrefix + id,
          JSON.stringify(voice)
        );
      }

      // 写入 meta 数据（providers 状态）
      const enabledProviders = [];
      const disabledProviders = [];

      for (const [provider, status] of this.providerStatus) {
        if (status.enabled !== false) {
          enabledProviders.push(provider);
        } else {
          disabledProviders.push(provider);
        }
      }

      const meta = {
        version: '3.0',
        savedAt: new Date().toISOString(),
        totalVoices: this.voices.size,
        providers: {
          enabled: enabledProviders,
          disabled: disabledProviders
        }
      };

      await this.redisClient.set(
        this.redisPrefix + '_meta',
        JSON.stringify(meta)
      );

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
    // 构建 providers 元数据
    const enabledProviders = [];
    const disabledProviders = [];

    for (const [provider, status] of this.providerStatus) {
      if (status.enabled !== false) {
        enabledProviders.push(provider);
      } else {
        disabledProviders.push(provider);
      }
    }

    const data = {
      _meta: {
        version: '3.0',
        savedAt: new Date().toISOString(),
        totalVoices: this.voices.size,
        // 保留 providers 状态
        providers: {
          enabled: enabledProviders,
          disabled: disabledProviders
        },
        // 保留 sources 信息（基于当前索引重建）
        sources: Array.from(this.providerIndex.keys()).map(provider => ({
          provider,
          count: this.providerIndex.get(provider).size,
          enabled: this.isProviderEnabled(provider)
        }))
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