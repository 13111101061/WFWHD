const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const config = require('../config/config');
const { sanitizeFilename, ensurePathInsideBase, sanitizeSubDir } = require('./pathSecurity');

class AudioStorageManager {
  constructor(options = {}) {
    this.options = {
      baseDir: options.baseDir || process.env.AUDIO_STORAGE_DIR || config.audio.directory,
      urlPrefix: options.urlPrefix || process.env.AUDIO_URL_PREFIX || config.audio.urlPrefix,
      maxFilenameLength: options.maxFilenameLength || 100,
      supportedFormats: options.supportedFormats || ['mp3', 'wav', 'pcm', 'flac', 'ogg'],
      enableCleanup: options.enableCleanup !== false,
      retentionPeriod: options.retentionPeriod || 7 * 24 * 60 * 60 * 1000,
      retentionByType: {
        gen: 3 * 24 * 60 * 60 * 1000,
        cln: 3 * 24 * 60 * 60 * 1000,
        syn: 7 * 24 * 60 * 60 * 1000
      },
      maxTotalSizeBytes: options.maxTotalSizeBytes || 30 * 1024 * 1024 * 1024,
      ...options
    };

    this.baseDir = path.resolve(this.options.baseDir);
    this.cleanupTimer = null;
    this.initialize();
  }

  async initialize() {
    try {
      await this.ensureDirectory(this.baseDir);
      console.log(`📁 音频存储目录初始化成功: ${this.baseDir}`);
      if (this.options.enableCleanup) {
        this.scheduleCleanup();
      }
    } catch (error) {
      console.error('❌ 音频存储目录初始化失败:', error.message);
      throw new Error(`音频存储目录初始化失败: ${error.message}`);
    }
  }

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

  _computeContentHash(buffer) {
    return crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
  }

  _resolveSubDir(metadata) {
    const providerCode = metadata.providerCode || '000';
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return `${providerCode}/${yearMonth}`;
  }

  _getRetentionForType(type) {
    if (type && this.options.retentionByType[type]) {
      return this.options.retentionByType[type];
    }
    return this.options.retentionPeriod;
  }

