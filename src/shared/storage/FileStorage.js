const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * 文件存储基础类
 * 提供线程安全的文件读写操作，支持原子操作和文件锁
 */
class FileStorage {
  constructor(dataDirectory = 'src/storage/data') {
    this.dataDirectory = path.resolve(dataDirectory);
    this.locks = new Map(); // 文件锁映射
    this.cache = new Map(); // 内存缓存
    this.cacheTimeout = 5 * 60 * 1000; // 缓存5分钟
    this._initialized = false;
  }

  /**
   * 确保数据目录存在
   */
  async ensureDataDirectory() {
    try {
      await fs.access(this.dataDirectory);
    } catch (error) {
      await fs.mkdir(this.dataDirectory, { recursive: true });
    }
  }

  /**
   * 获取文件路径
   * @param {string} filename - 文件名
   * @returns {string} 完整文件路径
   */
  getFilePath(filename) {
    return path.join(this.dataDirectory, filename);
  }

  /**
   * 获取文件锁
   * @param {string} filename - 文件名
   * @param {string} mode - 锁模式 'read' | 'write'
   * @returns {Promise<Function>} 释放锁的函数
   */
  async acquireLock(filename, mode = 'write') {
    const lockKey = `${filename}:${mode}`;
    
    // 等待现有的写锁释放
    while (this.locks.has(`${filename}:write`)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // 如果是写锁，等待所有读锁释放
    if (mode === 'write') {
      const readLockPattern = new RegExp(`^${filename}:read:`);
      while (Array.from(this.locks.keys()).some(key => readLockPattern.test(key))) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    // 为读锁添加唯一标识
    const finalLockKey = mode === 'read' ? `${lockKey}:${Date.now()}:${Math.random()}` : lockKey;
    
    this.locks.set(finalLockKey, Date.now());
    
    // 返回释放锁的函数
    return () => {
      this.locks.delete(finalLockKey);
    };
  }

  /**
   * 读取JSON文件
   * @param {string} filename - 文件名
   * @param {boolean} useCache - 是否使用缓存
   * @returns {Promise<Object>} 文件内容
   */
  async readJson(filename, useCache = true) {
    // 确保目录已初始化
    if (!this._initialized) {
      await this.ensureDataDirectory();
      this._initialized = true;
    }
    
    const filePath = this.getFilePath(filename);
    
    // 检查缓存
    if (useCache && this.cache.has(filename)) {
      const cached = this.cache.get(filename);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }
    
    const releaseLock = await this.acquireLock(filename, 'read');
    
    try {
      // 检查文件是否存在
      try {
        await fs.access(filePath);
      } catch (error) {
        // 文件不存在，返回默认结构
        const defaultData = this.getDefaultData(filename);
        releaseLock();
        return defaultData;
      }
      
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);
      
      // 更新缓存
      if (useCache) {
        this.cache.set(filename, {
          data: JSON.parse(JSON.stringify(data)), // 深拷贝
          timestamp: Date.now()
        });
      }
      
      return data;
    } catch (error) {
      throw new Error(`读取文件 ${filename} 失败: ${error.message}`);
    } finally {
      releaseLock();
    }
  }

  /**
   * 原子写入JSON文件
   * @param {string} filename - 文件名
   * @param {Object} data - 要写入的数据
   * @returns {Promise<void>}
   */
  async writeJson(filename, data) {
    // 确保目录已初始化
    if (!this._initialized) {
      await this.ensureDataDirectory();
      this._initialized = true;
    }
    
    const filePath = this.getFilePath(filename);
    const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
    
    const releaseLock = await this.acquireLock(filename, 'write');
    
    try {
      // 添加元数据
      const dataWithMeta = {
        ...data,
        metadata: {
          ...data.metadata,
          lastModified: new Date().toISOString(),
          version: (data.metadata?.version || 0) + 1
        }
      };
      
      // 写入临时文件
      const content = JSON.stringify(dataWithMeta, null, 2);
      await fs.writeFile(tempPath, content, 'utf8');
      
      // 原子替换
      await fs.rename(tempPath, filePath);
      
      // 更新缓存
      this.cache.set(filename, {
        data: JSON.parse(JSON.stringify(dataWithMeta)), // 深拷贝
        timestamp: Date.now()
      });
      
    } catch (error) {
      // 清理临时文件
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        // 忽略清理错误
      }
      throw new Error(`写入文件 ${filename} 失败: ${error.message}`);
    } finally {
      releaseLock();
    }
  }

