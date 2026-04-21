/**
 * FieldDefinitionRegistry - 字段定义注册表
 *
 * 职责：
 * - 管理三层字段定义：平台定义 → 服务覆盖 → Provider 映射
 * - 提供字段查询接口
 * - 支持字段来源追踪
 *
 * 设计原则：
 * - 只管理"字段定义事实"，不承担业务逻辑
 * - 不参与运行时调用、音色解析、请求编排
 * - 启动时加载，运行时只读
 */

const fs = require('fs');
const path = require('path');

// 配置文件路径
const FIELDS_DIR = path.join(__dirname, 'fields');

/**
 * @typedef {Object} PlatformField - 平台字段定义
 * @property {string} key - 字段标识
 * @property {string} displayName - 显示名称
 * @property {string} description - 描述
 * @property {string} type - 类型 (string|number|enum|object)
 * @property {string} category - 分类
 * @property {boolean} required - 是否必填
 * @property {*} platformDefault - 平台默认值
 * @property {Object} platformRange - 平台范围
 * @property {string[]} platformValues - 平台枚举值
 * @property {Object} ui - UI 配置
 * @property {Object} validation - 校验规则
 * @property {Object} nestedFields - 嵌套字段（type=object 时）
 */

/**
 * @typedef {Object} ServiceFieldOverride - 服务字段覆盖
 * @property {string} status - 支持状态 (supported|unsupported|locked|hidden|deprecated)
 * @property {*} defaultOverride - 默认值覆盖
 * @property {Object} rangeOverride - 范围覆盖
 * @property {Object} validationOverride - 校验规则覆盖
 * @property {Object} ui - UI 配置覆盖
 * @property {string} lockedValue - 锁定值
 * @property {string} lockedValueSource - 锁定值来源
 * @property {string} reason - 原因说明
 */

/**
 * @typedef {Object} ProviderFieldMapping - Provider 字段映射
 * @property {string} providerPath - Provider API 路径
 * @property {string} transform - 变换类型
 * @property {Object} transformConfig - 变换配置
 * @property {string} source - 值来源字段
 * @property {Object} nestedMappings - 嵌套映射
 */

/**
 * @typedef {Object} CompiledField - 编译后的字段
 * @property {string} key - 字段标识
 * @property {string} displayName - 显示名称
 * @property {string} description - 描述
 * @property {string} type - 类型
 * @property {string} category - 分类
 * @property {boolean} required - 是否必填
 * @property {string} status - 支持状态
 * @property {*} defaultValue - 最终默认值
 * @property {Object} range - 最终范围
 * @property {string[]} values - 最终枚举值
 * @property {Object} ui - 最终 UI 配置
 * @property {Object} validation - 最终校验规则
 * @property {Object} mapping - Provider 映射
 * @property {Object} provenance - 字段来源追踪
 */

class FieldDefinitionRegistry {
  constructor() {
    this._initialized = false;
    this._platformFields = null;
    this._serviceOverrides = null;
    this._providerMappings = null;
    this._compiledCache = new Map();
  }

  /**
   * 初始化注册表（加载配置文件）
   * @throws {Error} 配置加载或校验失败时抛出
   */
  initialize() {
    if (this._initialized) return;

    this._loadPlatformFields();
    this._loadServiceOverrides();
    this._loadProviderMappings();

    this._initialized = true;
    console.log('[FieldDefinitionRegistry] 初始化完成');
  }

  // ==================== 配置加载 ====================

  _loadPlatformFields() {
    const filePath = path.join(FIELDS_DIR, 'platform-fields.json');
    this._platformFields = this._loadJson(filePath, '平台字段定义');
    this._validatePlatformFields();
  }

  _loadServiceOverrides() {
    const filePath = path.join(FIELDS_DIR, 'service-field-overrides.json');
    this._serviceOverrides = this._loadJson(filePath, '服务覆盖定义');
  }

