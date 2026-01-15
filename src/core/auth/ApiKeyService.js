const crypto = require('crypto');
const config = require('../../shared/config/config');

/**
 * API密钥服务 - 专为微服务节点设计
 * 简洁高效的访问密钥管理系统
 */
class ApiKeyService {
  constructor() {
    this.keys = new Map(); // 内存存储
    this.initializeDefaultKeys();
  }

  /**
   * 初始化默认密钥
   */
  initializeDefaultKeys() {
    // 从环境变量加载预配置的密钥
    const defaultKeys = process.env.API_KEYS?.split(',') || [];

    defaultKeys.forEach(key => {
      this.registerKey(key, {
        type: 'static',
        services: ['*'], // 通配符，允许访问所有服务
        permissions: ['full'],
        description: 'Default admin key',
        createdAt: new Date()
      });
    });

    console.log(`[ApiKeyService] Loaded ${defaultKeys.length} default API keys`);
  }

  /**
   * 生成新的API密钥
   */
  generateKey(options = {}) {
    const {
      prefix = 'sk',
      services = ['*'],
      permissions = ['read'],
      description = '',
      expiresIn = null
    } = options;

    // 生成安全随机密钥
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

  /**
   * 注册密钥
   */
  registerKey(key, metadata) {
    this.keys.set(key, {
      ...metadata,
      id: this.hashKey(key),
      status: 'active'
    });
  }

  /**
   * 验证API密钥
   */
  async verifyKey(apiKey, service = null) {
    const keyInfo = this.keys.get(apiKey);

    if (!keyInfo) {
      return {
        valid: false,
        error: 'Invalid API key',
        code: 'KEY_NOT_FOUND'
      };
    }

    // 检查密钥状态
    if (keyInfo.status !== 'active') {
      return {
        valid: false,
        error: 'API key is disabled',
        code: 'KEY_DISABLED'
      };
    }

    // 检查过期时间
    if (keyInfo.expiresAt && new Date() > keyInfo.expiresAt) {
      return {
        valid: false,
        error: 'API key expired',
        code: 'KEY_EXPIRED'
      };
    }

    // 检查服务权限
    if (service && !this.hasServicePermission(keyInfo.services, service)) {
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

  /**
   * 检查服务权限
   */
  hasServicePermission(allowedServices, requestedService) {
    return allowedServices.includes('*') ||
           allowedServices.includes(requestedService) ||
           allowedServices.some(service => {
             const regex = new RegExp('^' + service.replace('*', '.*') + '$');
             return regex.test(requestedService);
           });
  }

  /**
   * 哈希密钥ID
   */
  hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  /**
   * 获取密钥统计信息
   */
  getKeyStats() {
    const stats = {
      totalKeys: this.keys.size,
      activeKeys: 0,
      expiredKeys: 0,
      disabledKeys: 0,
      totalUsage: 0
    };

    for (const [key, info] of this.keys) {
      switch (info.status) {
        case 'active':
          stats.activeKeys++;
          break;
        case 'disabled':
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

  /**
   * 撤销密钥
   */
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

  /**
   * 获取所有密钥信息（不包含敏感信息）
   */
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
}

module.exports = ApiKeyService;