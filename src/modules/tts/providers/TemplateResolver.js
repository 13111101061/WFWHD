/**
 * TemplateResolver — 声明式模板引擎
 *
 * 从 manifest.json 的 api.headers / api.bodyTemplate 驱动，
 * 将 ${...} 占位符替换为上下文中的值。
 *
 * 规则：
 *   1. 纯占位符 "${path}"         → 返回原始类型（string/number/object/array/null）
 *   2. 混合占位符 "Bearer ${path}" → 内插为字符串
 *   3. 多占位符 "a${x}b${y}"       → 依次内插
 *   4. undefined 值               → 纯占位符返回 undefined（由 caller 决定是否剔除）
 *   5. 混合/多占位符中 undefined   → 内插为空字符串 ""
 *   6. 对象/数组                   → 递归处理每个节点
 *   7. 对象结果                    → 剔除值为 undefined/null/"" 的键
 *
 * 使用方式：
 *   const resolver = new TemplateResolver();
 *   resolver.resolve(template, { credential, params, text });
 */

class TemplateResolver {
  /**
   * @param {Object} [options]
   * @param {string[]} [options.omitValues] - 需要从对象结果中剔除的值列表
   */
  constructor(options = {}) {
    this._omitValues = new Set(options.omitValues ?? [undefined, null, '']);
  }

  /**
   * 递归解析模板节点
   *
   * @param {*}          node    - 模板节点（string/object/array/primitive）
   * @param {Object}     context - 变量上下文 { credential, params, text, ... }
   * @returns {*}                 解析后的值
   */
  resolve(node, context) {
    if (typeof node === 'string') return this._resolveString(node, context);
    if (Array.isArray(node)) return node.map(v => this.resolve(v, context));
    if (node && typeof node === 'object') return this._resolveObject(node, context);
    return node;
  }

  /**
   * 仅解析字符串中的占位符，不改变原始类型
   *
   * 纯占位符 "${foo.bar}" → _navigate(context, ['foo', 'bar']) → 可能返回任意类型
   * 混合占位符 → 替换为字符串片段，对象值 JSON.stringify
   */
  _resolveString(str, context) {
    if (!str.includes('${')) return str;

    const pure = this._extractPurePath(str);
    if (pure !== null) {
      const value = this._navigate(context, pure.split('.'));
      return value !== undefined ? value : undefined;
    }

    return str.replace(/\$\{([^}]+)\}/g, (_, path) => {
      const value = this._navigate(context, path.split('.'));
      if (value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    });
  }

  /**
   * 递归解析对象，剔除空值键
   */
  _resolveObject(obj, context) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const resolved = this.resolve(value, context);
      if (!this._omitValues.has(resolved)) {
        result[key] = resolved;
      }
    }
    return result;
  }

  /**
   * 检测纯占位符：字符串恰好是 "${xxx}"，不含其他文本
   * 返回路径字符串或 null
   */
  _extractPurePath(str) {
    if (!str.startsWith('${') || !str.endsWith('}')) return null;
    if (str.indexOf('${', 2) !== -1) return null;
    return str.slice(2, -1);
  }

  /**
   * 沿路径取值：_navigate({ credential: { apiKey: 'sk-...' } }, ['credential', 'apiKey']) → 'sk-...'
   */
  _navigate(obj, path) {
    let current = obj;
    for (const segment of path) {
      if (current == null) return undefined;
      current = current[segment];
    }
    return current !== undefined ? current : undefined;
  }
}

module.exports = TemplateResolver;