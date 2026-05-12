/**
 * Provider Management Module
 */

const { ProviderRegistry } = require('./ProviderRegistry');
const { ProviderManagementService } = require('./ProviderManagementService');

let _registry = null;

/** 获取已初始化的 ProviderRegistry 实例（由 ServiceContainer 设置；独立脚本自动初始化） */
function getProviderRegistry() {
  if (!_registry) {
    const { ProviderRegistry: PR } = require('./ProviderRegistry');
    _registry = new PR();
    _registry.initialize();
  }
  return _registry;
}

/** 由 ServiceContainer 在启动时调用 */
function setProviderRegistry(registry) {
  _registry = registry;
}

module.exports = {
  ProviderRegistry,
  ProviderManagementService,
  getProviderRegistry,
  setProviderRegistry
};