  _loadProviderMappings() {
    const filePath = path.join(FIELDS_DIR, 'provider-field-mappings.json');
    this._providerMappings = this._loadJson(filePath, 'Provider 映射');
  }

  _loadJson(filePath, description) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`[FieldDefinitionRegistry] 加载${description}失败: ${filePath}\n${error.message}`);
    }
  }

  _validatePlatformFields() {
    if (!this._platformFields?.fields) {
      throw new Error('[FieldDefinitionRegistry] 平台字段定义缺少 fields 字段');
    }

    const requiredFields = ['text', 'voice'];
    for (const key of requiredFields) {
      if (!this._platformFields.fields[key]) {
        throw new Error(`[FieldDefinitionRegistry] 缺少必需的平台字段定义: ${key}`);
      }
    }
  }

  // ==================== 平台字段查询 ====================

  /**
   * 获取所有平台字段定义
   * @returns {Object<string, PlatformField>}
   */
  getAllPlatformFields() {
    this._ensureInitialized();
    return this._platformFields.fields;
  }

  /**
   * 获取单个平台字段定义
   * @param {string} fieldKey - 字段标识
   * @returns {PlatformField|null}
   */
  getPlatformField(fieldKey) {
    this._ensureInitialized();
    return this._platformFields.fields[fieldKey] || null;
  }

  /**
   * 获取 UI 分组定义
   * @returns {Object}
   */
  getUiGroups() {
    this._ensureInitialized();
    return this._platformFields.uiGroups || {};
  }

  /**
   * 获取字段分类定义
   * @returns {Object}
   */
  getCategories() {
    this._ensureInitialized();
    return this._platformFields.categories || {};
  }

  // ==================== 服务覆盖查询 ====================

  /**
   * 获取服务的所有字段覆盖
   * @param {string} serviceKey - 服务标识
   * @param {string} operation - 操作类型 (synthesize|batch 等)
   * @returns {Object<string, ServiceFieldOverride>}
   */
  getServiceOverrides(serviceKey, operation = 'synthesize') {
    this._ensureInitialized();
    const service = this._serviceOverrides.services[serviceKey];
    if (!service) return {};

    return service.operationOverrides?.[operation] || {};
  }

  /**
   * 获取服务的单个字段覆盖
   * @param {string} serviceKey - 服务标识
   * @param {string} fieldKey - 字段标识
   * @param {string} operation - 操作类型
   * @returns {ServiceFieldOverride|null}
   */
  getServiceFieldOverride(serviceKey, fieldKey, operation = 'synthesize') {
    const overrides = this.getServiceOverrides(serviceKey, operation);
    return overrides[fieldKey] || null;
  }

  /**
   * 获取所有已注册的服务
   * @returns {string[]}
   */
  getAllServiceKeys() {
    this._ensureInitialized();
    return Object.keys(this._serviceOverrides.services);
  }

  // ==================== Provider 映射查询 ====================

  /**
   * 获取 Provider 的字段映射
   * @param {string} providerKey - 服务商标识
   * @param {string} serviceKey - 服务标识（用于区分同一 provider 下不同服务）
   * @returns {Object<string, ProviderFieldMapping>}
   */
  getProviderMappings(providerKey, serviceKey = null) {
    this._ensureInitialized();
    const provider = this._providerMappings.providers[providerKey];
    if (!provider) return {};

    // 检查是否有服务级别的映射
    if (serviceKey && provider.services?.[serviceKey]) {
      return provider.services[serviceKey].mappings;
    }

    return provider.mappings || {};
  }

  /**
   * 获取单个字段的 Provider 映射
   * @param {string} providerKey - 服务商标识
   * @param {string} fieldKey - 字段标识
   * @param {string} serviceKey - 服务标识
   * @returns {ProviderFieldMapping|null}
   */
  getProviderFieldMapping(providerKey, fieldKey, serviceKey = null) {
    const mappings = this.getProviderMappings(providerKey, serviceKey);
    return mappings[fieldKey] || null;
  }

  /**
   * 获取 Provider 的 API 结构类型
   * @param {string} providerKey - 服务商标识
   * @param {string} serviceKey - 服务标识
   * @returns {string} 'flat' | 'nested'
   */
  getProviderApiStructure(providerKey, serviceKey = null) {
    this._ensureInitialized();
    const provider = this._providerMappings.providers[providerKey];
    if (!provider) return 'flat';

    if (serviceKey && provider.services?.[serviceKey]) {
      return provider.services[serviceKey].apiStructure || 'flat';
    }

    return provider.apiStructure || 'flat';
  }

  // ==================== 字段来源追踪 ====================

  /**
   * 获取字段值的来源链
   * @param {string} serviceKey - 服务标识
   * @param {string} fieldKey - 字段标识
   * @param {string} operation - 操作类型
   * @returns {Object} 来源信息
   */
  traceFieldProvenance(serviceKey, fieldKey, operation = 'synthesize') {
    this._ensureInitialized();

    const provenance = {
      fieldKey,
      serviceKey,
      operation,
      sources: [],
      finalValue: null
    };

    // 1. 平台定义
    const platformField = this.getPlatformField(fieldKey);
    if (platformField) {
      provenance.sources.push({
        level: 'platform',
        source: 'platformDefault',
        value: platformField.platformDefault,
        description: '平台默认值'
      });
    }

    // 2. 服务覆盖
    const serviceOverride = this.getServiceFieldOverride(serviceKey, fieldKey, operation);
    if (serviceOverride) {
      if (serviceOverride.defaultOverride !== undefined) {
        provenance.sources.push({
          level: 'service',
          source: 'defaultOverride',
          value: serviceOverride.defaultOverride,
          description: '服务覆盖默认值'
        });
      }

      if (serviceOverride.status) {
        provenance.sources.push({
          level: 'service',
          source: 'status',
          value: serviceOverride.status,
          description: `支持状态: ${serviceOverride.status}`
        });
      }
    }

    // 计算最终值
    const lastSource = provenance.sources[provenance.sources.length - 1];
    if (lastSource?.source === 'defaultOverride') {
      provenance.finalValue = lastSource.value;
    } else if (platformField?.platformDefault !== undefined) {
      provenance.finalValue = platformField.platformDefault;
    }

    return provenance;
  }

  // ==================== 编译缓存管理 ====================

  /**
   * 清除编译缓存
   * @param {string} [serviceKey] - 指定服务，不传则清除全部
   */
  clearCompiledCache(serviceKey) {
    if (serviceKey) {
      this._compiledCache.delete(serviceKey);
    } else {
      this._compiledCache.clear();
    }
  }

  /**
   * 获取缓存的编译结果
   * @param {string} serviceKey - 服务标识
   * @returns {Object|null}
   */
  getCompiledCache(serviceKey) {
    return this._compiledCache.get(serviceKey) || null;
  }

  /**
   * 设置编译缓存
   * @param {string} serviceKey - 服务标识
   * @param {Object} compiled - 编译结果
   */
  setCompiledCache(serviceKey, compiled) {
    this._compiledCache.set(serviceKey, compiled);
  }

  // ==================== 工具方法 ====================

  _ensureInitialized() {
    if (!this._initialized) {
      this.initialize();
    }
  }

  /**
   * 获取注册表统计信息
   * @returns {Object}
   */
  getStats() {
    this._ensureInitialized();
    return {
      platformFieldsCount: Object.keys(this._platformFields.fields).length,
      servicesCount: Object.keys(this._serviceOverrides.services).length,
      providersCount: Object.keys(this._providerMappings.providers).length,
      compiledCacheSize: this._compiledCache.size
    };
  }

  /**
   * 重新加载所有配置
   */
  reload() {
    this._initialized = false;
    this._compiledCache.clear();
    this.initialize();
    console.log('[FieldDefinitionRegistry] 配置已重新加载');
  }
}

// 单例导出
const registry = new FieldDefinitionRegistry();

module.exports = {
  FieldDefinitionRegistry,
  registry
};
