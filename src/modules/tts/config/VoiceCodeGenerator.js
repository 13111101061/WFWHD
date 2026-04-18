/**
 * VoiceCodeGenerator - 音色编码生成与校验工具 (v2.0 简化版)
 *
 * 职责：
 * - 生成 15 位 voice_code（PPP VVVVV RRRRRR C）
 * - Luhn 校验位计算与验证
 * - voice_code 解析（提取服务商、音色序号）
 * - 兼容映射管理（legacy system_id <-> voice_code）
 *
 * 编码格式（v2.0 简化版）：
 * - PPP (3位)：服务商编码
 * - VVVVV (5位)：音色业务编号 (00001-99999)
 * - RRRRRR (6位)：预留位（固定 000000）
 * - C (1位)：Luhn 校验位
 *
 * 重要规则：
 * - 所有 ID 统一按字符串处理，禁止转 Number（会丢前导零和精度）
 */

const path = require('path');
const voiceCodeConfig = require('./VoiceCodeConfig.json');

const RESERVED = '000000';

/**
 * 反向映射：providerKey -> providerCode
 */
const providerKeyToCode = {};
const providerKeyToService = {};
Object.entries(voiceCodeConfig.providerCodes).forEach(([code, info]) => {
  providerKeyToCode[info.providerKey] = code;
  providerKeyToService[info.providerKey] = info.serviceKey;
});

/**
 * Luhn 算法：计算校验位
 * @param {string} digits - 14位数字字符串
 * @returns {string} 单个校验位数字
 */
function calcLuhnCheckDigit(digits) {
  let sum = 0;
  let alternate = false;

  // 从右到左处理
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

/**
 * Luhn 算法：验证完整编码
 * @param {string} code - 15位完整编码
 * @returns {boolean}
 */
function validateLuhn(code) {
  if (typeof code !== 'string' || code.length !== 15) return false;
  if (!/^\d{15}$/.test(code)) return false;

  const dataPart = code.substring(0, 14);
  const checkDigit = code[14];
  return calcLuhnCheckDigit(dataPart) === checkDigit;
}

const VoiceCodeGenerator = {
  /**
   * 生成 voice_code (v2.0 格式)
   * @param {Object} params
   * @param {string} params.providerKey - 服务商 key（如 "moss"）
   * @param {number} params.voiceNumber - 音色业务编号（1-99999）
   * @returns {string} 15位 voice_code
   */
  generate({ providerKey, voiceNumber }) {
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

  /**
   * 解析 voice_code (v2.0 格式)
   * @param {string} voiceCode - 15位编码
   * @returns {Object|null} 解析结果，无效则返回 null
   */
  parse(voiceCode) {
    if (typeof voiceCode !== 'string' || voiceCode.length !== 15) return null;
    if (!/^\d{15}$/.test(voiceCode)) return null;
    if (!validateLuhn(voiceCode)) return null;

    const providerCode = voiceCode.substring(0, 3);
    const voiceNumber = voiceCode.substring(3, 8);  // 5位
    const reserved = voiceCode.substring(8, 14);     // 6位
    const checkDigit = voiceCode[14];

    const providerInfo = voiceCodeConfig.providerCodes[providerCode];

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

  /**
   * 验证 voice_code 格式
   * @param {string} voiceCode
   * @returns {boolean}
   */
  isValid(voiceCode) {
    return validateLuhn(voiceCode);
  },

  /**
   * 根据 providerKey + voiceNumber 构建编码数据部分（不计算校验位，内部用）
   */
  buildDataPart({ providerKey, voiceNumber }) {
    const providerCode = providerKeyToCode[providerKey];
    if (!providerCode) {
      throw new Error(`Unknown providerKey: ${providerKey}`);
    }
    const voicePart = String(voiceNumber).padStart(5, '0');
    return `${providerCode}${voicePart}${RESERVED}`;
  },

  /**
   * 获取配置信息
   */
  getConfig() {
    return voiceCodeConfig;
  },

  /**
   * 获取所有服务商编码映射
   */
  getProviderCodes() {
    return voiceCodeConfig.providerCodes;
  },

  /**
   * providerKey -> providerCode
   */
  getProviderCode(providerKey) {
    return providerKeyToCode[providerKey] || null;
  },

  /**
   * providerCode -> providerKey
   */
  getProviderKey(providerCode) {
    const info = voiceCodeConfig.providerCodes[providerCode];
    return info?.providerKey || null;
  },

  /**
   * providerKey -> serviceKey
   */
  getServiceKey(providerKey) {
    return providerKeyToService[providerKey] || null;
  },

  /**
   * v2.0 新增：获取服务商完整信息
   * @param {string} providerKey
   * @returns {Object|null}
   */
  getProviderInfo(providerKey) {
    const code = providerKeyToCode[providerKey];
    if (!code) return null;
    return {
      ...voiceCodeConfig.providerCodes[code],
      providerCode: code
    };
  }
};

module.exports = VoiceCodeGenerator;
