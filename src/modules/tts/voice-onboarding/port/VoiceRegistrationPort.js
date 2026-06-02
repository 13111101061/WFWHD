/**
 * VoiceRegistrationPort - 音色克隆适配器防腐层接口
 *
 * 所有音色克隆/注册 Adapter 必须实现此接口。
 * 对标 TtsProviderPort，但与合成链路解耦。
 */
class VoiceRegistrationPort {
  /**
   * 执行音色克隆/注册
   * @param {Object} file - multer 处理后的文件对象 ({ path, originalname, mimetype, size })
   * @param {Object} metadata - 前端传入的元数据 ({ displayName, gender, tags, testPhrase 等 })
   * @param {Object} credentials - Provider 凭证 ({ apiKey, secretId, secretKey 等 })
   * @returns {Promise<VoiceCloneResult>}
   */
  async registerVoice(file, metadata, credentials) {
    throw new Error('Method not implemented: registerVoice');
  }

  /**
   * 查询异步音色克隆任务的完成状态
   * @param {string} taskId - 异步任务 ID
   * @param {Object} credentials - Provider 凭证
   * @returns {Promise<{ status: 'pending'|'completed'|'failed', providerVoiceId?: string, error?: string }>}
   */
  async getCloneStatus(taskId, credentials) {
    throw new Error('Method not implemented: getCloneStatus');
  }
}

module.exports = VoiceRegistrationPort;
