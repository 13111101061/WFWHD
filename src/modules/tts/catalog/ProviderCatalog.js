/**
 * ProviderCatalog - 服务商目录
 * 委托 ProviderRegistry
 */

const { getProviderRegistry } = require('../provider-management');

const ProviderCatalog = {
  get(key) {
    const descriptor = getProviderRegistry().get(key);
    if (!descriptor) return null;
    return {
      provider: descriptor.provider,
      service: descriptor.service,
      displayName: descriptor.displayName,
      description: descriptor.description,
      aliases: descriptor.aliases,
      status: descriptor.status
    };
  },
  resolveCanonicalKey(key) { return getProviderRegistry().resolveCanonicalKey(key); },
  getAll() {
    return getProviderRegistry().getAll().map(d => ({
      key: d.key, provider: d.provider, service: d.service,
      displayName: d.displayName, description: d.description,
      aliases: d.aliases, status: d.status
    }));
  },
  getAllCanonicalKeys() { return getProviderRegistry().getAllCanonicalKeys(); },
  has(key) { return getProviderRegistry().has(key); },
  getByProvider() {
    const grouped = getProviderRegistry().getByProvider();
    const result = {};
    Object.entries(grouped).forEach(([provider, descriptors]) => {
      result[provider] = descriptors.map(d => ({
        key: d.key, provider: d.provider, service: d.service,
        displayName: d.displayName, description: d.description,
        aliases: d.aliases, status: d.status
      }));
    });
    return result;
  },
  getStats() { return getProviderRegistry().getStats(); }
};

module.exports = {
  ProviderCatalog
};
