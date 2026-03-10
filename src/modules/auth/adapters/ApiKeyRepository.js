/**
 * ApiKeyRepository - API密钥仓储实现
 * 适配器：实现 IApiKeyRepository 接口
 * 默认使用内存存储，可扩展为Redis/数据库
 */

const IApiKeyRepository = require('../ports/IApiKeyRepository');
const crypto = require('crypto');

class ApiKeyRepository extends IApiKeyRepository {
  constructor() {
    super();
    this.keys = new Map();
  }

  /**
   * 初始化默认密钥
   * @param {string[]} defaultKeys - 预配置的API密钥
   */
  initializeDefaultKeys(defaultKeys = []) {
    // 从环境变量或参数加载预配置的密钥
    const keys = defaultKeys.length > 0
      ? defaultKeys
      : (process.env.API_KEYS?.split(',') || []);

    keys.forEach(key => {
      if (key && key.trim()) {
        this.registerKey(key.trim(), {
          type: 'static',
          services: ['*'],
          permissions: ['full'],
          description: 'Default admin key',
          createdAt: new Date()
        });
      }
    });

    console.log(`[ApiKeyRepository] Loaded ${keys.length} API keys`);
    return this;
  }

  async verifyKey(apiKey, service = null) {
    const keyInfo = this.keys.get(apiKey);

    if (!keyInfo) {
      return {
        valid: false,
        error: 'Invalid API key',
        code: 'KEY_NOT_FOUND'
      };
    }

    if (keyInfo.status !== 'active') {
      return {
        valid: false,
        error: 'API key is disabled',
        code: 'KEY_DISABLED'
      };
    }

    if (keyInfo.expiresAt && new Date() > keyInfo.expiresAt) {
      return {
        valid: false,
        error: 'API key expired',
        code: 'KEY_EXPIRED'
      };
    }

    if (service && !this._hasServicePermission(keyInfo.services, service)) {
      return {
        valid: false,
        error: `Access denied to service: ${service}`,
        code: 'SERVICE_DENIED'
      };
    }

    // 更新使用统计
    keyInfo.lastUsedAt = new Date();
    keyInfo.usageCount++;

    return {
      valid: true,
      keyInfo: {
        id: keyInfo.id,
        type: keyInfo.type,
        permissions: keyInfo.permissions,
        services: keyInfo.services,
        description: keyInfo.description
      }
    };
  }

  generateKey(options = {}) {
    const {
      prefix = 'sk',
      services = ['*'],
      permissions = ['read'],
      description = '',
      expiresIn = null
    } = options;

    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(16).toString('hex');
    const key = `${prefix}_${timestamp}_${random}`;

    const keyInfo = {
      type: 'dynamic',
      services,
      permissions,
      description,
      createdAt: new Date(),
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn) : null,
      lastUsedAt: null,
      usageCount: 0
    };

    this.registerKey(key, keyInfo);
    return { key, keyInfo };
  }

  registerKey(key, metadata) {
    this.keys.set(key, {
      ...metadata,
      id: this._hashKey(key),
      status: 'active'
    });
  }

  revokeKey(apiKey, reason = 'Manual revocation') {
    const keyInfo = this.keys.get(apiKey);
    if (keyInfo) {
      keyInfo.status = 'revoked';
      keyInfo.revokedAt = new Date();
      keyInfo.revocationReason = reason;
      return true;
    }
    return false;
  }

  getAllKeys() {
    const result = [];
    for (const [apiKey, keyInfo] of this.keys) {
      result.push({
        key: apiKey.substring(0, 12) + '...',
        id: keyInfo.id,
        type: keyInfo.type,
        services: keyInfo.services,
        permissions: keyInfo.permissions,
        description: keyInfo.description,
        status: keyInfo.status,
        createdAt: keyInfo.createdAt,
        lastUsedAt: keyInfo.lastUsedAt,
        usageCount: keyInfo.usageCount
      });
    }
    return result;
  }

  getStats() {
    const stats = {
      totalKeys: this.keys.size,
      activeKeys: 0,
      expiredKeys: 0,
      disabledKeys: 0,
      totalUsage: 0
    };

    for (const [, info] of this.keys) {
      switch (info.status) {
        case 'active':
          stats.activeKeys++;
          break;
        case 'disabled':
        case 'revoked':
          stats.disabledKeys++;
          break;
      }

      if (info.expiresAt && new Date() > info.expiresAt) {
        stats.expiredKeys++;
      }

      stats.totalUsage += info.usageCount || 0;
    }

    return stats;
  }

  _hasServicePermission(allowedServices, requestedService) {
    return allowedServices.includes('*') ||
           allowedServices.includes(requestedService) ||
           allowedServices.some(service => {
             const regex = new RegExp('^' + service.replace('*', '.*') + '$');
             return regex.test(requestedService);
           });
  }

  _hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
  }
}

module.exports = ApiKeyRepository;