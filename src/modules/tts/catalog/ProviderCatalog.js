/**
 * ProviderCatalog - 服务商目录
 * 薄封装，委托 ProviderRegistry，构造函数注入。
 */

class ProviderCatalog {
  /**
   * @param {Object} options
   * @param {Object} options.providerRegistry - ProviderRegistry 实例
   */
  constructor({ providerRegistry }) {
    this._reg = providerRegistry;
  }

  get(key) {
    const descriptor = this._reg.get(key);
    if (!descriptor) return null;
    return {
      provider: descriptor.provider,
      service: descriptor.service,
      displayName: descriptor.displayName,
      description: descriptor.description,
      aliases: descriptor.aliases,
      status: descriptor.status
    };
  }

  resolveCanonicalKey(key) { return this._reg.resolveCanonicalKey(key); }

  getAll() {
    return this._reg.getAll().map(d => ({
      key: d.key, provider: d.provider, service: d.service,
      displayName: d.displayName, description: d.description,
      aliases: d.aliases, status: d.status
    }));
  }

  getAllCanonicalKeys() { return this._reg.getAllCanonicalKeys(); }
  has(key) { return this._reg.has(key); }

  getByProvider() {
    const grouped = this._reg.getByProvider();
    const result = {};
    Object.entries(grouped).forEach(([provider, descriptors]) => {
      result[provider] = descriptors.map(d => ({
        key: d.key, provider: d.provider, service: d.service,
        displayName: d.displayName, description: d.description,
        aliases: d.aliases, status: d.status
      }));
    });
    return result;
  }

  getStats() { return this._reg.getStats(); }
}

module.exports = { ProviderCatalog };
