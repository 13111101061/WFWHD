/**
 * VoiceCreationPort - 音色创建统一能力接口
 *
 * 取代旧的 VoiceRegistrationPort（仅克隆）+ 隐式的 GenAdapter 约定（仅指令生成）。
 * 每个 Provider 实现一个 Adapter，按需声明支持的能力：
 *   - cloneVoice()      能力①：上传音频克隆
 *   - getCloneStatus()  能力①：异步轮询（同步 Provider 用默认实现）
 *   - generatePreview() 能力②：指令生成预览
 *
 * 未实现的能力默认抛 NotSupportedError，配合 manifest 的 supportsVoiceCloning /
 * supportsInstructionGen 做能力路由（VoiceCreationRegistry 负责）。
 *
 * 对标 TtsProviderPort，但与合成链路解耦。
 */
const { NotSupportedError } = require('../errors/NotSupportedError');

class VoiceCreationPort {
  /**
   * 能力①：克隆/注册音色
   * @param {Object} file - multer 处理后的文件对象 ({ path, originalname, mimetype, size })
   * @param {Object} metadata - 前端传入的元数据 ({ displayName, gender, tags, testText, ... })
   * @param {Object} credentials - Provider 凭证
   * @returns {Promise<import('../dto/VoiceCloneResult')>}
   */
  async cloneVoice(file, metadata, credentials) {
    throw new NotSupportedError(this.providerKey, 'cloneVoice');
  }

  /**
   * 能力①：查询异步克隆任务状态
   * 默认实现：同步 Provider（如 MiMo）直接返回 completed。
   * @param {string} taskId
   * @param {Object} credentials
   * @returns {Promise<{ status: 'pending'|'completed'|'failed', providerVoiceId?: string, error?: string }>}
   */
  async getCloneStatus(_taskId, _credentials) {
    return { status: 'completed' };
  }

  /**
   * 能力②：根据指令描述生成预览音频（不入库）
   * @param {string} instruction - 声音风格描述
   * @param {string} testText - 合成测试文本
   * @param {Object} samplingParams - { temperature?, topP?, topK? }
   * @param {Object} credentials
   * @returns {Promise<{ audioUrl: string, fileSize: number, format: string, creditCost?: number }>}
   */
  async generatePreview(instruction, testText, samplingParams, credentials) {
    throw new NotSupportedError(this.providerKey, 'generatePreview');
  }

  /**
   * Provider 标识，子类必须提供（getter 形式，避免构造时序问题）。
   */
  get providerKey() {
    throw new Error(`${this.constructor.name} must define a 'providerKey' getter`);
  }
}

module.exports = VoiceCreationPort;
