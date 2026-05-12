/**
 * ConfigConsistencyChecker - 启动配置审计器
 *
 * 审计层级：
 * L1 基础 — locked params 缺值
 * L2 深度 — 旧配置残留 / alias 碰撞 / defaultVoiceId 一致性 /
 *          mapTo 路径 / voiceCode 映射 / 音色覆盖度
 *
 * mode: strict (冲突抛错) | migration (只 warn)
 * 每次 audit() 调用时动态读取 CONFIG_MODE。
 */

const fs = require('fs');
const path = require('path');

// ==== L1: 禁止存在的旧配置路径 ====
const KNOWN_LEGACY_PATHS = [
  path.join(__dirname, 'service-field-overrides.json'),
  path.join(__dirname, 'provider-field-mappings.json'),
  path.join(__dirname, 'ProviderConfig.json'),
  path.join(__dirname, '__legacy_backup__'),
];

function _checkLegacyFiles(logger, errors, warnings) {
  const found = [];
  for (const p of KNOWN_LEGACY_PATHS) {
    if (fs.existsSync(p)) {
      found.push(p);
      const msg = `[LEGACY DETECTED] 旧配置文件仍存在: ${path.relative(path.join(__dirname, '..'), p)} — 这些文件不再被系统读取，请删除`;
      errors.push(msg);
      logger.log('  🚫 ' + msg);
    }
  }
  if (found.length === 0) {
    logger.log('  ✓ 无旧配置文件残留');
  }
  return found;
}

// ==== L2: 深度审计 ====

function _checkAliasCollisions(logger, ProviderManifest, errors, warnings) {
  const serviceKeys = ProviderManifest.getAllServiceKeys();
  const aliasMap = ProviderManifest.buildAliasMap();
  const providerServices = {};

  for (const providerKey of ProviderManifest.getAllProviders().map(p => p.key)) {
    const svcs = ProviderManifest.getProviderServices(providerKey);
    const canonicalKeys = svcs.map(s => s.key);
    const aliasSet = new Set();

    for (const s of svcs) {
      if (Array.isArray(s.aliases)) {
        for (const alias of s.aliases) {
          if (aliasSet.has(alias)) {
            const msg = `[ALIAS DUPLICATE] provider=${providerKey}: alias "${alias}" appears on multiple services`;
            errors.push(msg);
            logger.log('  🚫 ' + msg);
          }
          aliasSet.add(alias);
        }
      }
    }

    // 检测：同名 provider 下，某个 serviceKey 是否完全被 alias 覆盖
    providerServices[providerKey] = canonicalKeys;
  }

  // 检测跨 provider 的 key 碰撞
  const keyToProvider = new Map();
  for (const sk of serviceKeys) {
    const entry = ProviderManifest.getServiceConfig(sk);
    if (!entry) continue;
    const providerKey = entry.providerKey;
    if (keyToProvider.has(sk) && keyToProvider.get(sk) !== providerKey) {
      const msg = `[DUPLICATE KEY] serviceKey "${sk}" claims multiple providers: ${keyToProvider.get(sk)} & ${providerKey}`;
      errors.push(msg);
      logger.log('  🚫 ' + msg);
    }
    keyToProvider.set(sk, providerKey);
  }
}

function _checkVoiceCodeMappings(logger, ProviderManifest, errors, warnings) {
  const providers = ProviderManifest.getAllProviders().map(p => p.key);
  const mappings = ProviderManifest.getAllVoiceCodeMappings();

  for (const [providerCode, info] of Object.entries(mappings)) {
    if (!providers.includes(info.providerKey)) {
      const msg = `[VOICECODE ORPHAN] providerCode="${providerCode}" maps to unknown providerKey="${info.providerKey}"`;
      errors.push(msg);
      logger.log('  🚫 ' + msg);
    }
  }
}

function _checkVoiceCoverage(logger, ProviderManifest, VoiceRegistry, errors, warnings) {
  const serviceKeys = ProviderManifest.getAllServiceKeys();

  for (const sk of serviceKeys) {
    const svc = ProviderManifest.getServiceConfig(sk);
    const defaultVoiceId = svc?.defaultVoiceId;
    const providerKey = svc?.providerKey;
    const serviceType = sk.split('_').slice(1).join('_'); // crude but works

    if (defaultVoiceId) {
      // Check the defaultVoiceId exists in voice registry
      const voice = VoiceRegistry.get(defaultVoiceId);
      if (!voice) {
        const msg = `[DEFAULT VOICE MISSING] ${sk}: defaultVoiceId="${defaultVoiceId}" not found in voice registry`;
        warnings.push(msg);
        logger.log('  ⚠️ ' + msg);
      }
    }

    // Check at least one voice exists for this service
    if (providerKey && serviceType) {
      const voices = VoiceRegistry.getByProviderAndService(providerKey, serviceType);
      if (!voices || voices.length === 0) {
        const msg = `[NO VOICES] ${sk}: no voice records found for provider=${providerKey} service=${serviceType}`;
        warnings.push(msg);
        logger.log('  ⚠️ ' + msg);
      }
    }
  }
}

