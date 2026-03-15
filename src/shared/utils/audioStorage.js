const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const config = require('../config/config');

/**
 * 统一音频存储管理器
 * 提供安全、统一、高效的音频文件存储服务
 */
class AudioStorageManager {
  constructor(options = {}) {
    this.options = {
      // 音频存储根目录
      baseDir: options.baseDir || process.env.AUDIO_STORAGE_DIR || config.audio.directory,
      // URL前缀
      urlPrefix: options.urlPrefix || process.env.AUDIO_URL_PREFIX || config.audio.urlPrefix,
      // 文件名长度限制
      maxFilenameLength: options.maxFilenameLength || 100,
      // 支持的音频格式
      supportedFormats: options.supportedFormats || ['mp3', 'wav', 'pcm', 'flac', 'ogg'],
      // 是否启用文件清理
      enableCleanup: options.enableCleanup !== false,
      // 文件保留时间（毫秒）
      retentionPeriod: options.retentionPeriod || 7 * 24 * 60 * 60 * 1000, // 7天
      ...options
    };

    // 确保路径是绝对路径
    this.baseDir = path.resolve(this.options.baseDir);

    // 定时器引用（用于关闭）
    this.cleanupTimer = null;

    // 初始化
    this.initialize();
  }

  /**
   * 初始化音频存储目录
   */
  async initialize() {
    try {
      await this.ensureDirectory(this.baseDir);
      console.log(`📁 音频存储目录初始化成功: ${this.baseDir}`);

      // 如果启用清理，创建清理定时任务
      if (this.options.enableCleanup) {
        this.scheduleCleanup();
      }
    } catch (error) {
      console.error('❌ 音频存储目录初始化失败:', error.message);
      throw new Error(`音频存储目录初始化失败: ${error.message}`);
    }
  }

