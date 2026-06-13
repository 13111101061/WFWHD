/**
 * ManifestWatcher - Manifest 文件热更新监听器
 *
 * 职责：
 * - 监听 providers 目录下 manifest.json 文件变化
 * - 自动重新加载 manifest + 重编译 capability + 重建 adapter
 * - 开发环境自动启用，生产环境可通过环境变量控制
 */

const path = require('path');

class ManifestWatcher {
  /**
   * @param {Object} deps
   * @param {Object} deps.providerManifest - ProviderManifest 单例
   * @param {Object} deps.fieldDefinitionSystem - FieldDefinitionSystem（触发重编译）
   * @param {Object} deps.providerRegistry - ProviderRegistry（重建 adapter）
   * @param {Object} [deps.capabilityResolver] - CapabilityResolver（清除 resolve 缓存）
   */
  constructor({ providerManifest, fieldDefinitionSystem, providerRegistry, capabilityResolver }) {
    this._manifest = providerManifest;
    this._fieldSystem = fieldDefinitionSystem;
    this._registry = providerRegistry;
    this._capabilityResolver = capabilityResolver || null;
    this._watcher = null;
    this._debounceTimer = null;
  }

  /**
   * 启动监听
   * @param {string} [manifestDir] - manifest 所在目录，默认 providers/
   */
  start(manifestDir) {
    if (this._watcher) return;

    let chokidar;
    try {
      chokidar = require('chokidar');
    } catch (e) {
      console.warn('[ManifestWatcher] chokidar not available, hot reload disabled');
      return;
    }

    const dir = manifestDir || path.join(__dirname, '../providers');

    this._watcher = chokidar.watch(
      path.join(dir, '**/manifest.json'),
      {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500 }
      }
    );

    this._watcher
      .on('change', (filePath) => this._scheduleReload(filePath, 'changed'))
      .on('add', (filePath) => this._scheduleReload(filePath, 'added'));

    console.log(`[ManifestWatcher] Watching ${dir} for manifest changes`);
  }

  /**
   * 防抖重加载 — 避免短时间内多次触发
   */
  _scheduleReload(filePath, event) {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);

    this._debounceTimer = setTimeout(() => {
      this._handleReload(filePath, event);
    }, 800);
  }

  /**
   * 执行重加载
   */
  _handleReload(filePath, event) {
    const fileName = path.basename(path.dirname(filePath));

    try {
      console.log(`[ManifestWatcher] Manifest ${event}: ${fileName}/manifest.json`);

      // 1. 重新加载 manifest
      this._manifest.reload();

      // 2. 重新初始化 ProviderRegistry（重建 adapter 注册）
      if (typeof this._registry.reinitialize === 'function') {
        this._registry.reinitialize();
      } else {
        this._registry.initialize();
      }

      // 3. 清除 CompiledCapability 缓存（触发重编译）
      this._fieldSystem.reload();

      // 4. 清除 CapabilityResolver 缓存（避免返回旧 CompiledCapability 引用）
      if (this._capabilityResolver?.clearCache) {
        this._capabilityResolver.clearCache();
      }

      console.log(`[ManifestWatcher] Reload complete for ${fileName}`);
    } catch (error) {
      console.error(`[ManifestWatcher] Reload failed for ${fileName}:`, error.message);
    }
  }

  /**
   * 停止监听
   */
  stop() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
      console.log('[ManifestWatcher] Stopped');
    }
  }
}

module.exports = { ManifestWatcher };
