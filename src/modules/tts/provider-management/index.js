/**
 * Provider Management Module
 *
 * 统一服务商管理层，提供：
 * - ProviderDescriptorRegistry: 静态描述信息管理
 * - ProviderRuntimeRegistry: 运行时实例管理
 * - ProviderManagementService: 统一管理门面
 */

const { ProviderDescriptorRegistry } = require('./ProviderDescriptorRegistry');
const { ProviderRuntimeRegistry } = require('./ProviderRuntimeRegistry');
const { ProviderManagementService } = require('./ProviderManagementService');

module.exports = {
  ProviderDescriptorRegistry,
  ProviderRuntimeRegistry,
  ProviderManagementService
};
