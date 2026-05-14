/**
 * VoiceCodeGenerator - 音色编码生成与校验工具 (v2.0 简化版)
 *
 * 职责：
 * - 生成 15 位 voice_code（PPP VVVVV RRRRRR C）
 * - Luhn 校验位计算与验证
 * - voice_code 解析（提取服务商、音色序号）
 *
 * 编码格式（v2.0 简化版）：
 * - PPP (3位)：服务商编码
 * - VVVVV (5位)：音色业务编号 (00001-99999)
 * - RRRRRR (6位)：预留位（固定 000000）
 * - C (1位)：Luhn 校验位
 *
 * 重要规则：
 * - 所有 ID 统一按字符串处理，禁止转 Number（会丢前导零和精度）
 * - providerCode 映射从 ProviderManifest 动态读取（manifest.json 是唯一事实源）
 */

const voiceCodeConfig = require('./VoiceCodeConfig.json');

const RESERVED = '000000';

let _mappingsBuilt = false;
let providerKeyToCode = null;
let providerKeyToService = null;
let providerCodeToInfo = null;

function _ensureMappings() {
  if (_mappingsBuilt) return;

  const { ProviderManifest } = require('../providers/manifests/ProviderManifest');
  ProviderManifest._ensureLoaded();

  providerKeyToCode = {};
  providerKeyToService = {};
  providerCodeToInfo = {};

  const mappings = ProviderManifest.getAllVoiceCodeMappings();
  for (const [code, info] of Object.entries(mappings)) {
    providerKeyToCode[info.providerKey] = code;
    providerKeyToService[info.providerKey] = info.serviceKey;
    providerCodeToInfo[code] = info;
  }

  _mappingsBuilt = true;
}

function calcLuhnCheckDigit(digits) {
  let sum = 0;
  let alternate = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }

  return String((10 - (sum % 10)) % 10);
}

function validateLuhn(code) {
  if (typeof code !== 'string' || code.length !== 15) return false;
  if (!/^\d{15}$/.test(code)) return false;

  const dataPart = code.substring(0, 14);
  const checkDigit = code[14];
  return calcLuhnCheckDigit(dataPart) === checkDigit;
}

const VoiceCodeGenerator = {
  generate({ providerKey, voiceNumber }) {
    _ensureMappings();
    const providerCode = providerKeyToCode[providerKey];
    if (!providerCode) {
      throw new Error(`Unknown providerKey: ${providerKey}`);
    }

    if (!Number.isInteger(voiceNumber) || voiceNumber < 1 || voiceNumber > 99999) {
      throw new Error(`voiceNumber must be between 1 and 99999`);
    }

    const voicePart = String(voiceNumber).padStart(5, '0');
    const dataPart = `${providerCode}${voicePart}${RESERVED}`;
    const checkDigit = calcLuhnCheckDigit(dataPart);

    return `${dataPart}${checkDigit}`;
  },

  parse(voiceCode) {
    if (typeof voiceCode !== 'string' || voiceCode.length !== 15) return null;
    if (!/^\d{15}$/.test(voiceCode)) return null;
    if (!validateLuhn(voiceCode)) return null;

    _ensureMappings();

    const providerCode = voiceCode.substring(0, 3);
    const voiceNumber = voiceCode.substring(3, 8);
    const reserved = voiceCode.substring(8, 14);
    const checkDigit = voiceCode[14];

    const providerInfo = providerCodeToInfo[providerCode];

    return {
      voiceCode,
      providerCode,
      providerKey: providerInfo?.providerKey || null,
      serviceKey: providerInfo?.serviceKey || null,
      providerDisplayName: providerInfo?.displayName || null,
      voiceNumber: parseInt(voiceNumber, 10),
      reserved,
      checkDigit,
      valid: true
    };
  },

  isValid(voiceCode) {
    return validateLuhn(voiceCode);
  },

  buildDataPart({ providerKey, voiceNumber }) {
    _ensureMappings();
    const providerCode = providerKeyToCode[providerKey];
    if (!providerCode) {
      throw new Error(`Unknown providerKey: ${providerKey}`);
    }
    const voicePart = String(voiceNumber).padStart(5, '0');
    return `${providerCode}${voicePart}${RESERVED}`;
  },

  getConfig() {
    _ensureMappings();
    return {
      ...voiceCodeConfig,
      providerCodes: providerCodeToInfo
    };
  },

  getProviderCodes() {
    _ensureMappings();
    return providerCodeToInfo;
  },

  getProviderCode(providerKey) {
    _ensureMappings();
    return providerKeyToCode[providerKey] || null;
  },

  getProviderKey(providerCode) {
    _ensureMappings();
    const info = providerCodeToInfo[providerCode];
    return info?.providerKey || null;
  },

  getServiceKey(providerKey) {
    _ensureMappings();
    return providerKeyToService[providerKey] || null;
  },

  getProviderInfo(providerKey) {
    _ensureMappings();
    const code = providerKeyToCode[providerKey];
    if (!code) return null;
    return {
      ...providerCodeToInfo[code],
      providerCode: code
    };
  },

  resetMappings() {
    _mappingsBuilt = false;
    providerKeyToCode = null;
    providerKeyToService = null;
    providerCodeToInfo = null;
  }
};

module.exports = VoiceCodeGenerator;
