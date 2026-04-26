/**
 * ConfigConsistencyChecker - 启动配置审计器
 *
 * 检查 manifest 配置完整性。
 * mode: strict (冲突抛错) | migration (只 warn)
 *
 * 每次 audit() 调用时动态读取 CONFIG_MODE，避免模块加载时机捕获。
 */

function audit(logger = console) {
  const mode = process.env.CONFIG_MODE || 'strict';
  logger.log('\n========== [CONFIG AUDIT] ==========');
  logger.log(`Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
  logger.log();

  const { ProviderManifest } = require('../providers/manifests/ProviderManifest');
  const warnings = [];
  const serviceKeys = ProviderManifest.getAllServiceKeys();

  logger.log(`Services: ${serviceKeys.length}`);

  let totalParams = 0, lockedLostValue = 0;
  for (const k of serviceKeys) {
    const svc = ProviderManifest.getServiceConfig(k);
    const params = svc?.parameters || {};
    totalParams += Object.keys(params).length;

    for (const [pk, p] of Object.entries(params)) {
      if (p.status === 'locked' && !p.lockedValue && !p.source) {
        const msg = `[CONFIG WARN] ${k}.${pk}: locked but no lockedValue or source`;
        warnings.push(msg);
        logger.log('  ⚠️ ' + msg);
        lockedLostValue++;
      }
    }
  }

  const providerKeys = ProviderManifest.getAllProviders().map(p => p.key);
  logger.log(`Providers: ${providerKeys.length} (${providerKeys.join(', ')})`);
  logger.log(`Total parameters defined: ${totalParams}`);
  logger.log(`Summary: ${warnings.length} warning(s), ${lockedLostValue} locked params missing value`);
  logger.log('======================================\n');

  if (mode === 'strict' && warnings.length > 0) {
    throw new Error('CONFIG_MODE=strict: config issues found. Fix them or use migration mode.');
  }

  return { warnings: warnings.length, lockedMissingValue: lockedLostValue };
}

module.exports = { audit };
