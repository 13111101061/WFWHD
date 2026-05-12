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
 *     "timeoutMs": 30000,
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
 */

const BaseTtsAdapter = require('./BaseTtsAdapter');

const RETRYABLE_HTTP = new Set([429, 503, 502]);
const CIRCUIT_HTTP = new Set([500]);

class GenericHttpAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({ ...config });
    this._api = config.api || {};
    this._endpoint = this._api.endpoint;
    this._method = this._api.method || 'POST';
    this._headers = this._api.headers || {};
    this._bodyTemplate = this._api.bodyTemplate || {};
    this._responseMap = this._api.responseMapping || {};
    this._errorMap = this._api.errorMapping || {};
    this._timeout = this._api.timeoutMs || 30000;
    this._retry = this._api.retry || { maxRetries: 0, backoffMs: 200 };
    this._rateLimit = this._api.rateLimit || { requestsPerMinute: 60 };

    if (!this._endpoint) {
      throw new Error('[GenericHttpAdapter] manifest 缺少 api.endpoint');
    }
  }

  async synthesize(text, providerParams = {}) {
    this.validateText(text);

    const creds = this._getCredentials();

    if (!this._hasCredential(creds)) {
      throw this._error('CONFIG_ERROR', `${this.provider} API Key 未配置`);
    }

    try {
      const headers = this._interpolateHeaders(creds);
      const body = this._interpolateBody(text, providerParams);

      const response = await this._fetch(body, headers);

      if (!response.ok) {
        throw await this._mapError(response);
      }

      const audio = await this._extractAudio(response, this._responseMap);

      this._reportSuccess();

      return {
        audio,
        format: providerParams.format || 'wav',
        provider: this.provider,
        serviceType: this.serviceType
      };
    } catch (error) {
      this._reportFailure(error);
      throw error;
    }
  }

  // ==================== 模板内插 ====================

  _interpolateHeaders(creds) {
    const h = {};
    for (const [key, template] of Object.entries(this._headers)) {
      h[key] = this._resolve(template, { credential: creds });
    }
    return h;
  }

  _interpolateBody(text, params) {
    return this._resolve(this._bodyTemplate, { text, params });
  }

  /** 递归遍历模板对象，解析 ${path} 占位符 */
  _resolve(node, context) {
    if (typeof node === 'string' && node.startsWith('${') && node.endsWith('}')) {
      return this._navigate(context, node.slice(2, -1).split('.'));
    }
    if (Array.isArray(node)) return node.map(v => this._resolve(v, context));
    if (node && typeof node === 'object') {
      const r = {};
      for (const [k, v] of Object.entries(node)) r[k] = this._resolve(v, context);
      return r;
    }
    return node;
  }

  _navigate(obj, path) {
    let v = obj;
    for (const p of path) { if (v == null) return undefined; v = v[p]; }
    return v !== undefined ? v : undefined;
  }

  // ==================== HTTP ====================

  async _fetch(body, headers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeout);

    try {
      return await fetch(this._endpoint, {
        method: this._method,
        headers: { ...headers },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }

  // ==================== 响应处理 ====================

  async _extractAudio(response, mapping) {
    const encoding = mapping.audioEncoding || 'base64';
    const audioPath = mapping.audioPath || 'audio_data';

    // Mode 1: Binary response (all bytes are audio)
    if (encoding === 'binary') {
      const buf = Buffer.from(await response.arrayBuffer());
      if (!buf || buf.length === 0) throw this._error('PARSE_ERROR', '响应中无音频数据');
      return buf;
    }

    // Mode 2: JSON response with embedded audio (base64)
    const result = await response.json();
    let audio = result;
    for (const p of audioPath.split('.')) { audio = audio?.[p]; }

    if (!audio) throw this._error('PARSE_ERROR', '响应中未找到音频数据');

    return Buffer.from(audio, 'base64');
  }

  async _mapError(response) {
    const status = response.status;
    let code = 'API_ERROR';

    if ((this._errorMap.retryable || RETRYABLE_HTTP).has(status)) code = 'PROVIDER_ERROR';
    if ((this._errorMap.circuitBreaker || CIRCUIT_HTTP).has(status)) code = 'PROVIDER_ERROR';

    let detail = `HTTP ${status}`;
    try {
      const data = await response.json();
      detail = data.error?.message || data.message || detail;
    } catch (e) { /* ignore */ }

    return this._error(code, `${this.provider} 错误: ${detail}`);
  }

  _hasCredential(creds) {
    const mode = this._api.credentialMode || 'apiKey';
    if (mode === 'apiKey') return !!(creds?.apiKey);
    if (mode === 'secretKey') return !!(creds?.secretId && creds?.secretKey);
    if (mode === 'accessKey') return !!(creds?.accessKey && creds?.secretKey);
    return !!(creds?.apiKey);
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