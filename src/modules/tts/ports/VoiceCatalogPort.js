/**
 * VoiceCatalogPort - 音色目录端口接口
 * 定义音色查询服务必须实现的方法
 */

/**
 * @typedef {Object} Voice
 * @property {string} id - 系统唯一ID
 * @property {string} sourceId - 提供商原始ID
 * @property {string} provider - 提供商
 * @property {string} service - 服务类型
 * @property {string} displayName - 显示名称
 * @property {string} gender - 性别
 * @property {string[]} languages - 支持语言
 * @property {string[]} tags - 标签
 * @property {string} [description] - 描述
 * @property {Object} [ttsConfig] - TTS配置
 */

/**
 * VoiceCatalogPort 接口
 */
class VoiceCatalogPort {
  /**
   * 根据ID获取音色
   * @param {string} id - 系统唯一ID
   * @returns {Promise<Voice|null>}
   */
  async getById(id) {
    throw new Error('VoiceCatalogPort.getById must be implemented');
  }

  /**
   * 根据提供商获取音色列表
   * @param {string} provider
   * @returns {Promise<Voice[]>}
   */
  async getByProvider(provider) {
    throw new Error('VoiceCatalogPort.getByProvider must be implemented');
  }

  /**
   * 根据提供商和服务类型获取音色列表
   * @param {string} provider
   * @param {string} service
   * @returns {Promise<Voice[]>}
   */
  async getByProviderAndService(provider, service) {
    throw new Error('VoiceCatalogPort.getByProviderAndService must be implemented');
  }

  /**
   * 获取所有音色
   * @returns {Promise<Voice[]>}
   */
  async getAll() {
    throw new Error('VoiceCatalogPort.getAll must be implemented');
  }

  /**
   * 按服务分组获取所有音色
   * @returns {Promise<Object>}
   */
  async getAllGroupedByService() {
    throw new Error('VoiceCatalogPort.getAllGroupedByService must be implemented');
  }

  /**
   * 等待目录就绪
   * @param {number} timeout - 超时时间(ms)
   * @returns {Promise<boolean>}
   */
  async waitForReady(timeout) {
    throw new Error('VoiceCatalogPort.waitForReady must be implemented');
  }

  /**
   * 获取健康状态
   * @returns {Object}
   */
  getHealth() {
    throw new Error('VoiceCatalogPort.getHealth must be implemented');
  }
}

module.exports = VoiceCatalogPort;