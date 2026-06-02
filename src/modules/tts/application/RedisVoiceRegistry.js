/**
 * RedisVoiceRegistry — 用户库 Redis 持久化注册中心
 *
 * 架构：
 *   L1 Memory (Map) ←── 同步读写，O(1)，VoiceResolver 零延迟
 *   L2 Redis (Hash) ←── 异步持久化，HSET/HDEL
 *   Pub/Sub          ←── 多实例广播，收到变更 → 更新 L1
 *
 * Duck Typing 兼容 VoiceRegistry（接口一致，底层全换）。
 * 只服务于用户库（readOnly=false）。
 */

const { EventEmitter } = require('events');
const VoiceNormalizer = require('./VoiceNormalizer');

function buildIndex(registry) {
  registry.providerIndex.clear();
  registry.serviceIndex.clear();
  registry.voiceCodeIndex.clear();
  registry.categoryIndex.clear();
  registry.providerStatus.clear();

  for (const [id, voice] of registry.voices) {
    const identity = voice.identity || {};
    const profile = voice.profile || {};
    const provider = identity.provider;
    const service = identity.service;
    const voiceCode = identity.voiceCode;
    const categories = profile.categories || [];

    if (provider) {
      if (!registry.providerIndex.has(provider)) {
        registry.providerIndex.set(provider, new Set());
      }
      registry.providerIndex.get(provider).add(id);
    }
    if (provider && service) {
      const key = `${provider}_${service}`;
      if (!registry.serviceIndex.has(key)) {
        registry.serviceIndex.set(key, new Set());
      }
      registry.serviceIndex.get(key).add(id);
    }
    if (voiceCode) {
      registry.voiceCodeIndex.set(voiceCode, id);
    }
    for (const cat of categories) {
      if (!registry.categoryIndex.has(cat)) {
        registry.categoryIndex.set(cat, new Set());
      }
      registry.categoryIndex.get(cat).add(id);
    }
  }
}

