/**
 * FieldDefinitionSystem - 字段定义系统入口
 *
 * 统一导出：
 * - FieldDefinitionRegistry - 字段定义注册表
 * - CapabilityCompiler - 能力编译器
 * - CompiledCapability - 编译产物类
 *
 * 使用方式：
 * ```javascript
 * const { getCompiledCapability } = require('./config/FieldDefinitionSystem');
 *
 * // 获取编译后的服务能力
 * const capability = getCompiledCapability('moss_tts', 'moss');
 *
 * // 获取默认值
 * const defaults = capability.getDefaults();
 *
 * // 校验参数
 * const { valid, errors } = capability.validate(params);
 *
 * // 映射到 Provider API
 * const providerParams = capability.mapToProvider(params, context);
 * ```
 */

const { registry, FieldDefinitionRegistry } = require('./FieldDefinitionRegistry');
const { CapabilityCompiler, SupportStatus } = require('./CapabilityCompiler');
const {
  CompiledCapability,
  createCompiledCapability,
  getCompiledCapability
} = require('./CompiledCapability');

// fail-fast 配置（可通过环境变量控制）
const FAIL_FAST = process.env.TTS_FIELD_SYSTEM_FAIL_FAST !== 'false';

/**
 * 初始化字段定义系统
 * 在服务启动时调用
 *
 * @param {Object} options - 配置选项
 * @param {boolean} [options.failFast] - 是否启用 fail-fast（默认 true）
 * @throws {Error} 编译失败时抛出（fail-fast 模式）
 */
function initialize(options = {}) {
  const failFast = options.failFast !== undefined ? options.failFast : FAIL_FAST;

  // 1. 加载配置文件
  registry.initialize();
  console.log('[FieldDefinitionSystem] 字段定义系统已初始化');

  // 2. 预编译所有服务
  const { results, errors } = CapabilityCompiler.compileAll();

  // 3. 处理编译错误
  if (errors.length > 0) {
    const errorMessage = errors.map(e => `[${e.serviceKey}] ${e.error}`).join('\n');

    if (failFast) {
      // fail-fast 模式：编译失败直接抛出
      throw new Error(
        `[FieldDefinitionSystem] 编译失败，服务启动中止:\n${errorMessage}`
      );
    } else {
      // 宽容模式：只打印警告
      console.warn('[FieldDefinitionSystem] 部分服务编译失败:\n' + errorMessage);
    }
  }

  console.log(`[FieldDefinitionSystem] 已编译 ${Object.keys(results).length} 个服务`);

  return { results, errors };
}

/**
 * 重新加载配置并重新编译
 */
function reload() {
  registry.reload();
  return CapabilityCompiler.compileAll();
}

/**
 * 获取注册表统计信息
 */
function getStats() {
  return registry.getStats();
}

module.exports = {
  // 核心类
  FieldDefinitionRegistry,
  CapabilityCompiler,
  CompiledCapability,

  // 便捷方法
  registry,
  initialize,
  reload,
  getStats,

  // 工厂方法
  createCompiledCapability,
  getCompiledCapability,

  // 常量
  SupportStatus
};
