/**
 * VoiceCloneResult - 音色克隆注册结果值对象
 *
 * 统一所有 Provider Adapter 的返回格式，隔离同步/异步状态。
 */
class VoiceCloneResult {
  /**
   * @param {Object} params
   * @param {string} [params.providerVoiceId] - 成功后的底层音色 ID（同步模式必有）
   * @param {string} params.model - 绑定的模型名 (e.g., 'moss-tts')
   * @param {boolean} [params.asyncMode=false] - 是否为异步训练模式
   * @param {string} [params.taskId] - 异步模式下的任务 ID（用于轮询）
   * @param {Object} [params.meta] - 额外元数据（provider 特有信息）
   */
  constructor({ providerVoiceId = null, model, asyncMode = false, taskId = null, meta = null }) {
    if (!asyncMode && !providerVoiceId) {
      throw new Error('providerVoiceId is required in synchronous mode.');
    }
    if (asyncMode && !taskId) {
      throw new Error('taskId is required in asynchronous mode.');
    }

    this.providerVoiceId = providerVoiceId;
    this.model = model;
    this.asyncMode = asyncMode;
    this.taskId = taskId;
    this.meta = meta;
  }

  isReady() {
    return !this.asyncMode;
  }

  toJSON() {
    return {
      providerVoiceId: this.providerVoiceId,
      model: this.model,
      asyncMode: this.asyncMode,
      taskId: this.taskId,
      meta: this.meta
    };
  }
}

module.exports = VoiceCloneResult;
