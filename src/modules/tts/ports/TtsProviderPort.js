/**
 * TtsProviderPort - TTS提供者端口接口
 * 定义TTS提供者必须实现的方法
 *
 * 这是六边形架构中的"端口"定义
 * 具体实现（适配器）在 adapters/providers/ 目录
 */

/**
 * @typedef {Object} SynthesisResult
 * @property {string} audioUrl - 音频URL
 * @property {string} filePath - 文件路径
 * @property {string} fileName - 文件名
 * @property {string} voice - 使用的音色
 * @property {string} [model] - 模型
 * @property {number} [duration] - 时长
 * @property {number} [fileSize] - 文件大小
 * @property {string} [format] - 格式
 * @property {number} [sampleRate] - 采样率
 * @property {string} [traceId] - 追踪ID
 * @property {boolean} [fromCache] - 是否来自缓存
 */

/**
 * @typedef {Object} ProviderInfo
 * @property {string} provider - 提供商标识
 * @property {string[]} services - 可用服务列表
 * @property {string} description - 描述
 */

/**
 * TtsProviderPort 接口
 * 所有TTS提供者适配器必须实现此接口
 */
class TtsProviderPort {
  /**
   * 执行TTS合成
   * @param {string} provider - 提供商
   * @param {string} serviceType - 服务类型
   * @param {string} text - 文本
   * @param {Object} options - 选项
   * @returns {Promise<SynthesisResult>}
   */
  async synthesize(provider, serviceType, text, options) {
    throw new Error('TtsProviderPort.synthesize must be implemented');
  }

  /**
   * 获取可用服务提供商列表
   * @returns {ProviderInfo[]}
   */
  getAvailableProviders() {
    throw new Error('TtsProviderPort.getAvailableProviders must be implemented');
  }

  /**
   * 获取健康状态
   * @returns {Promise<Object>}
   */
  async getHealthStatus() {
    throw new Error('TtsProviderPort.getHealthStatus must be implemented');
  }

  /**
   * 检查服务是否可用
   * @param {string} provider
   * @param {string} serviceType
   * @returns {Promise<boolean>}
   */
  async isAvailable(provider, serviceType) {
    throw new Error('TtsProviderPort.isAvailable must be implemented');
  }
}

module.exports = TtsProviderPort;