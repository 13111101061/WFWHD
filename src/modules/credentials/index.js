/**
 * Credentials Module - 凭证管理模块
 *
 * 按服务商维度管理 API 密钥
 * 一个服务商可包含多个服务/接口
 */

const CredentialsRegistry = require('./core/CredentialsRegistry');

let instance = null;

function initialize(options = {}) {
  if (!instance) {
    instance = new CredentialsRegistry(options);
  }
  return instance;
}

function getRegistry() {
  if (!instance) {
    return initialize();
  }
  return instance;
}

/**
 * 获取服务商凭证
 * @param {string} providerKey - 服务商标识 (如 'aliyun', 'tencent')
 */
function getCredentials(providerKey) {
  return getRegistry().getCredentials(providerKey);
}

/**
 * 通过服务获取凭证
 * @param {string} providerKey - 服务商
 * @param {string} serviceKey - 服务
 */
function getCredentialsByService(providerKey, serviceKey) {
  return getRegistry().getCredentialsByService(providerKey, serviceKey);
}

/**
 * 获取服务配置
 */
function getServiceConfig(providerKey, serviceKey) {
  return getRegistry().getServiceConfig(providerKey, serviceKey);
}

/**
 * 检查服务商是否已配置
 */
function isConfigured(providerKey) {
  return getRegistry().hasProvider(providerKey);
}

/**
 * 检查服务是否可用
 */
function isServiceAvailable(providerKey, serviceKey) {
  return getRegistry().hasService(providerKey, serviceKey);
}

/**
 * 获取所有服务商状态
 */
function listProviders() {
  return getRegistry().listProviders();
}

/**
 * 获取已配置的服务商
 */
function getConfiguredProviders() {
  return getRegistry().listConfigured();
}

module.exports = {
  initialize,
  getRegistry,
  getCredentials,
  getCredentialsByService,
  getServiceConfig,
  isConfigured,
  isServiceAvailable,
  listProviders,
  getConfiguredProviders,
  CredentialsRegistry
};