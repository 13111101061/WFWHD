/**
 * ProviderManifest - 服务商配置加载器
 *
 * 从 providers/<provider>/manifest.json 加载统一配置。
 * 这是服务商配置的唯一事实源。
 *
 * 新增服务商只需：在 providers/<服务商>/ 下创建 manifest.json + Adapter.js
 */

const fs = require('fs');
const path = require('path');

// 扫描 providers/ 目录（manifest.js 的同级目录），跳过本目录
const PROVIDERS_DIR = path.join(__dirname, '..');

let manifests = null;
let _serviceIndex = null;
let _providerIndex = null;

const MANIFEST_REQUIRED_FIELDS = {
  root: ['providerKey', 'provider', 'services', 'voiceCode'],
  provider: ['displayName', 'description'],
  service: ['displayName', 'protocol'],
  voiceCode: ['providerCode', 'serviceKey']
};

function _validateManifest(data, manifestPath) {
  const errors = [];
  const dirName = path.basename(path.dirname(manifestPath));

  for (const field of MANIFEST_REQUIRED_FIELDS.root) {
    if (!data[field]) {
      errors.push(`providers/${dirName}/manifest.json: missing required field "${field}"`);
    }
  }

  if (data.provider) {
    for (const field of MANIFEST_REQUIRED_FIELDS.provider) {
      if (!data.provider[field]) {
        errors.push(`providers/${dirName}/manifest.json: missing provider.${field}`);
      }
    }
  }

  if (data.services) {
    for (const [svcKey, svc] of Object.entries(data.services)) {
      for (const field of MANIFEST_REQUIRED_FIELDS.service) {
        if (!svc[field]) {
          errors.push(`providers/${dirName}/manifest.json: services.${svcKey} missing ${field}`);
        }
      }
      if (!svc.adapter && !svc.api) {
        errors.push(`providers/${dirName}/manifest.json: services.${svcKey} must have "adapter" or "api"`);
      }
    }
  }

  if (data.voiceCode) {
    for (const field of MANIFEST_REQUIRED_FIELDS.voiceCode) {
      if (!data.voiceCode[field]) {
        errors.push(`providers/${dirName}/manifest.json: voiceCode missing ${field}`);
      }
    }
    if (data.voiceCode.providerCode && !/^\d{3}$/.test(data.voiceCode.providerCode)) {
      errors.push(`providers/${dirName}/manifest.json: voiceCode.providerCode must be 3-digit string (got "${data.voiceCode.providerCode}")`);
    }
  }

  return errors;
}

function loadAllManifests() {
  if (manifests !== null) return manifests;

  manifests = new Map();
  _serviceIndex = new Map();
  _providerIndex = new Map();
  const providerCodeSeen = new Map();

  const entries = fs.readdirSync(PROVIDERS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'manifests' || entry.name.startsWith('.')) continue;
    if (entry.name === 'ProviderManifest') continue;

    const manifestPath = path.join(PROVIDERS_DIR, entry.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.warn(`[ProviderManifest] No manifest.json in providers/${entry.name}`);
      continue;
    }

    try {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const data = JSON.parse(raw);

      const validationErrors = _validateManifest(data, manifestPath);
      if (validationErrors.length > 0) {
        for (const e of validationErrors) {
          console.error(`[ProviderManifest] VALIDATION: ${e}`);
        }
        if (process.env.CONFIG_MODE !== 'migration') {
          throw new Error(`Manifest validation failed:\n  ${validationErrors.join('\n  ')}`);
        }
      }

      const providerKey = data.providerKey || entry.name;

      if (data.voiceCode?.providerCode) {
        const prev = providerCodeSeen.get(data.voiceCode.providerCode);
        if (prev) {
          const msg = `[ProviderManifest] DUPLICATE providerCode "${data.voiceCode.providerCode}": ${prev} vs ${providerKey}`;
          console.error(msg);
          if (process.env.CONFIG_MODE !== 'migration') throw new Error(msg);
        }
        providerCodeSeen.set(data.voiceCode.providerCode, providerKey);
      }

      manifests.set(providerKey, data);
      _providerIndex.set(providerKey, data);

      if (data.services) {
        for (const [serviceKey, svc] of Object.entries(data.services)) {
          _serviceIndex.set(serviceKey, { providerKey, ...svc, _canonicalKey: serviceKey });
          if (Array.isArray(svc.aliases)) {
            for (const alias of svc.aliases) {
              _serviceIndex.set(alias, { providerKey, ...svc, _canonicalKey: serviceKey });
            }
          }
        }
      }
    } catch (err) {
      console.error(`[ProviderManifest] Failed to load ${manifestPath}: ${err.message}`);
      throw err;
    }
  }

  console.log(`[ProviderManifest] Loaded ${manifests.size} providers`);
  return manifests;
}