  /**
   * 确保目录存在
   * @param {string} dirPath - 目录路径
   */
  async ensureDirectory(dirPath) {
    try {
      await fs.access(dirPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.mkdir(dirPath, { recursive: true });
        console.log(`📁 创建目录: ${dirPath}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * 生成安全的文件名
   * @param {string} originalName - 原始文件名或文本
   * @param {string} extension - 文件扩展名
   * @param {Object} options - 选项
   * @returns {string} 安全的文件名
   */
  generateSafeFilename(originalName, extension = 'mp3', options = {}) {
    const {
      useTimestamp = true,
      useHash = true,
      prefix = '',
      suffix = ''
    } = options;

    let filename = '';

    // 添加前缀
    if (prefix) {
      filename += `${prefix}_`;
    }

    // 处理原始名称
    if (originalName && typeof originalName === 'string') {
      // 清理文件名，移除不安全字符
      const cleanName = originalName
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '_')
        .substring(0, 50); // 限制长度

      if (cleanName) {
        filename += cleanName;
      }
    }

    // 添加时间戳
    if (useTimestamp) {
      const timestamp = Date.now();
      filename += filename ? `_${timestamp}` : timestamp;
    }

    // 添加哈希值（确保唯一性）
    if (useHash) {
      const hash = crypto.randomBytes(8).toString('hex');
      filename += filename ? `_${hash}` : hash;
    }

    // 添加后缀
    if (suffix) {
      filename += `_${suffix}`;
    }

    // 限制总长度
    if (filename.length > this.options.maxFilenameLength - extension.length - 1) {
      filename = filename.substring(0, this.options.maxFilenameLength - extension.length - 1);
    }

    // 确保扩展名有效
    const cleanExtension = extension.replace(/^\./, '').toLowerCase();
    if (!this.options.supportedFormats.includes(cleanExtension)) {
      throw new Error(`不支持的音频格式: ${cleanExtension}`);
    }

    return `${filename}.${cleanExtension}`;
  }

  /**
   * 生成文件路径
   * @param {string} filename - 文件名
   * @param {string} subDir - 子目录（可选）
   * @returns {string} 完整文件路径
   */
  generateFilePath(filename, subDir = '') {
    let fullPath = this.baseDir;

    // 添加子目录
    if (subDir) {
      // 清理子目录名
      const cleanSubDir = subDir.replace(/[^a-zA-Z0-9_-]/g, '_');
      fullPath = path.join(fullPath, cleanSubDir);
    }

    return path.join(fullPath, filename);
  }

  /**
   * 生成文件URL
   * @param {string} filename - 文件名
   * @param {string} subDir - 子目录（可选）
   * @returns {string} 文件URL
   */
  generateFileUrl(filename, subDir = '') {
    let urlPath = this.options.urlPrefix;

    // 添加子目录到URL
    if (subDir) {
      const cleanSubDir = subDir.replace(/[^a-zA-Z0-9_-]/g, '_');
      urlPath = `${urlPath}/${cleanSubDir}`;
    }

    return `${urlPath}/${filename}`;
  }

  /**
   * 保存音频文件
   * @param {Buffer|string} audioData - 音频数据
   * @param {Object} options - 保存选项
   * @returns {Promise<Object>} 保存结果
   */
  async saveAudioFile(audioData, options = {}) {
    const {
      filename: originalFilename = null,
      extension = 'mp3',
      subDir = '',
      metadata = {}
    } = options;

    try {
      // 生成文件名
      const filename = originalFilename || this.generateSafeFilename(
        metadata.text || metadata.service || 'audio',
        extension,
        {
          prefix: metadata.service || 'tts',
          suffix: metadata.taskId || ''
        }
      );

      // 生成文件路径
      const filePath = this.generateFilePath(filename, subDir);
      const dirPath = path.dirname(filePath);

      // 确保目录存在
      await this.ensureDirectory(dirPath);

      // 保存文件
      if (Buffer.isBuffer(audioData)) {
        await fs.writeFile(filePath, audioData);
      } else if (typeof audioData === 'string') {
        await fs.writeFile(filePath, Buffer.from(audioData, 'binary'));
      } else {
        throw new Error('音频数据格式不支持，必须是Buffer或string');
      }

      // 获取文件信息
      const stats = await fs.stat(filePath);

      // 生成URL
      const url = this.generateFileUrl(filename, subDir);

      console.log(`💾 音频文件保存成功: ${filePath} (${stats.size} bytes)`);

      return {
        success: true,
        filename,
        filePath,
        url,
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
        metadata: {
          ...metadata,
          extension,
          subDir,
          originalFilename
        }
      };

    } catch (error) {
      console.error('❌ 音频文件保存失败:', error.message);
      throw new Error(`音频文件保存失败: ${error.message}`);
    }
  }

  /**
   * 删除音频文件
   * @param {string} filename - 文件名
   * @param {string} subDir - 子目录（可选）
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteAudioFile(filename, subDir = '') {
    try {
      const filePath = this.generateFilePath(filename, subDir);
      await fs.unlink(filePath);
      console.log(`🗑️ 音频文件删除成功: ${filePath}`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`⚠️ 文件不存在，无需删除: ${filename}`);
        return false;
      }
      console.error('❌ 音频文件删除失败:', error.message);
      throw error;
    }
  }

  /**
   * 检查文件是否存在
   * @param {string} filename - 文件名
   * @param {string} subDir - 子目录（可选）
   * @returns {Promise<boolean>} 文件是否存在
   */
  async fileExists(filename, subDir = '') {
    try {
      const filePath = this.generateFilePath(filename, subDir);
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取文件信息
   * @param {string} filename - 文件名
   * @param {string} subDir - 子目录（可选）
   * @returns {Promise<Object|null>} 文件信息
   */
  async getFileInfo(filename, subDir = '') {
    try {
      const filePath = this.generateFilePath(filename, subDir);
      const stats = await fs.stat(filePath);

      return {
        filename,
        filePath,
        url: this.generateFileUrl(filename, subDir),
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
        accessedAt: stats.atime.toISOString()
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * 清理过期文件
   * @param {number} maxAge - 最大保留时间（毫秒）
   * @returns {Promise<Object>} 清理结果
   */
  async cleanupExpiredFiles(maxAge = this.options.retentionPeriod) {
    if (!this.options.enableCleanup) {
      return { cleaned: 0, errors: [] };
    }

    try {
      console.log('🧹 开始清理过期音频文件...');
      const now = Date.now();
      let cleaned = 0;
      const errors = [];

      // 递归扫描目录
      const scanDirectory = async (dirPath) => {
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
              await scanDirectory(fullPath);
            } else if (entry.isFile()) {
              // 检查文件扩展名
              const ext = path.extname(entry.name).toLowerCase().substring(1);
              if (!this.options.supportedFormats.includes(ext)) {
                continue; // 跳过非音频文件
              }

              // 检查文件年龄
              const stats = await fs.stat(fullPath);
              const fileAge = now - stats.mtime.getTime();

              if (fileAge > maxAge) {
                try {
                  await fs.unlink(fullPath);
                  cleaned++;
                  console.log(`🗑️ 删除过期文件: ${fullPath}`);
                } catch (error) {
                  errors.push({ file: fullPath, error: error.message });
                }
              }
            }
          }
        } catch (error) {
          errors.push({ directory: dirPath, error: error.message });
        }
      };

      await scanDirectory(this.baseDir);

      console.log(`🧹 清理完成，删除了 ${cleaned} 个过期文件`);
      return { cleaned, errors };

    } catch (error) {
      console.error('❌ 文件清理失败:', error.message);
      return { cleaned: 0, errors: [{ error: error.message }] };
    }
  }

  /**
   * 定时清理任务
   */
  scheduleCleanup() {
    // 每天凌晨2点执行清理
    const scheduleNextCleanup = () => {
      const now = new Date();
      const nextCleanup = new Date(now);
      nextCleanup.setHours(2, 0, 0, 0);

      // 如果已经过了今天的2点，安排到明天
      if (nextCleanup <= now) {
        nextCleanup.setDate(nextCleanup.getDate() + 1);
      }

      const delay = nextCleanup - now;
      console.log(`⏰ 下次文件清理时间: ${nextCleanup.toISOString()}`);

      this.cleanupTimer = setTimeout(async () => {
        await this.cleanupExpiredFiles();
        scheduleNextCleanup(); // 安排下次清理
      }, delay);
    };

    scheduleNextCleanup();
  }

  /**
   * 停止定时清理任务
   * 用于测试环境或服务关闭时释放资源
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('🛑 音频清理定时器已停止');
    }
  }

  /**
   * 获取存储统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStorageStats() {
    try {
      let totalFiles = 0;
      let totalSize = 0;
      const formatStats = {};

      // 递归扫描目录
      const scanDirectory = async (dirPath) => {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase().substring(1);

            if (this.options.supportedFormats.includes(ext)) {
              const stats = await fs.stat(fullPath);
              totalFiles++;
              totalSize += stats.size;

              formatStats[ext] = (formatStats[ext] || 0) + 1;
            }
          }
        }
      };

      await scanDirectory(this.baseDir);

      return {
        totalFiles,
        totalSize,
        averageFileSize: totalFiles > 0 ? Math.round(totalSize / totalFiles) : 0,
        formatStats,
        baseDir: this.baseDir,
        urlPrefix: this.options.urlPrefix,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ 获取存储统计失败:', error.message);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// 创建默认实例
const audioStorageManager = new AudioStorageManager();

module.exports = {
  AudioStorageManager,
  audioStorageManager
};