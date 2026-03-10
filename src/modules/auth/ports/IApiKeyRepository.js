/**
 * IApiKeyRepository - API密钥仓储接口
 * 端口：定义密钥存储的抽象接口
 *
 * 实现此接口可以支持不同的存储后端：
 * - 内存存储（默认）
 * - Redis
 * - 数据库
 * - 文件系统
 */

/**
 * @typedef {Object} KeyInfo
 * @property {string} id - 密钥ID
 * @property {string} type - 密钥类型 (static/dynamic)
 * @property {string[]} services - 允许的服务
 * @property {string[]} permissions - 权限列表
 * @property {string} status - 状态 (active/revoked/disabled)
 * @property {Date} createdAt - 创建时间
 * @property {Date} [expiresAt] - 过期时间
 * @property {Date} [lastUsedAt] - 最后使用时间
 * @property {number} usageCount - 使用次数
 * @property {string} [description] - 描述
 */

/**
 * @typedef {Object} VerificationResult
 * @property {boolean} valid - 是否有效
 * @property {string} [error] - 错误信息
 * @property {string} [code] - 错误代码
 * @property {KeyInfo} [keyInfo] - 密钥信息
 */

class IApiKeyRepository {
  /**
   * 验证API密钥
   * @param {string} apiKey
   * @param {string} [service]
   * @returns {Promise<VerificationResult>}
   */
  async verifyKey(apiKey, service) {
    throw new Error('IApiKeyRepository.verifyKey must be implemented');
  }

  /**
   * 生成新密钥
   * @param {Object} options
   * @returns {{ key: string, keyInfo: KeyInfo }}
   */
  generateKey(options) {
    throw new Error('IApiKeyRepository.generateKey must be implemented');
  }

  /**
   * 注册密钥
   * @param {string} key
   * @param {Object} metadata
   */
  registerKey(key, metadata) {
    throw new Error('IApiKeyRepository.registerKey must be implemented');
  }

  /**
   * 撤销密钥
   * @param {string} apiKey
   * @param {string} reason
   * @returns {boolean}
   */
  revokeKey(apiKey, reason) {
    throw new Error('IApiKeyRepository.revokeKey must be implemented');
  }

  /**
   * 获取所有密钥
   * @returns {Object[]}
   */
  getAllKeys() {
    throw new Error('IApiKeyRepository.getAllKeys must be implemented');
  }

  /**
   * 获取密钥统计
   * @returns {Object}
   */
  getStats() {
    throw new Error('IApiKeyRepository.getStats must be implemented');
  }
}

module.exports = IApiKeyRepository;