/**
 * 公共参数遍历器 — 遍历 svc.parameters 并为每个参数调用 visitor
 * getFieldMappings 和 getFieldOverrides 共用此遍历逻辑
 *
 * @param {string} serviceKey
 * @param {Function} visitor - (key, paramDef) => entry | null
 * @returns {Object} entries by key
 */
function _traverseParams(serviceKey, visitor) {
  const svc = ProviderManifest.getServiceConfig(serviceKey);
  const params = svc?.parameters || {};
  const entries = {};
  for (const [k, p] of Object.entries(params)) {
    const entry = visitor(k, p);
    if (entry !== null) entries[k] = entry;
  }
  return entries;
}

const ProviderManifest = {

  _ensureLoaded() {
    if (manifests === null) loadAllManifests();
  },

  getWarnings() { return []; },

  // ====== Service-level ======

  getServiceConfig(serviceKey) {
    this._ensureLoaded();
    return _serviceIndex.get(serviceKey) || null;
  },

  resolveCanonicalKey(serviceKey) {
    this._ensureLoaded();
    const e = _serviceIndex.get(serviceKey);
    return e?._canonicalKey || null;
  },

  getAllServiceKeys() {
    this._ensureLoaded();
    const keys = [];
    for (const [k, v] of _serviceIndex.entries()) {
      if (v._canonicalKey === k) keys.push(k);
    }
    return [...new Set(keys)];
  },

  buildAliasMap() {
    this._ensureLoaded();
    const m = new Map();
    for (const [k, v] of _serviceIndex.entries()) {
      m.set(k, v._canonicalKey || k);
    }
    return m;
  },

  // ====== Provider-level ======

  getProviderMeta(providerKey) {
    this._ensureLoaded();
    const m = _providerIndex.get(providerKey);
    return m?.provider || null;
  },

  getAllProviders() {
    this._ensureLoaded();
    return Array.from(_providerIndex.entries()).map(([k, v]) => ({
      key: k,
      ...v.provider
    }));
  },

  getProviderServices(providerKey) {
    this._ensureLoaded();
    const m = _providerIndex.get(providerKey);
    if (!m?.services) return [];
    return Object.entries(m.services).map(([k, v]) => ({ key: k, providerKey, ...v }));
  },

  // ====== Capability ======

  getCapabilityConfig(serviceKey) {
    const svc = this.getServiceConfig(serviceKey);
    if (!svc) return null;
    return {
      displayName: svc.displayName,
      provider: svc.providerKey,
      service: svc._canonicalKey,
      capabilities: svc.capabilities || {},
      defaults: svc.defaults || {},
      parameters: svc.parameters || {},
      lockedParams: svc.lockedParams || ['voice', 'model'],
      defaultVoiceId: svc.defaultVoiceId || null,
      status: svc.status || 'stable'
    };
  },

  // ====== Unified parameter access ======

  getParameterDef(serviceKey, paramName) {
    const svc = this.getServiceConfig(serviceKey);
    if (!svc?.parameters) return null;
    return svc.parameters[paramName] || null;
  },

  getParameters(serviceKey) {
    const svc = this.getServiceConfig(serviceKey);
    return svc?.parameters || {};
  },

  /** 获取参数映射（公共遍历器生成） */
  getFieldMappings(providerKey, serviceKey) {
    const svc = this.getServiceConfig(serviceKey);
    const mappings = _traverseParams(serviceKey, (k, p) => {
      if (!p.mapTo && p.status !== 'unsupported' && !p.nested) return null;
      return {
        providerPath: p.mapTo || undefined,
        transform: p.status === 'unsupported' ? 'ignore'
          : p.transform || (p.mapTo && p.mapTo !== k ? 'rename' : 'direct'),
        transformConfig: p.transformConfig || null,
        source: p.source || null,
        valueTransform: p.valueTransform || null,
        nestedMappings: p.nested ? Object.fromEntries(
          Object.entries(p.nested).map(([nk, nv]) => [nk, { providerPath: nv.mapTo || nk }])
        ) : undefined
      };
    });
    return {
      mappings,
      apiStructure: svc?.apiStructure || 'flat',
      basePath: svc?.basePath || null
    };
  },

  /** 获取字段覆盖（公共遍历器生成） */
  getFieldOverrides(serviceKey) {
    return _traverseParams(serviceKey, (k, p) => {
      const entry = { status: p.status || 'supported', reason: p.reason || '' };
      if (p.status === 'locked') {
        entry.lockedValue = p.lockedValue;
        entry.lockedValueSource = p.source;
      }
      if (p.default !== undefined) entry.defaultOverride = p.default;
      if (p.range) entry.rangeOverride = Array.isArray(p.range)
        ? { min: p.range[0], max: p.range[1] } : p.range;
      if (p.values) entry.validationOverride = { enum: p.values };
      if (p.ui) entry.ui = p.ui;
      if (p.nested) {
        entry.nestedFields = {};
        for (const [nk, nv] of Object.entries(p.nested)) {
          entry.nestedFields[nk] = {
            status: 'supported',
            ...(nv.default !== undefined ? { defaultOverride: nv.default } : {}),
            ...(nv.range ? { rangeOverride: Array.isArray(nv.range) ? { min: nv.range[0], max: nv.range[1] } : nv.range } : {})
          };
        }
      }
      return entry;
    });
  },

  getAllServiceDescriptors() {
    return this.getAllServiceKeys().map(key => this.getServiceConfig(key)).filter(Boolean);
  },

  // ====== VoiceCode ======

  getVoiceCodeConfig(providerKey) {
    this._ensureLoaded();
    const m = _providerIndex.get(providerKey);
    return m?.voiceCode || null;
  },

  getAllVoiceCodeMappings() {
    this._ensureLoaded();
    const mappings = {};
    for (const [pk, m] of _providerIndex.entries()) {
      if (m.voiceCode?.providerCode) {
        mappings[m.voiceCode.providerCode] = {
          providerKey: pk,
          serviceKey: m.voiceCode.serviceKey,
          displayName: m.provider?.displayName
        };
      }
    }
    return mappings;
  },

  // ====== Stats ======

  getStats() {
    const svcKeys = this.getAllServiceKeys();
    const byStatus = {}, byProvider = {}, byProtocol = {};
    for (const k of svcKeys) {
      const s = this.getServiceConfig(k);
      if (!s) continue;
      const st = s.status || 'unknown';
      byStatus[st] = (byStatus[st] || 0) + 1;
      byProvider[s.providerKey] = (byProvider[s.providerKey] || 0) + 1;
      byProtocol[s.protocol || 'unknown'] = (byProtocol[s.protocol || 'unknown'] || 0) + 1;
    }
    return { totalProviders: manifests.size, totalServices: svcKeys.length, byStatus, byProvider, byProtocol };
  },

  reload() {
    manifests = null; _serviceIndex = null; _providerIndex = null;
    loadAllManifests();
    console.log('[ProviderManifest] Reloaded');
  }
};

module.exports = { ProviderManifest, loadAllManifests };