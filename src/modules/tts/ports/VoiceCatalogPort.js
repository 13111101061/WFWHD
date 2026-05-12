/**
 * VoiceCatalogPort - 音色目录端口接口
 * 定义音色查询服务必须实现的方法
 */

/**
 * @typedef {Object} Voice
 * @property {Object} identity - 身份标识层
 * @property {string} identity.id - 系统唯一ID
 * @property {string} identity.sourceId - 提供商原始ID
 * @property {string} identity.provider - 提供商
 * @property {string} identity.service - 服务类型
 * @property {string} [identity.voiceCode] - 15位编码
 * @property {Object} profile - 展示信息层
 * @property {string} profile.displayName - 显示名称
 * @property {string} profile.gender - 性别
 * @property {string[]} profile.languages - 支持语言
 * @property {string[]} profile.tags - 标签
 * @property {string} [profile.description] - 描述
 * @property {Object} runtime - 运行时层
 * @property {string} runtime.voiceId - 服务商真实音色ID
 * @property {Object} [runtime.providerOptions] - 服务商特有参数
 * @property {Object} meta - 元数据层
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