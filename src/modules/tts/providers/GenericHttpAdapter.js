/**
 * GenericHttpAdapter — 声明式 HTTP 适配器
 *
 * 从 manifest.json 的 api 配置驱动，无需写自定义 Adapter。
 * 适用于简单的 HTTP POST → JSON response 类服务商。
 *
 * manifest.json 格式：
 *   "api": {
 *     "endpoint": "https://api.example.com/v1/tts",
 *     "method": "POST",
 *     "headers": { "Authorization": "Bearer ${credential.apiKey}" },
 *     "bodyTemplate": { "model": "${params.model}", "text": "${text}" },
 *     "responseMapping": { "audioPath": "audio_data", "audioEncoding": "base64" },
 *     "errorMapping": { "retryable": [429,503], "circuitBreaker": [500] }
 *   }
 *
 * 模板变量：
 *   ${text}              — 合成文本
 *   ${params.xxx}        — 已映射的 provider 参数
 *   ${credential.xxx}    — 凭证字段（apiKey/secretKey/accessKey）
 *
 * 如果 manifest 有 adapter 字段 → 使用自定义 Adapter（优先）
 * 如果 manifest 有 api 字段 → 使用 GenericHttpAdapter
 *
 * 注意：超时、重试、限流、熔断统一由 ExecutionPolicy 管理，
 *       本适配器只负责单次 HTTP 请求。
 */

const BaseTtsAdapter = require('./BaseTtsAdapter');
const TemplateResolver = require('./TemplateResolver');
const { resolveProviderError } = require('../TtsErrorCodes');

class GenericHttpAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({ ...config });
    this._api = config.api || {};
    this._endpoint = this._api.endpoint;
    this._method = this._api.method || 'POST';
    this._headers = this._api.headers || {};
    this._bodyTemplate = this._api.bodyTemplate || {};
    this._responseMap = this._api.responseMapping || {};

    this._resolver = new TemplateResolver();

    if (!this._endpoint) {
      throw new Error('[GenericHttpAdapter] manifest 缺少 api.endpoint');
    }
  }

  async synthesize(text, providerParams = {}, providerInput = null, signal = null) {
    this.validateText(text);

    const { credentials: creds, accountId } = this._getCredentials();

    if (!this._hasCredential(creds)) {
      throw this._error('CONFIG_ERROR', `${this.provider} API Key 未配置`);
    }

    try {
      const headers = this._resolver.resolve(this._headers, { credential: creds });
      const body = this._resolver.resolve(this._bodyTemplate, { text, params: providerParams });

      const response = await fetch(this._endpoint, {
        method: this._method,
        headers,
        body: JSON.stringify(body),
        signal
      });

      if (!response.ok) {
        throw await this._mapError(response);
      }

      const result = await this._extractAudio(response, this._responseMap);

      this._reportSuccess(accountId);

      const format = this._responseMap.formatPath
        ? this._navigate(result._parsed || {}, this._responseMap.formatPath.split('.'))
        : providerParams.format || 'wav';

      if (result.audioUrl) {
        return { audioUrl: result.audioUrl, format, provider: this.provider, serviceType: this.serviceType };
      }

      return {
        audio: result.audio,
        format,
        provider: this.provider,
        serviceType: this.serviceType
      };
    } catch (error) {
      this._reportFailure(accountId, error);
      throw error;
    }
  }

  async _extractAudio(response, mapping) {
    const encoding = mapping.audioEncoding || 'base64';
    const audioPath = mapping.audioPath || 'audio_data';

    if (encoding === 'binary') {
      const buf = Buffer.from(await response.arrayBuffer());
      if (!buf || buf.length === 0) throw this._error('PARSE_ERROR', '响应中无音频数据');
      return { audio: buf };
    }

    if (encoding === 'url') {
      const result = await response.json();
      let url = result;
      for (const p of audioPath.split('.')) { url = url?.[p]; }
      if (!url || typeof url !== 'string') throw this._error('PARSE_ERROR', '响应中未找到音频 URL');
      const sizePath = mapping.sizePath;
      let size = 0;
      if (sizePath) {
        size = this._navigate(result, sizePath.split('.')) || 0;
      }
      const dataPath = mapping.dataPath;
      let data = null;
      if (dataPath) {
        data = this._navigate(result, dataPath.split('.')) || null;
      }
      return { audioUrl: url, size, data };
    }

    const result = await response.json();
    let audio = result;
    for (const p of audioPath.split('.')) { audio = audio?.[p]; }

    if (!audio) throw this._error('PARSE_ERROR', '响应中未找到音频数据');

    return { audio: Buffer.from(audio, 'base64'), _parsed: result };
  }

  async _mapError(response) {
    const status = response.status;
    let detail = `HTTP ${status}`;
    try {
      const data = await response.json();
      detail = data.error?.message || data.message || detail;
    } catch (e) { /* keep HTTP status detail */ }

    const code = resolveProviderError(status, detail);
    const err = this._error(code, `${this.provider} 错误: ${detail}`);
    err.httpStatus = status;
    return err;
  }

  _hasCredential(creds) {
    const mode = this._api.credentialMode || 'apiKey';
    if (mode === 'apiKey') return !!(creds?.apiKey);
    if (mode === 'secretKey') return !!(creds?.secretId && creds?.secretKey);
    if (mode === 'accessKey') return !!(creds?.accessKey && creds?.secretKey);
    return !!(creds?.apiKey);
  }

  _navigate(obj, path) {
    let v = obj;
    for (const p of path) { if (v == null) return undefined; v = v[p]; }
    return v !== undefined ? v : undefined;
  }

  getStatus() {
    return {
      ...super.getStatus(),
      endpoint: this._endpoint,
      adapter: 'GenericHttpAdapter'
    };
  }
}

module.exports = GenericHttpAdapter;