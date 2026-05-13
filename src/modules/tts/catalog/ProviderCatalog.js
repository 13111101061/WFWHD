class ProviderCatalog {
  constructor({ providerRegistry }) {
    if (!providerRegistry) {
      throw new Error('[ProviderCatalog] 需要 providerRegistry 实例');
    }
    this._registry = providerRegistry;
  }

  get(key) {
    const descriptor = this._registry.get(key);
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

  resolveCanonicalKey(key) { return this._registry.resolveCanonicalKey(key); }

  getAll() {
    return this._registry.getAll().map(d => ({
      key: d.key, provider: d.provider, service: d.service,
      displayName: d.displayName, description: d.description,
      aliases: d.aliases, status: d.status
    }));
  }

  getAllCanonicalKeys() { return this._registry.getAllCanonicalKeys(); }
  has(key) { return this._registry.has(key); }

  getByProvider() {
    const grouped = this._registry.getByProvider();
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

  getStats() { return this._registry.getStats(); }
}

module.exports = { ProviderCatalog };