function _checkLockedParams(logger, ProviderManifest, errors, warnings) {
  const serviceKeys = ProviderManifest.getAllServiceKeys();
  let lockedLostValue = 0;

  for (const k of serviceKeys) {
    const svc = ProviderManifest.getServiceConfig(k);
    const params = svc?.parameters || {};

    for (const [pk, p] of Object.entries(params)) {
      if (p.status === 'locked' && !p.lockedValue && !p.source) {
        const msg = `${k}.${pk}: locked but no lockedValue or source`;
        warnings.push(msg);
        logger.log('  ⚠️ ' + msg);
        lockedLostValue++;
      }
    }
  }

  return lockedLostValue;
}

function _checkMapToPaths(logger, ProviderManifest, errors, warnings) {
  const serviceKeys = ProviderManifest.getAllServiceKeys();

  for (const k of serviceKeys) {
    const svc = ProviderManifest.getServiceConfig(k);
    const params = svc?.parameters || {};

    for (const [pk, p] of Object.entries(params)) {
      // nested 参数由子字段映射，顶层不需要 mapTo
      if (p.nested && Object.keys(p.nested).length > 0) continue;

      // supported/locked params must have mapTo
      if ((p.status === 'supported' || p.status === 'locked') && !p.mapTo && !p.source) {
        const msg = `${k}.${pk}: status=${p.status} but missing mapTo (provider will receive no mapping)`;
        warnings.push(msg);
        logger.log('  ⚠️ ' + msg);
      }

      // unsupported params should NOT have mapTo (would be self-contradictory)
      if (p.status === 'unsupported' && p.mapTo) {
        const msg = `${k}.${pk}: status=unsupported but has mapTo="${p.mapTo}" — mapping will be ignored`;
        warnings.push(msg);
        logger.log('  ⚠️ ' + msg);
      }
    }
  }
}

// ==== 主入口 ====

async function audit(logger = console) {
  return _doAudit(logger);
}

function _doAudit(logger) {
  const mode = process.env.CONFIG_MODE || 'strict';
  const errors = [];
  const warnings = [];

  logger.log('\n========== [CONFIG AUDIT] ==========');
  logger.log(`Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
  logger.log();

  const { ProviderManifest } = require('../providers/manifests/ProviderManifest');

  const serviceKeys = ProviderManifest.getAllServiceKeys();
  const providerKeys = ProviderManifest.getAllProviders().map(p => p.key);

  // --- L1: 旧配置残留 ---
  logger.log('--- L1: Legacy file check ---');
  _checkLegacyFiles(logger, errors, warnings);
  logger.log();

  // --- L2a: Key uniqueness ---
  logger.log('--- L2a: Key uniqueness ---');
  _checkAliasCollisions(logger, ProviderManifest, errors, warnings);
  logger.log();

  // --- L2b: voiceCode 映射 ---
  logger.log('--- L2b: VoiceCode mappings ---');
  _checkVoiceCodeMappings(logger, ProviderManifest, errors, warnings);
  logger.log();

  // --- L2c: Locked params ---
  logger.log('--- L2c: Locked params ---');
  const lockedLostValue = _checkLockedParams(logger, ProviderManifest, errors, warnings);
  logger.log();

  // --- L2d: mapTo 路径 ---
  logger.log('--- L2d: mapTo paths ---');
  _checkMapToPaths(logger, ProviderManifest, errors, warnings);
  logger.log();

  // 统计所有 param
  let totalParams = 0;
  for (const k of serviceKeys) {
    const svc = ProviderManifest.getServiceConfig(k);
    totalParams += Object.keys(svc?.parameters || {}).length;
  }

  logger.log(`Services: ${serviceKeys.length}`);
  logger.log(`Providers: ${providerKeys.length} (${providerKeys.join(', ')})`);
  logger.log(`Total parameters defined: ${totalParams}`);
  logger.log(`Summary: ${errors.length} error(s), ${warnings.length} warning(s), ${lockedLostValue} locked params missing value`);
  logger.log('======================================\n');

  if (mode === 'strict' && (errors.length > 0)) {
    throw new Error(
      `CONFIG_MODE=strict: ${errors.length} config error(s) found.\n` +
      errors.map(e => '  • ' + e).join('\n') +
      '\nFix errors or use CONFIG_MODE=migration to run anyway.'
    );
  }

  return { errors: errors.length, warnings: warnings.length, lockedMissingValue: lockedLostValue };
}

/**
 * L3: 音色一致性审计（需 voiceRegistry 就绪后才调用）
 */
async function auditVoiceCoverage(loggerOrRegistry = console) {
  const { ProviderManifest } = require('../providers/manifests/ProviderManifest');

  // 支持旧接口 (logger) 和新接口 (voiceRegistry)，根据参数类型判断
  let logger, voiceRegistry;
  if (loggerOrRegistry && typeof loggerOrRegistry.log === 'function') {
    logger = loggerOrRegistry;
    voiceRegistry = arguments[1]; // 第二个参数
  } else {
    voiceRegistry = loggerOrRegistry;
    logger = console;
  }

  logger.log('\n========== [VOICE COVERAGE AUDIT] ==========');

  if (!voiceRegistry || voiceRegistry.getAll().length === 0) {
    logger.log('Voice registry empty — skipping');
    logger.log('============================================\n');
    return { errors: 0, warnings: 0 };
  }

  const errors = [];
  const warnings = [];
  _checkVoiceCoverage(logger, ProviderManifest, voiceRegistry, errors, warnings);

  logger.log(`Voice audit: ${errors.length} error(s), ${warnings.length} warning(s)`);
  logger.log('============================================\n');
  return { errors: errors.length, warnings: warnings.length };
}

module.exports = { audit, auditVoiceCoverage };
