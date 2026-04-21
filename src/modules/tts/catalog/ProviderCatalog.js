/**
 * ProviderCatalog - 服务商目录
 *
 * [重构] 委托 ProviderDescriptorRegistry
 * 保持 API 兼容性，但内部使用统一的描述注册表
 *
 * 注意：能力定义已迁移到 CapabilitySchema
 * 获取能力信息请使用 CapabilityResolver.resolve(serviceKey)
 *
 * 新代码应直接使用 ProviderManagementService
 */

const { ProviderDescriptorRegistry } = require('../provider-management/ProviderDescriptorRegistry');

const ProviderCatalog = {
  /**
   * 获取服务商配置
   * @param {string} key - canonical key 或 alias
   * @returns {Object|null}
   */
  get(key) {
    const descriptor = ProviderDescriptorRegistry.get(key);
    if (!descriptor) return null;

    // 兼容旧格式
    return {
      provider: descriptor.provider,
      service: descriptor.service,
      displayName: descriptor.displayName,
      description: descriptor.description,
      aliases: descriptor.aliases,
      status: descriptor.status
    };
  },

  /**
   * 解析为 canonical key
   * @param {string} key - 任意有效的 key 或 alias
   * @returns {string|null}
   */
  resolveCanonicalKey(key) {
    return ProviderDescriptorRegistry.resolveCanonicalKey(key);
  },

  /**
   * 获取所有服务商列表
   * @returns {Object[]}
   */
  getAll() {
    return ProviderDescriptorRegistry.getAll().map(d => ({
      key: d.key,
      provider: d.provider,
      service: d.service,
      displayName: d.displayName,
      description: d.description,
      aliases: d.aliases,
      status: d.status
    }));
  },

  /**
   * 获取所有 canonical keys
   * @returns {string[]}
   */
  getAllCanonicalKeys() {
    return ProviderDescriptorRegistry.getAllCanonicalKeys();
  },

  /**
   * 检查 key 是否有效
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return ProviderDescriptorRegistry.has(key);
  },

  /**
   * 获取服务商能力
   * @deprecated 请使用 CapabilityResolver.resolve(serviceKey).parameterSupport
   * @param {string} key
   * @returns {Object|null}
   */
  getCapabilities(key) {
    // 委托给 CapabilityResolver
    try {
      const { capabilityResolver } = require('../application/CapabilityResolver');
      const context = capabilityResolver.resolve(key);
      return {
        parameterSupport: context.parameterSupport,
        defaults: context.resolvedDefaults,
        lockedParams: context.lockedParams
      };
    } catch (e) {
      return null;
    }
  },

  /**
   * 按 provider 分组获取
   * @returns {Object}
   */
  getByProvider() {
    const grouped = ProviderDescriptorRegistry.getByProvider();
    const result = {};

    Object.entries(grouped).forEach(([provider, descriptors]) => {
      result[provider] = descriptors.map(d => ({
        key: d.key,
        provider: d.provider,
        service: d.service,
        displayName: d.displayName,
        description: d.description,
        aliases: d.aliases,
        status: d.status
      }));
    });

    return result;
  },

  /**
   * 获取状态统计
   * @returns {Object}
   */
  getStats() {
    return ProviderDescriptorRegistry.getStats();
  }
};

module.exports = {
  ProviderCatalog,
  // 向后兼容：暴露 descriptor 数据（但建议使用 ProviderDescriptorRegistry）
  providers: ProviderDescriptorRegistry.getAll().reduce((acc, d) => {
    acc[d.key] = {
      provider: d.provider,
      service: d.service,
      displayName: d.displayName,
      description: d.description,
      aliases: d.aliases,
      status: d.status
    };
    return acc;
  }, {}),
  aliasMap: null // 已废弃，使用 ProviderDescriptorRegistry.resolveCanonicalKey
};