class RedisVoiceRegistry extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.redis - ioredis 主连接
   * @param {Object} options.sub - ioredis 订阅连接
   * @param {string} [options.hashKey='tts:voices:user']
   * @param {string} [options.channel='tts:voices:channel']
   * @param {string} [options.seedPath] - 开发兜底 seed 文件路径
   */
  constructor(options = {}) {
    super();
    this.redis = options.redis || null;
    this.sub = options.sub || null;
    this.hashKey = options.hashKey || 'tts:voices:user';
    this.channel = options.channel || 'tts:voices:channel';
    this.seedPath = options.seedPath || null;

    this.readOnly = false;
    this.isReady = false;
    this.lastUpdated = null;

    // L1 内存索引
    this.voices = new Map();
    this.providerIndex = new Map();
    this.serviceIndex = new Map();
    this.voiceCodeIndex = new Map();
    this.categoryIndex = new Map();
    this.providerStatus = new Map();

    this._subscribed = false;
  }

  // ==================== 初始化 ====================

  async initialize() {
    if (this.isReady) return true;

    if (this.redis) {
      await this._loadFromRedis();
    }

    // Dev 兜底：Redis 空 → seed 文件灌入
    if (this.voices.size === 0 && this.seedPath) {
      await this._loadSeedData();
    }

    // Pub/Sub
    if (this.sub && this.redis) {
      await this._setupPubSub();
    }

    this.isReady = true;
    console.log(`[RedisVoiceRegistry] Ready — ${this.voices.size} voices in L1${this.redis ? ', L2: Redis' : ', L2: NONE'}`);
    return true;
  }

  // ==================== 查询 (O(1) L1 内存) ====================

  get(id) {
    return this.voices.get(id) || null;
  }

  getByVoiceCode(voiceCode) {
    const id = this.voiceCodeIndex.get(voiceCode);
    return id ? this.voices.get(id) || null : null;
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

  getByCategory(category) {
    const ids = this.categoryIndex.get(category);
    if (!ids) return [];
    return Array.from(ids).map(id => this.voices.get(id)).filter(Boolean);
  }

  getCategories() {
    return Array.from(this.categoryIndex.keys()).sort();
  }

  // ==================== 写入 ====================

  async addStored(storedVoice) {
    this._validateStoredVoice(storedVoice);

    const id = storedVoice.identity.id;
    this.voices.set(id, storedVoice);
    this._updateIndexes(storedVoice);
    this.lastUpdated = new Date();

    this.emit('voice:added', id, storedVoice);

    // L2 Redis + Pub/Sub
    if (this.redis) {
      await this._redisSet(id, storedVoice);
      await this._publish('add', id, storedVoice);
    }

    return storedVoice;
  }

  async addStoredBatch(storedVoices) {
    const added = [];
    const errors = [];

    for (const stored of storedVoices) {
      try {
        await this.addStored(stored);
        added.push(stored.identity.id);
      } catch (e) {
        errors.push({ id: stored?.identity?.id || 'unknown', error: e.message });
      }
    }

    return { added, errors, count: added.length };
  }

  async update(id, updates) {
    const existing = this.voices.get(id);
    if (!existing) throw new Error(`Voice not found: ${id}`);

    const previous = { ...existing };
    this._removeFromIndexes(existing);

    const { id: _idUpd, provider: _provUpd, service: _svcUpd, sourceId: _srcUpd, ...identityUpdates } = updates.identity || {};
    const updated = {
      ...existing,
      identity: { ...existing.identity, ...identityUpdates, id, provider: existing.identity.provider, service: existing.identity.service },
      profile: { ...existing.profile, ...(updates.profile || {}) },
      runtime: { ...existing.runtime, ...(updates.runtime || {}) },
      meta: { ...existing.meta, updatedAt: new Date().toISOString(), ...(updates.meta || {}) }
    };

    this.voices.set(id, updated);
    this._updateIndexes(updated);
    this.lastUpdated = new Date();

    this.emit('voice:updated', id, updated, previous);

    if (this.redis) {
      await this._redisSet(id, updated);
      await this._publish('update', id, updated);
    }

    return updated;
  }

  async remove(id) {
    const voice = this.voices.get(id);
    if (!voice) return false;

    this.voices.delete(id);
    this._removeFromIndexes(voice);
    this.lastUpdated = new Date();

    this.emit('voice:removed', id);

    if (this.redis) {
      await this._redisDel(id);
      await this._publish('remove', id, null);
    }

    return true;
  }

  async clear() {
    this.voices.clear();
    this.providerIndex.clear();
    this.serviceIndex.clear();
    this.voiceCodeIndex.clear();
    this.categoryIndex.clear();
    this.lastUpdated = new Date();

    if (this.redis) {
      await this.redis.del(this.hashKey);
      await this._publish('clear', null, null);
    }
  }

  // ==================== 持久化 ====================

  async save() {
    // L2 写已在每次变更时实时完成，save() 只是兼容接口
    return;
  }

  async flush() {
    return this.save();
  }

  async reload() {
    if (this.redis) {
      await this._loadFromRedis();
    }
    this.lastUpdated = new Date();
    this.emit('voices:reloaded', this.voices.size);
  }

  // ==================== 统计 & 辅助 ====================

  getStats() {
    return {
      total: this.voices.size,
      providers: Object.fromEntries(
        Array.from(this.providerIndex, ([p, ids]) => [p, { count: ids.size, enabled: this.isProviderEnabled(p) !== false }])
      ),
      services: this.serviceIndex.size,
      isReady: this.isReady,
      storage: this.redis ? 'redis' : 'memory'
    };
  }

  isProviderEnabled(provider) {
    const status = this.providerStatus.get(provider);
    return status?.enabled !== false;
  }

  getEnabledProviders() {
    return Array.from(this.providerStatus.entries())
      .filter(([_, s]) => s.enabled !== false)
      .map(([p]) => p);
  }

  getDisabledProviders() {
    return Array.from(this.providerStatus.entries())
      .filter(([_, s]) => s.enabled === false)
      .map(([p, s]) => ({ provider: p, ...s }));
  }

  hasVoiceCode(voiceCode) {
    return this.voiceCodeIndex.has(voiceCode);
  }

  getNextVoiceNumber(providerKey) {
    const VoiceCodeGenerator = require('../config/VoiceCodeGenerator');
    const providerCode = VoiceCodeGenerator.getProviderCode(providerKey);
    if (!providerCode) return 1;

    let maxNumber = 0;
    for (const [voiceCode] of this.voiceCodeIndex) {
      if (voiceCode.substring(0, 3) === providerCode) {
        const parsed = VoiceCodeGenerator.parse(voiceCode);
        if (parsed && parsed.voiceNumber > maxNumber) maxNumber = parsed.voiceNumber;
      }
    }
    const next = maxNumber + 1;
    if (next > 9999) throw new Error(`[RedisVoiceRegistry] provider "${providerKey}" voiceNumber 溢出`);
    return next;
  }

  getSyncStatus() {
    return {
      inMemory: { count: this.voices.size, lastUpdated: this.lastUpdated?.toISOString() || null, dirty: false, savePending: false },
      storage: this.redis ? 'redis' : 'memory'
    };
  }

  // ==================== 验证 ====================

  _validateStoredVoice(voice) {
    const StoredVoiceSchema = require('../schema/StoredVoiceSchema');
    const result = StoredVoiceSchema.validate(voice);
    if (!result.valid) throw new Error('VoiceRegistry: voice must be a valid StoredVoice. ' + result.errors.join('; '));
  }

  // ==================== 索引 ====================

  _updateIndexes(voice) {
    const id = voice.identity?.id || voice.id;
    const provider = voice.identity?.provider || voice.provider;
    const service = voice.identity?.service || voice.service;
    const voiceCode = voice.identity?.voiceCode;
    const categories = voice.profile?.categories || [];

    if (!id || !provider) return;

    if (!this.providerIndex.has(provider)) this.providerIndex.set(provider, new Set());
    this.providerIndex.get(provider).add(id);

    if (service) {
      const key = `${provider}_${service}`;
      if (!this.serviceIndex.has(key)) this.serviceIndex.set(key, new Set());
      this.serviceIndex.get(key).add(id);
    }

    if (voiceCode) this.voiceCodeIndex.set(voiceCode, id);

    for (const cat of categories) {
      if (!this.categoryIndex.has(cat)) this.categoryIndex.set(cat, new Set());
      this.categoryIndex.get(cat).add(id);
    }
  }

  _removeFromIndexes(voice) {
    const id = voice.identity?.id || voice.id;
    const provider = voice.identity?.provider || voice.provider;
    const service = voice.identity?.service || voice.service;
    const voiceCode = voice.identity?.voiceCode;
    const categories = voice.profile?.categories || [];

    if (!id || !provider) return;

    const pIds = this.providerIndex.get(provider);
    if (pIds) { pIds.delete(id); if (pIds.size === 0) this.providerIndex.delete(provider); }

    if (service) {
      const key = `${provider}_${service}`;
      const sIds = this.serviceIndex.get(key);
      if (sIds) { sIds.delete(id); if (sIds.size === 0) this.serviceIndex.delete(key); }
    }

    if (voiceCode) this.voiceCodeIndex.delete(voiceCode);

    for (const cat of categories) {
      const cIds = this.categoryIndex.get(cat);
      if (cIds) { cIds.delete(id); if (cIds.size === 0) this.categoryIndex.delete(cat); }
    }
  }

  // ==================== Redis L2 操作 ====================

  async _redisSet(id, voice) {
    try {
      await this.redis.hset(this.hashKey, id, JSON.stringify(voice));
    } catch (e) {
      console.error('[RedisVoiceRegistry] HSET failed:', e.message);
    }
  }

  async _redisDel(id) {
    try {
      await this.redis.hdel(this.hashKey, id);
    } catch (e) {
      console.error('[RedisVoiceRegistry] HDEL failed:', e.message);
    }
  }

  async _loadFromRedis() {
    try {
      const all = await this.redis.hgetall(this.hashKey);
      if (!all) return;

      this.voices.clear();
      for (const [id, json] of Object.entries(all)) {
        try {
          const voice = JSON.parse(json);
          this.voices.set(id, voice);
        } catch (e) {
          console.warn(`[RedisVoiceRegistry] Skip corrupt voice "${id}":`, e.message);
        }
      }
      buildIndex(this);
    } catch (e) {
      console.error('[RedisVoiceRegistry] HGETALL failed:', e.message);
    }
  }

  async _loadSeedData() {
    const fs = require('fs');
    try {
      const raw = fs.readFileSync(this.seedPath, 'utf8');
      const data = JSON.parse(raw);
      const voices = data.voices || [];

      // 灌入 L1 + L2
      for (const entry of voices) {
        const normalized = VoiceNormalizer.normalize(entry);
        if (!normalized) continue;
        this.voices.set(normalized.identity.id, normalized);
        if (this.redis) {
          await this._redisSet(normalized.identity.id, normalized);
        }
      }
      buildIndex(this);
      console.log(`[RedisVoiceRegistry] Seeded ${voices.length} voices from ${this.seedPath}`);
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn('[RedisVoiceRegistry] Seed load failed:', e.message);
    }
  }

  // ==================== Pub/Sub ====================

  async _setupPubSub() {
    if (this._subscribed) return;
    await this.sub.subscribe(this.channel);
    this._subscribed = true;

    this.sub.on('message', (channel, message) => {
      if (channel !== this.channel) return;
      try {
        const { action, id, data } = JSON.parse(message);
        if (action === 'add' || action === 'update') {
          if (data) {
            const voice = typeof data === 'string' ? JSON.parse(data) : data;
            this.voices.set(id, voice);
            buildIndex(this);
          }
        } else if (action === 'remove') {
          const voice = this.voices.get(id);
          if (voice) {
            this._removeFromIndexes(voice);
            this.voices.delete(id);
          }
        } else if (action === 'clear') {
          this.voices.clear();
          this.providerIndex.clear();
          this.serviceIndex.clear();
          this.voiceCodeIndex.clear();
          this.categoryIndex.clear();
        }
      } catch (e) {
        console.warn('[RedisVoiceRegistry] Pub/Sub message parse failed:', e.message);
      }
    });
  }

  async _publish(action, id, voice) {
    try {
      await this.redis.publish(this.channel, JSON.stringify({
        action,
        id,
        data: voice ? JSON.stringify(voice) : null
      }));
    } catch (e) {
      console.error('[RedisVoiceRegistry] PUBLISH failed:', e.message);
    }
  }

  // ==================== 关闭 ====================

  async close() {
    if (this.sub && this._subscribed) {
      await this.sub.unsubscribe(this.channel);
      this._subscribed = false;
    }
  }
}

module.exports = { RedisVoiceRegistry };