  /**
   * 更新JSON文件（读取-修改-写入）
   * @param {string} filename - 文件名
   * @param {Function} updateFn - 更新函数，接收当前数据，返回新数据
   * @returns {Promise<Object>} 更新后的数据
   */
  async updateJson(filename, updateFn) {
    const releaseLock = await this.acquireLock(filename, 'write');
    
    try {
      // 直接读取文件，不使用锁（因为已经持有写锁）
      const currentData = await this._readJsonDirect(filename);
      const newData = await updateFn(currentData);
      await this._writeJsonDirect(filename, newData);
      return newData;
    } finally {
      releaseLock();
    }
  }

  /**
   * 直接读取JSON文件（不使用锁）
   * @param {string} filename - 文件名
   * @returns {Promise<Object>} 文件内容
   */
  async _readJsonDirect(filename) {
    const filePath = this.getFilePath(filename);
    
    try {
      await fs.access(filePath);
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 文件不存在，返回默认结构
        return this.getDefaultData(filename);
      }
      throw new Error(`读取文件 ${filename} 失败: ${error.message}`);
    }
  }

  /**
   * 直接写入JSON文件（不使用锁）
   * @param {string} filename - 文件名
   * @param {Object} data - 要写入的数据
   * @returns {Promise<void>}
   */
  async _writeJsonDirect(filename, data) {
    const filePath = this.getFilePath(filename);
    const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const jsonContent = JSON.stringify(data, null, 2);
      await fs.writeFile(tempPath, jsonContent, 'utf8');
      await fs.rename(tempPath, filePath);
      
      // 清除缓存
      this.cache.delete(filename);
    } catch (error) {
      // 清理临时文件
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        // 忽略清理错误
      }
      throw new Error(`写入文件 ${filename} 失败: ${error.message}`);
    }
  }

  /**
   * 获取默认数据结构
   * @param {string} filename - 文件名
   * @returns {Object} 默认数据
   */
  getDefaultData(filename) {
    const defaults = {
      'users.json': {
        users: {},
        metadata: {
          version: 0,
          totalUsers: 0,
          lastModified: new Date().toISOString()
        }
      },
      'users_index.json': {
        usernameIndex: {},
        emailIndex: {},
        apiKeyIndex: {},
        metadata: {
          version: 0,
          lastModified: new Date().toISOString()
        }
      },
      'invite_codes.json': {
        inviteCodes: {},
        metadata: {
          version: 0,
          totalCodes: 0,
          lastModified: new Date().toISOString()
        }
      },
      'api_calls.json': {
        calls: [],
        metadata: {
          version: 0,
          totalCalls: 0,
          lastModified: new Date().toISOString()
        }
      }
    };
    
    return defaults[filename] || {
      data: {},
      metadata: {
        version: 0,
        lastModified: new Date().toISOString()
      }
    };
  }

  /**
   * 清理缓存
   * @param {string} filename - 文件名（可选，不提供则清理所有缓存）
   */
  clearCache(filename = null) {
    if (filename) {
      this.cache.delete(filename);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 备份文件
   * @param {string} filename - 文件名
   * @returns {Promise<string>} 备份文件路径
   */
  async backup(filename) {
    const filePath = this.getFilePath(filename);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup.${timestamp}`;
    
    try {
      await fs.copyFile(filePath, backupPath);
      return backupPath;
    } catch (error) {
      throw new Error(`备份文件 ${filename} 失败: ${error.message}`);
    }
  }

  /**
   * 获取文件统计信息
   * @param {string} filename - 文件名
   * @returns {Promise<Object>} 文件统计信息
   */
  async getFileStats(filename) {
    const filePath = this.getFilePath(filename);
    
    try {
      const stats = await fs.stat(filePath);
      const data = await this.readJson(filename);
      
      return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        version: data.metadata?.version || 0,
        recordCount: this.getRecordCount(filename, data)
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * 获取记录数量
   * @param {string} filename - 文件名
   * @param {Object} data - 文件数据
   * @returns {number} 记录数量
   */
  getRecordCount(filename, data) {
    if (filename === 'users.json') {
      return Object.keys(data.users || {}).length;
    } else if (filename === 'invite_codes.json') {
      return Object.keys(data.inviteCodes || {}).length;
    } else if (filename === 'api_calls.json') {
      return (data.calls || []).length;
    }
    return 0;
  }
}

module.exports = FileStorage;