  generateSafeFilename(originalName, extension = 'mp3', options = {}) {
    const {
      useTimestamp = true,
      useHash = true,
      prefix = '',
      suffix = '',
      nameFormat = null,
      type = null,
      providerCode = null,
      contentHash = null
    } = options;

    let filename = '';

    if (nameFormat === 'structured' && type && providerCode) {
      const now = new Date();
      const datePart = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
      ].join('');
      filename = `${type}_${providerCode}_${datePart}`;
    } else {
      if (prefix) {
        filename += `${prefix}_`;
      }
      if (originalName && typeof originalName === 'string') {
        const cleanName = originalName
          .replace(/[<>:"/\\|?*]/g, '_')
          .replace(/\s+/g, '_')
          .substring(0, 50);
        if (cleanName) {
          filename += cleanName;
        }
      }
    }

    if (useTimestamp && nameFormat !== 'structured') {
      const timestamp = Date.now();
      filename += filename ? `_${timestamp}` : timestamp;
    }

    if (useHash) {
      const hash = contentHash || crypto.randomBytes(4).toString('hex');
      filename += filename ? `_${hash}` : hash;
    }

    if (suffix) {
      filename += `_${suffix}`;
    }

    if (filename.length > this.options.maxFilenameLength - extension.length - 1) {
      filename = filename.substring(0, this.options.maxFilenameLength - extension.length - 1);
    }

    const cleanExtension = extension.replace(/^\./, '').toLowerCase();
    if (!this.options.supportedFormats.includes(cleanExtension)) {
      throw new Error(`不支持的音频格式: ${cleanExtension}`);
    }

    return `${filename}.${cleanExtension}`;
  }

  generateFilePath(filename, subDir = '') {
    const safeFilename = sanitizeFilename(filename);
    let fullPath = this.baseDir;

    if (subDir) {
      fullPath = path.join(fullPath, sanitizeSubDir(subDir));
    }

    const finalPath = path.resolve(fullPath, safeFilename);
    ensurePathInsideBase(finalPath, fullPath);

    return finalPath;
  }

  generateFileUrl(filename, subDir = '') {
    const safeFilename = sanitizeFilename(filename);
    let urlPath = this.options.urlPrefix;

    if (subDir) {
      urlPath = `${urlPath}/${sanitizeSubDir(subDir)}`;
    }

    const relativeUrl = `${urlPath}/${safeFilename}`;

    const publicBaseUrl = process.env.PUBLIC_BASE_URL || this.options.publicBaseUrl;
    if (publicBaseUrl) {
      const base = publicBaseUrl.replace(/\/$/, '');
      return `${base}${relativeUrl}`;
    }

    return relativeUrl;
  }

  async _findExistingFile(contentHash, providerCode, type) {
    if (!contentHash) return null;

    const scanDir = async (dirPath) => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            const found = await scanDir(fullPath);
            if (found) return found;
          } else if (entry.isFile() && entry.name.includes('_' + contentHash + '.')) {
            const prefix = type || '\\w+';
            const pattern = new RegExp('^' + prefix + '_');
            if (pattern.test(entry.name)) {
              return fullPath;
            }
          }
        }
      } catch (e) { /* skip */ }
      return null;
    };

    return scanDir(this.baseDir);
  }

  async _writeSidecarMeta(filePath, metadata) {
    const metaPath = filePath + '.meta.json';
    const sidecar = {
      ...metadata,
      savedAt: new Date().toISOString(),
      audioFile: path.basename(filePath)
    };
    try {
      await fs.writeFile(metaPath, JSON.stringify(sidecar, null, 2), 'utf-8');
    } catch (e) {
      console.warn(`⚠️ Sidecar 写入失败: ${metaPath} — ${e.message}`);
    }
  }

  async saveAudioFile(audioData, options = {}) {
    const {
      filename: originalFilename = null,
      extension = 'mp3',
      subDir: explicitSubDir = '',
      metadata = {}
    } = options;

    try {
      const buffer = Buffer.isBuffer(audioData)
        ? audioData
        : typeof audioData === 'string'
          ? Buffer.from(audioData, 'binary')
          : null;

      if (!buffer) {
        throw new Error('音频数据格式不支持，必须是Buffer或string');
      }

      const contentHash = this._computeContentHash(buffer);
      const autoSubDir = this._resolveSubDir(metadata);
      const subDir = explicitSubDir || autoSubDir;

      const existingPath = await this._findExistingFile(
        contentHash,
        metadata.providerCode || '000',
        metadata.type || null
      );

      if (existingPath) {
        const stats = await fs.stat(existingPath);
        const existingFilename = path.basename(existingPath);
        const existingSubDir = path.relative(this.baseDir, path.dirname(existingPath));
        const url = this.generateFileUrl(existingFilename, existingSubDir);
        console.log(`♻️ 命中去重缓存: ${existingFilename}`);
        return {
          success: true,
          deduplicated: true,
          filename: existingFilename,
          filePath: existingPath,
          url,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
          metadata: { ...metadata, extension, subDir: existingSubDir, contentHash }
        };
      }

      const filename = originalFilename || this.generateSafeFilename(
        metadata.text || metadata.service || 'audio',
        extension,
        {
          prefix: metadata.service || 'tts',
          suffix: metadata.taskId || '',
          nameFormat: metadata.nameFormat || null,
          type: metadata.type || null,
          providerCode: metadata.providerCode || null,
          contentHash
        }
      );

      const filePath = this.generateFilePath(filename, subDir);
      const dirPath = path.dirname(filePath);
      await this.ensureDirectory(dirPath);
      await fs.writeFile(filePath, buffer);
      await this._writeSidecarMeta(filePath, {
        ...metadata,
        contentHash,
        extension,
        subDir
      });

      const stats = await fs.stat(filePath);
      const url = this.generateFileUrl(filename, subDir);

      console.log(`💾 音频文件保存成功: ${filePath} (${stats.size} bytes)`);

      return {
        success: true,
        deduplicated: false,
        filename,
        filePath,
        url,
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
        metadata: { ...metadata, extension, subDir, contentHash, originalFilename }
      };

    } catch (error) {
      console.error('❌ 音频文件保存失败:', error.message);
      throw new Error(`音频文件保存失败: ${error.message}`);
    }
  }

  async deleteAudioFile(filename, subDir = '') {
    try {
      const filePath = this.generateFilePath(filename, subDir);
      await fs.unlink(filePath);
      try { await fs.unlink(filePath + '.meta.json'); } catch (e) { /* sidecar optional */ }
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

  async fileExists(filename, subDir = '') {
    try {
      const filePath = this.generateFilePath(filename, subDir);
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getFileInfo(filename, subDir = '') {
    try {
      const filePath = this.generateFilePath(filename, subDir);
      const stats = await fs.stat(filePath);

      let sidecarMeta = null;
      try {
        const raw = await fs.readFile(filePath + '.meta.json', 'utf-8');
        sidecarMeta = JSON.parse(raw);
      } catch (e) { /* no sidecar */ }

      return {
        filename,
        filePath,
        url: this.generateFileUrl(filename, subDir),
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
        accessedAt: stats.atime.toISOString(),
        metadata: sidecarMeta
      };
    } catch (error) {
      return null;
    }
  }

  async cleanupExpiredFiles(maxAge = null) {
    if (!this.options.enableCleanup) {
      return { cleaned: 0, errors: [], totalFreed: 0 };
    }

    try {
      console.log('🧹 开始清理过期音频文件...');
      const now = Date.now();
      let cleaned = 0;
      let totalFreed = 0;
      const errors = [];

      const scanDirectory = async (dirPath) => {
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
              await scanDirectory(fullPath);
              try {
                const remaining = await fs.readdir(fullPath);
                if (remaining.length === 0) {
                  await fs.rmdir(fullPath);
                }
              } catch (e) { /* ignore */ }
            } else if (entry.isFile()) {
              if (entry.name.endsWith('.meta.json')) continue;

              const ext = path.extname(entry.name).toLowerCase().substring(1);
              if (!this.options.supportedFormats.includes(ext)) continue;

              const stats = await fs.stat(fullPath);
              const fileAge = now - stats.mtime.getTime();

              const typeMatch = entry.name.match(/^(syn|gen|cln)_/);
              const fileType = typeMatch ? typeMatch[1] : null;
              const retention = maxAge || this._getRetentionForType(fileType);

              if (fileAge > retention) {
                try {
                  await fs.unlink(fullPath);
                  try { await fs.unlink(fullPath + '.meta.json'); } catch (e) { /* optional */ }
                  cleaned++;
                  totalFreed += stats.size;
                  console.log(`🗑️ 删除过期文件 (${fileType || 'unknown'}, ${Math.round(fileAge / 86400000)}天): ${fullPath}`);
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

      console.log(`🧹 清理完成，删除了 ${cleaned} 个过期文件，释放 ${this._formatSize(totalFreed)}`);
      return { cleaned, errors, totalFreed };

    } catch (error) {
      console.error('❌ 文件清理失败:', error.message);
      return { cleaned: 0, errors: [{ error: error.message }], totalFreed: 0 };
    }
  }

  async enforceMaxTotalSize() {
    const maxSize = this.options.maxTotalSizeBytes;
    if (!maxSize) return { evicted: 0, freed: 0 };

    try {
      const files = [];

      const collectFiles = async (dirPath) => {
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
              await collectFiles(fullPath);
            } else if (entry.isFile() && !entry.name.endsWith('.meta.json')) {
              const ext = path.extname(entry.name).toLowerCase().substring(1);
              if (this.options.supportedFormats.includes(ext)) {
                const stats = await fs.stat(fullPath);
                files.push({ path: fullPath, size: stats.size, mtime: stats.mtime.getTime() });
              }
            }
          }
        } catch (e) { /* skip */ }
      };

      await collectFiles(this.baseDir);

      let totalSize = files.reduce((sum, f) => sum + f.size, 0);

      if (totalSize <= maxSize) {
        return { evicted: 0, freed: 0, totalSize };
      }

      files.sort((a, b) => a.mtime - b.mtime);

      let evicted = 0;
      let freed = 0;

      for (const file of files) {
        if (totalSize <= maxSize) break;
        try {
          await fs.unlink(file.path);
          try { await fs.unlink(file.path + '.meta.json'); } catch (e) { /* optional */ }
          totalSize -= file.size;
          freed += file.size;
          evicted++;
          console.log(`🗑️ 容量淘汰 (最旧): ${file.path} (${this._formatSize(file.size)})`);
        } catch (e) {
          console.warn(`⚠️ 容量淘汰失败: ${file.path} — ${e.message}`);
        }
      }

      console.log(`🧹 容量淘汰完成: 删除 ${evicted} 个文件，释放 ${this._formatSize(freed)}，当前 ${this._formatSize(totalSize)}`);
      return { evicted, freed, totalSize };

    } catch (error) {
      console.error('❌ 容量淘汰失败:', error.message);
      return { evicted: 0, freed: 0, error: error.message };
    }
  }

  _formatSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
  }

  scheduleCleanup() {
    const scheduleNextCleanup = () => {
      const now = new Date();
      const nextCleanup = new Date(now);
      nextCleanup.setHours(2, 0, 0, 0);

      if (nextCleanup <= now) {
        nextCleanup.setDate(nextCleanup.getDate() + 1);
      }

      const delay = nextCleanup - now;
      console.log(`⏰ 下次文件清理时间: ${nextCleanup.toISOString()}`);

      this.cleanupTimer = setTimeout(async () => {
        await this.cleanupExpiredFiles();
        await this.enforceMaxTotalSize();
        scheduleNextCleanup();
      }, delay);
    };

    scheduleNextCleanup();
  }

  stopCleanup() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('🛑 音频清理定时器已停止');
    }
  }

  async getStorageStats() {
    try {
      let totalFiles = 0;
      let totalSize = 0;
      let totalMetaFiles = 0;
      const formatStats = {};
      const typeStats = {};
      const providerStats = {};

      const scanDirectory = async (dirPath) => {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            if (entry.name.endsWith('.meta.json')) {
              totalMetaFiles++;
              continue;
            }

            const ext = path.extname(entry.name).toLowerCase().substring(1);

            if (this.options.supportedFormats.includes(ext)) {
              const stats = await fs.stat(fullPath);
              totalFiles++;
              totalSize += stats.size;

              formatStats[ext] = (formatStats[ext] || 0) + 1;

              const typeMatch = entry.name.match(/^(syn|gen|cln)_/);
              if (typeMatch) {
                typeStats[typeMatch[1]] = (typeStats[typeMatch[1]] || 0) + 1;
              }

              const providerMatch = entry.name.match(/^\w+_(\d{3})_/);
              if (providerMatch) {
                providerStats[providerMatch[1]] = (providerStats[providerMatch[1]] || 0) + 1;
              }
            }
          }
        }
      };

      await scanDirectory(this.baseDir);

      return {
        totalFiles,
        totalSize,
        totalSizeFormatted: this._formatSize(totalSize),
        maxTotalSize: this._formatSize(this.options.maxTotalSizeBytes),
        utilization: ((totalSize / this.options.maxTotalSizeBytes) * 100).toFixed(2) + '%',
        totalMetaFiles,
        averageFileSize: totalFiles > 0 ? Math.round(totalSize / totalFiles) : 0,
        formatStats,
        typeStats,
        providerStats,
        retentionByType: {
          gen: `${this.options.retentionByType.gen / 86400000}天`,
          cln: `${this.options.retentionByType.cln / 86400000}天`,
          syn: `${this.options.retentionByType.syn / 86400000}天`
        },
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

const audioStorageManager = new AudioStorageManager();

function getProviderCode(providerKey) {
  try {
    const { ProviderManifest } = require('../../modules/tts/providers/manifests/ProviderManifest');
    const all = ProviderManifest.getAllVoiceCodeMappings();
    for (const [code, info] of Object.entries(all)) {
      if (info.providerKey === providerKey) return code;
    }
  } catch (e) { /* manifest 未就绪 */ }
  return '000';
}

module.exports = {
  AudioStorageManager,
  audioStorageManager,
  getProviderCode
};
