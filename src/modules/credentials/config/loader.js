/**
 * ConfigLoader - YAML 配置加载器
 *
 * 加载 credentials/sources/providers/*.yaml 配置文件
 */

const fs = require('fs');
const path = require('path');
const { parseObject, parseCredentials } = require('../utils/envParser');

// 尝试加载 yaml 库
let yaml;
try {
  yaml = require('js-yaml');
} catch (e) {
  // yaml 库未安装，将在加载时提示
}

/**
 * 检查是否有 yaml 配置目录
 */
function hasYamlConfig() {
  const configDir = getConfigDir();
  return fs.existsSync(configDir);
}

/**
 * 获取配置目录路径
 */
function getConfigDir() {
  // 相对于项目根目录
  return path.join(process.cwd(), 'credentials', 'sources', 'providers');
}

/**
 * 加载单个 YAML 文件
 * @param {string} filePath - 文件路径
 * @returns {Object|null} - 解析后的配置
 */
function loadYamlFile(filePath) {
  if (!yaml) {
    console.warn('[ConfigLoader] js-yaml not installed, skipping YAML config');
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const config = yaml.load(content);
    return parseObject(config);
  } catch (error) {
    console.error(`[ConfigLoader] Failed to load ${filePath}:`, error.message);
    return null;
  }
}

/**
 * 加载所有 provider 配置
 * @returns {Map<string, Object>} - provider key -> config
 */
function loadAllProviders() {
  const providers = new Map();

  if (!hasYamlConfig()) {
    return providers;
  }

  if (!yaml) {
    console.warn('[ConfigLoader] js-yaml not installed, using .env fallback');
    return providers;
  }

  const configDir = getConfigDir();
  const files = fs.readdirSync(configDir).filter(f => f.endsWith('.yaml'));

  for (const file of files) {
    const filePath = path.join(configDir, file);
    const config = loadYamlFile(filePath);

    if (config && config.meta && config.meta.provider) {
      const providerKey = config.meta.provider;

      providers.set(providerKey, {
        key: providerKey,
        name: config.meta.name,
        description: config.meta.description,
        selector: config.meta.selector || 'priority',
        circuitBreaker: config.meta.circuitBreaker || {
          enabled: true,
          failureThreshold: 5,
          resetTimeout: 60000
        },
        requiredFields: config.requiredFields || [],
        accounts: (config.accounts || []).map(account => ({
          id: account.id,
          name: account.name,
          credentials: parseCredentials(account.credentials || {}),
          services: account.services || [],
          priority: account.priority || 100,
          weight: account.weight || 1,
          enabled: account.enabled !== false,
          metadata: account.metadata || {}
        }))
      });
    }
  }

  return providers;
}

/**
 * 将 .env 配置转换为单账号格式
 * 用于向后兼容
 * @param {string} providerKey - 服务商标识
 * @param {Object} credentials - 凭证
 * @param {Object} services - 服务列表
 * @returns {Object} - 单账号配置
 */
function createDefaultAccount(providerKey, credentials, services) {
  // 过滤无效凭证
  const validCredentials = {};
  let hasValidCreds = false;

  for (const [key, value] of Object.entries(credentials)) {
    if (value && typeof value === 'string' && value.length > 0) {
      validCredentials[key] = value;
      hasValidCreds = true;
    }
  }

  if (!hasValidCreds) {
    return null;
  }

  return {
    key: providerKey,
    selector: 'priority',
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      resetTimeout: 60000
    },
    accounts: [{
      id: 'default',
      name: '默认账号',
      credentials: validCredentials,
      services: Object.keys(services || {}),
      priority: 1,
      weight: 1,
      enabled: true,
      metadata: {
        description: '从 .env 自动创建的默认账号',
        source: 'env'
      }
    }]
  };
}

module.exports = {
  hasYamlConfig,
  getConfigDir,
  loadYamlFile,
  loadAllProviders,
  createDefaultAccount
};