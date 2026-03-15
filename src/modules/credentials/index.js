/**
 * Credentials Module - 凭证管理模块
 *
 * 按服务商维度管理 API 密钥
 * 支持单账号模式和多账号池化模式
 */

const CredentialsRegistry = require('./core/CredentialsRegistry');
const { HealthStatus, SelectionStrategy } = require('./core/CredentialPool');

let instance = null;

/**
 * 初始化凭证注册表
 * @param {Object} options
 * @returns {CredentialsRegistry}
 */
function initialize(options = {}) {
  if (!instance) {
    instance = new CredentialsRegistry(options);
  }
  return instance;
}

/**
 * 获取注册表实例
 * @returns {CredentialsRegistry}
 */
function getRegistry() {
  if (!instance) {
    return initialize();
  }
  return instance;
}

// ==================== 现有接口（保持兼容） ====================

/**
 * 获取服务商凭证
 * @param {string} providerKey - 服务商标识 (如 'aliyun', 'tencent')
 * @returns {Object|null}
 */
function getCredentials(providerKey) {
  return getRegistry().getCredentials(providerKey);
}

/**
 * 通过服务获取凭证
 * @param {string} providerKey - 服务商
 * @param {string} serviceKey - 服务
 * @returns {Object|null}
 */
function getCredentialsByService(providerKey, serviceKey) {
  return getRegistry().getCredentialsByService(providerKey, serviceKey);
}

/**
 * 获取服务配置
 * @param {string} providerKey
 * @param {string} serviceKey
 * @returns {Object|null}
 */
function getServiceConfig(providerKey, serviceKey) {
  return getRegistry().getServiceConfig(providerKey, serviceKey);
}

/**
 * 检查服务商是否已配置
 * @param {string} providerKey
 * @returns {boolean}
 */
function isConfigured(providerKey) {
  return getRegistry().hasProvider(providerKey);
}

/**
 * 检查服务是否可用
 * @param {string} providerKey
 * @param {string} serviceKey
 * @returns {boolean}
 */
function isServiceAvailable(providerKey, serviceKey) {
  return getRegistry().hasService(providerKey, serviceKey);
}

/**
 * 获取所有服务商状态
 * @returns {Array<Object>}
 */
function listProviders() {
  return getRegistry().listProviders();
}

/**
 * 获取已配置的服务商
 * @returns {string[]}
 */
function getConfiguredProviders() {
  return getRegistry().listConfigured();
}

// ==================== 新增：池化接口 ====================

/**
 * 选择凭证（池化模式）
 * 同步选择最佳账号，支持健康检查和熔断
 *
 * @param {string} providerKey - 服务商标识
 * @param {string} serviceKey - 服务标识
 * @param {Object} context - 选择上下文（可选）
 * @returns {Object|null} - { credentials, accountId, account }
 *
 * @example
 * const result = credentials.selectCredentials('aliyun', 'qwen_http');
 * if (result) {
 *   console.log('Using account:', result.accountId);
 *   // result.credentials contains the API key
 * }
 */
function selectCredentials(providerKey, serviceKey, context = {}) {
  return getRegistry().selectCredentials(providerKey, serviceKey, context);
}

/**
 * 报告凭证使用成功
 * 用于健康追踪
 *
 * @param {string} providerKey - 服务商标识
 * @param {string} accountId - 账号ID
 * @param {string} serviceKey - 服务标识
 */
function reportSuccess(providerKey, accountId, serviceKey) {
  getRegistry().reportSuccess(providerKey, accountId, serviceKey);
}

/**
 * 报告凭证使用失败
 * 用于健康追踪和熔断
 *
 * @param {string} providerKey - 服务商标识
 * @param {string} accountId - 账号ID
 * @param {string} serviceKey - 服务标识
 * @param {Error} error - 错误对象
 */
function reportFailure(providerKey, accountId, serviceKey, error) {
  getRegistry().reportFailure(providerKey, accountId, serviceKey, error);
}

/**
 * 获取服务商账号列表
 * @param {string} providerKey
 * @returns {Array<Object>}
 */
function getProviderAccounts(providerKey) {
  return getRegistry().getProviderAccounts(providerKey);
}

/**
 * 获取单个账号
 * @param {string} providerKey
 * @param {string} accountId
 * @returns {Object|null}
 */
function getAccount(providerKey, accountId) {
  return getRegistry().getAccount(providerKey, accountId);
}

/**
 * 启用账号
 * @param {string} providerKey
 * @param {string} accountId
 */
function enableAccount(providerKey, accountId) {
  getRegistry().enableAccount(providerKey, accountId);
}

/**
 * 禁用账号
 * @param {string} providerKey
 * @param {string} accountId
 */
function disableAccount(providerKey, accountId) {
  getRegistry().disableAccount(providerKey, accountId);
}

/**
 * 重置账号熔断状态
 * @param {string} providerKey
 * @param {string} accountId
 */
function resetCircuit(providerKey, accountId) {
  getRegistry().resetCircuit(providerKey, accountId);
}

/**
 * 获取健康状态
 * @param {string} providerKey
 * @returns {Object|null}
 */
function getHealthStatus(providerKey) {
  return getRegistry().getHealthStatus(providerKey);
}

/**
 * 检查是否为池化模式
 * @returns {boolean}
 */
function isPoolMode() {
  return getRegistry().isPoolMode();
}

module.exports = {
  // 初始化
  initialize,
  getRegistry,

  // 现有接口（向后兼容）
  getCredentials,
  getCredentialsByService,
  getServiceConfig,
  isConfigured,
  isServiceAvailable,
  listProviders,
  getConfiguredProviders,

  // 新增：池化选择
  selectCredentials,
  reportSuccess,
  reportFailure,

  // 新增：账号管理
  getProviderAccounts,
  getAccount,
  enableAccount,
  disableAccount,
  resetCircuit,

  // 新增：健康状态
  getHealthStatus,
  isPoolMode,

  // 类和枚举
  CredentialsRegistry,
  HealthStatus,
  SelectionStrategy
};