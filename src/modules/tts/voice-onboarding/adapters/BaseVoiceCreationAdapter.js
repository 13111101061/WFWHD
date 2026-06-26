/**
 * BaseVoiceCreationAdapter - 音色创建模板方法基类
 *
 * 吸收所有 Provider Adapter 的横切逻辑（对标主合成链路的 BaseTtsAdapter）：
 *   - _mapHttpError()   统一 HTTP 错误 → TtsErrorCodes（复用主链路映射）
 *   - _error()          构造带 code 的 Error
 *   - _decodeAndSave()  base64 音频 → 落盘 → URL
 *   - _saveBuffer()     Buffer 音频 → 落盘 → URL（克隆/生成共用）
 *   - _apiKey()         凭证统一解析
 *
 * 子类只需实现能力方法（cloneVoice / generatePreview）的 HTTP 调用差异，
 * 不再重复错误处理与音频落盘代码。
 */
const VoiceCreationPort = require('../port/VoiceCreationPort');
const { TtsErrorCodes, resolveProviderError } = require('../../TtsErrorCodes');
const { getProviderCode } = require('../../../../shared/utils/audioStorage');

class BaseVoiceCreationAdapter extends VoiceCreationPort {
  /**
   * @param {Object} config
   * @param {string} config.providerKey - 如 'moss', 'mimo'
   * @param {Object} [config.audioStorage] - audioStorageManager 实例
   */
  constructor({ providerKey, audioStorage } = {}) {
    super();
    this._providerKey = providerKey;
    this._providerCode = getProviderCode(providerKey);
    this._audioStorage = audioStorage || null;
  }

  get providerKey() {
    return this._providerKey;
  }

  /**
   * Provider 展示名（用于错误信息），子类可覆盖。
   */
  _providerLabel() {
    return this._providerKey;
  }

  /**
   * 凭证解析：默认取 apiKey，secretKey/accessKey 模式的 Provider 可覆盖。
   */
  _apiKey(credentials) {
    return credentials?.apiKey;
  }

  /**
   * 构造带 code 的 Error
   */
  _error(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
  }

  /**
   * 统一 axios 错误 → TtsErrorCodes
   *
   * 语义切分（与 _error 配合）：
   *   - 401/403 → PROVIDER_UNAUTHORIZED（provider 拒绝 key）
   *   - 429     → PROVIDER_RATE_LIMITED
   *   - 400     → VALIDATION_ERROR
   *   - 5xx     → PROVIDER_UNAVAILABLE
   *   - 超时    → TIMEOUT_ERROR
   */
  _mapHttpError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      const msg = data?.error?.message || data?.message || data?.detail || error.message;
      const code = resolveProviderError(status, msg);
      return this._error(code, `${this._providerLabel()} 请求失败: ${msg}`);
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return this._error(TtsErrorCodes.TIMEOUT_ERROR, `${this._providerLabel()} 请求超时`);
    }
    return this._error(TtsErrorCodes.PROVIDER_UNAVAILABLE, `${this._providerLabel()} 请求失败: ${error.message}`);
  }

  /**
   * base64 音频 → 解码 → 落盘 → URL
   */
  async _decodeAndSave(audioBase64, opts) {
    return this._saveBuffer(Buffer.from(audioBase64, 'base64'), opts);
  }

  /**
   * Buffer 音频 → 落盘 → URL（克隆与生成都用得到）
   * @param {Buffer} buffer
   * @param {Object} opts - { service, text, type, creditCost? }
   * @returns {Promise<{ audioUrl, fileSize, format, creditCost? }>}
   */
  async _saveBuffer(buffer, { service, text, type, creditCost }) {
    if (!this._audioStorage) {
      throw this._error(TtsErrorCodes.CONFIG_ERROR, `${this._providerLabel()} audioStorage 未配置`);
    }
    const saved = await this._audioStorage.saveAudioFile(buffer, {
      extension: 'wav',
      metadata: {
        provider: this._providerKey,
        service,
        text: (text || '').substring(0, 50),
        nameFormat: 'structured',
        type,
        providerCode: this._providerCode
      }
    });
    return {
      audioUrl: saved.url,
      fileSize: saved.size,
      format: 'wav',
      ...(creditCost !== undefined && { creditCost })
    };
  }
}

module.exports = BaseVoiceCreationAdapter;
