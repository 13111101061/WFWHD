/**
 * FieldDefinitionRegistry - 字段定义注册表
 *
 * 从 ProviderManifest 加载字段定义（platform-fields.json 提供基线，
 * manifest 提供 per-service 覆盖与映射）。
 *
 * 旧 JSON 文件已删除 — 不再有双源冲突。
 */
const { ProviderManifest } = require('../providers/manifests/ProviderManifest');

class FieldDefinitionRegistry {
  constructor() {
    this._initialized = false;
    this._platformFields = null;
    this._compiledCache = new Map();
  }

  initialize() {
    if (this._initialized) return;
    this._loadPlatformFields();
    this._initialized = true;
    console.log('[FieldDefinitionRegistry] 初始化完成 (manifest-only)');
  }

  _loadPlatformFields() {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, 'fields', 'platform-fields.json');
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      this._platformFields = JSON.parse(content);
    } catch (error) {
      throw new Error(`[FieldDefinitionRegistry] 加载 platform-fields.json 失败: ${error.message}`);
    }
    if (!this._platformFields?.fields) {
      throw new Error('[FieldDefinitionRegistry] platform-fields.json 缺少 fields 定义');
    }
  }

  // ===== 平台字段 =====

  getAllPlatformFields() {
    this._ensureInitialized();
    return this._platformFields.fields;
  }

  getPlatformField(fieldKey) {
    this._ensureInitialized();
    return this._platformFields.fields[fieldKey] || null;
  }

  getUiGroups() {
    this._ensureInitialized();
    return this._platformFields.uiGroups || {};
  }

  getCategories() {
    this._ensureInitialized();
    return this._platformFields.categories || {};
  }

  // ===== 服务字段覆盖（仅从 manifest） =====

  getServiceOverrides(serviceKey, operation = 'synthesize') {
    this._ensureInitialized();
    // ProviderManifest 是唯一事实源
    return ProviderManifest.getFieldOverrides(serviceKey) || {};
  }

  getServiceFieldOverride(serviceKey, fieldKey, operation = 'synthesize') {
    const overrides = this.getServiceOverrides(serviceKey, operation);
    return overrides[fieldKey] || null;
  }

  // ===== 服务列表（仅从 manifest） =====

  getAllServiceKeys() {
    return ProviderManifest.getAllServiceKeys();
  }

  // ===== Provider 字段映射（仅从 manifest） =====

  getProviderMappings(providerKey, serviceKey = null) {
    const mm = ProviderManifest.getFieldMappings(providerKey, serviceKey);
    return mm?.mappings || {};
  }

  getProviderFieldMapping(providerKey, fieldKey, serviceKey = null) {
    const mappings = this.getProviderMappings(providerKey, serviceKey);
    return mappings[fieldKey] || null;
  }

  getProviderApiStructure(providerKey, serviceKey = null) {
    const mm = ProviderManifest.getFieldMappings(providerKey, serviceKey);
    return mm?.apiStructure || 'flat';
  }

  // ===== 来源追踪 =====

  traceFieldProvenance(serviceKey, fieldKey, operation = 'synthesize') {
    this._ensureInitialized();
    const provenance = {
      fieldKey, serviceKey, operation,
      sources: [],
      finalValue: null
    };

    const platformField = this.getPlatformField(fieldKey);
    if (platformField) {
      provenance.sources.push({
        level: 'platform',
        source: 'platform-fields.json',
        value: platformField.platformDefault,
        description: '平台默认值'
      });
    }

    const serviceOverride = this.getServiceFieldOverride(serviceKey, fieldKey, operation);
    if (serviceOverride) {
      if (serviceOverride.defaultOverride !== undefined) {
        provenance.sources.push({
          level: 'service',
          source: 'manifest.json',
          value: serviceOverride.defaultOverride,
          description: 'manifest 覆盖默认值'
        });
      }
      if (serviceOverride.status) {
        provenance.sources.push({
          level: 'service',
          source: 'manifest.json',
          value: serviceOverride.status,
          description: `manifest 状态: ${serviceOverride.status}`
        });
      }
    }

    const lastDefault = [...provenance.sources].reverse().find(s => s.source.includes('default'));
    if (lastDefault) provenance.finalValue = lastDefault.value;
    else if (platformField?.platformDefault !== undefined) provenance.finalValue = platformField.platformDefault;

    return provenance;
  }

  // ===== 缓存 =====

  clearCompiledCache(serviceKey) {
    serviceKey ? this._compiledCache.delete(serviceKey) : this._compiledCache.clear();
  }

  getCompiledCache(serviceKey) {
    return this._compiledCache.get(serviceKey) || null;
  }

  setCompiledCache(serviceKey, compiled) {
    this._compiledCache.set(serviceKey, compiled);
  }

  // ===== 工具 =====

  _ensureInitialized() {
    if (!this._initialized) this.initialize();
  }

  getStats() {
    this._ensureInitialized();
    return {
      platformFieldsCount: Object.keys(this._platformFields.fields).length,
      servicesCount: this.getAllServiceKeys().length,
      compiledCacheSize: this._compiledCache.size
    };
  }

  reload() {
    this._initialized = false;
    this._compiledCache.clear();
    this.initialize();
  }
}

const registry = new FieldDefinitionRegistry();
module.exports = { FieldDefinitionRegistry, registry };
