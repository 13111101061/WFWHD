const fs = require('fs');
const path = require('path');
const { generate } = require('./generate-voice-categories');
const { voiceModelRegistry } = require('./VoiceModelRegistry');

/**
 * 音色配置热更新监听器
 * 监听 voiceIdMapping.json 文件变化，自动重新生成分类文件
 * 
 * 策略：
 * 1. fs.watch 作为快速触发器（不可靠但快）
 * 2. 轮询 sourceFingerprint 作为兜底（可靠但慢）
 * 3. 真正判断是否需要重新生成基于 fingerprint 变化
 */
class VoiceHotReload {
  constructor() {
    this.mappingFile = path.join(__dirname, 'voiceIdMapping.json');
    this.categoriesFile = path.join(__dirname, 'voiceCategories.json');
    this.watcher = null;
    this.pollInterval = null;
    this.debounceTimer = null;
    this.debounceDelay = 2000; // 2秒防抖
    this.pollIntervalMs = 30000; // 30秒轮询一次
    this.lastFingerprint = null;
  }

  /**
   * 启动监听
   */
  start() {
    if (this.watcher || this.pollInterval) {
      console.log('⚠️  热更新监听已启动');
      return;
    }

    try {
      // 策略1: fs.watch 快速触发（不可靠）
      this.startFsWatch();

      // 策略2: 轮询兜底（可靠）
      this.startPolling();

      // 初始化 fingerprint
      this.updateFingerprint();

      console.log('🔥 音色配置热更新已启动');
      console.log(`   监听文件: ${this.mappingFile}`);
      console.log(`   fs.watch: 启用（快速触发）`);
      console.log(`   轮询兜底: 每${this.pollIntervalMs / 1000}秒检查一次`);
    } catch (error) {
      console.error('❌ 启动热更新监听失败:', error.message);
    }
  }

  /**
   * 启动 fs.watch（快速但不可靠）
   */
  startFsWatch() {
    try {
      this.watcher = fs.watch(this.mappingFile, (eventType, filename) => {
        console.log('📡 fs.watch 检测到文件变化');
        this.handleFileChange(filename);
      });

      this.watcher.on('error', (error) => {
        console.error('❌ fs.watch 错误:', error.message);
        console.log('   切换到仅轮询模式');
        if (this.watcher) {
          this.watcher.close();
          this.watcher = null;
        }
      });
    } catch (error) {
      console.warn('⚠️  fs.watch 启动失败，仅使用轮询模式:', error.message);
    }
  }

  /**
   * 启动轮询兜底（可靠但慢）
   */
  startPolling() {
    this.pollInterval = setInterval(async () => {
      try {
        await this.checkFingerprintChange();
      } catch (error) {
        console.error('⚠️  轮询检查失败:', error.message);
      }
    }, this.pollIntervalMs);
  }

  /**
   * 检查 fingerprint 是否变化
   */
  async checkFingerprintChange() {
    try {
      const currentFingerprint = await this.calculateCurrentFingerprint();

      if (this.lastFingerprint && currentFingerprint !== this.lastFingerprint) {
        console.log('🔍 轮询检测到 fingerprint 变化');
        console.log(`   旧: ${this.lastFingerprint}`);
        console.log(`   新: ${currentFingerprint}`);
        await this.reload();
      }

      this.lastFingerprint = currentFingerprint;
    } catch (error) {
      console.error('⚠️  检查 fingerprint 失败:', error.message);
    }
  }

  /**
   * 计算当前 mapping 文件的 fingerprint
   */
  async calculateCurrentFingerprint() {
    const crypto = require('crypto');
    const content = await fs.promises.readFile(this.mappingFile, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * 更新 fingerprint
   */
  async updateFingerprint() {
    try {
      this.lastFingerprint = await this.calculateCurrentFingerprint();
    } catch (error) {
      console.error('⚠️  更新 fingerprint 失败:', error.message);
    }
  }

  /**
   * 停止监听
   */
  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('🛑 fs.watch 已停止');
    }

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('🛑 轮询已停止');
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    console.log('🛑 音色配置热更新已停止');
  }

  /**
   * 处理文件变化（带防抖）
   */
  handleFileChange(filename) {
    // 清除之前的定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // 设置新的定时器
    this.debounceTimer = setTimeout(async () => {
      console.log(`\n🔄 检测到配置文件变化: ${filename}`);
      await this.checkFingerprintChange();
    }, this.debounceDelay);
  }

  /**
   * 重新加载配置
   */
  async reload() {
    try {
      console.log('📝 开始重新生成分类文件...');

      // 1. 重新生成分类文件
      await generate();
      console.log('✅ 分类文件重新生成成功');

      // 2. 重新加载注册表
      await voiceModelRegistry.reload();
      console.log('✅ 音色注册表重新加载成功');

      // 3. 更新 fingerprint
      await this.updateFingerprint();

      console.log('🎉 热更新完成！\n');
    } catch (error) {
      console.error('❌ 热更新失败:', error.message);
    }
  }
}

// 创建单例
const voiceHotReload = new VoiceHotReload();

if (process.env.VOICE_HOT_RELOAD === 'true') {
  voiceHotReload.start();
}

module.exports = {
  VoiceHotReload,
  voiceHotReload
};
