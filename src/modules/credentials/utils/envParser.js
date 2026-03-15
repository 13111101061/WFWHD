/**
 * envParser - 环境变量解析工具
 *
 * 支持 ${VAR} 和 ${VAR:-default} 语法
 */

/**
 * 解析环境变量引用
 * 支持格式:
 *   ${VAR}           - 直接引用
 *   ${VAR:-default}  - 带默认值
 *
 * @param {string} value - 要解析的值
 * @returns {string|null} - 解析后的值
 */
function parseEnvRef(value) {
  if (typeof value !== 'string') {
    return value;
  }

  // 匹配 ${VAR} 或 ${VAR:-default}
  const envRefPattern = /\$\{([^}]+)\}/g;

  return value.replace(envRefPattern, (match, expr) => {
    // 检查是否有默认值
    const colonIndex = expr.indexOf(':-');

    if (colonIndex !== -1) {
      const varName = expr.substring(0, colonIndex).trim();
      const defaultValue = expr.substring(colonIndex + 2).trim();
      return process.env[varName] || defaultValue;
    }

    // 没有默认值
    const varName = expr.trim();
    const envValue = process.env[varName];

    if (envValue === undefined) {
      return '';
    }

    return envValue;
  });
}

/**
 * 递归解析对象中的所有环境变量引用
 * @param {Object} obj - 要解析的对象
 * @returns {Object} - 解析后的对象
 */
function parseObject(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return parseEnvRef(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => parseObject(item));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = parseObject(value);
  }

  return result;
}

/**
 * 过滤占位符值
 * @param {string} value - 要检查的值
 * @returns {string|null} - 过滤后的值
 */
function filterPlaceholder(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }

  const placeholders = [
    'your-',
    'placeholder',
    'xxx',
    'test-',
    'demo-',
    '<',
    '>'
  ];

  const lowerValue = value.toLowerCase();

  if (placeholders.some(p => lowerValue.startsWith(p))) {
    return null;
  }

  // 检查是否看起来像真实 API Key
  // 通常真实 key 至少有 20 个字符
  if (value.length < 10) {
    return null;
  }

  return value;
}

/**
 * 解析凭证对象，过滤无效值
 * @param {Object} credentials - 凭证对象
 * @returns {Object} - 解析后的凭证
 */
function parseCredentials(credentials) {
  if (!credentials || typeof credentials !== 'object') {
    return {};
  }

  const result = {};

  for (const [key, value] of Object.entries(credentials)) {
    const parsed = parseEnvRef(value);
    const filtered = filterPlaceholder(parsed);

    if (filtered !== null && filtered !== undefined && filtered !== '') {
      result[key] = filtered;
    }
  }

  return result;
}

module.exports = {
  parseEnvRef,
  parseObject,
  filterPlaceholder,
  parseCredentials
};