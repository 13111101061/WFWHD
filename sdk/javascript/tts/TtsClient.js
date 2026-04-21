/**
 * TTS SDK - JavaScript 客户端
 *
 * 目标：
 * 1. 对齐当前服务端接口契约
 * 2. 统一单条 / 批量调用入口
 * 3. 保留浏览器与 Node.js 双环境可用性
 * 4. 为后续扩展 provider 特殊参数预留透传能力
 */

class TtsClient {
  /**
   * @param {Object} [config]
   * @param {string} [config.apiBaseUrl='/api']
   * @param {string} [config.apiKey]
   * @param {number} [config.timeout=30000]
   * @param {number} [config.cacheTTL=300000]
   * @param {Function} [config.fetch]
   * @param {Object} [config.headers]
   */
  constructor(config = {}) {
    this.apiBaseUrl = this._normalizeBaseUrl(config.apiBaseUrl || '/api');
    this.apiKey = config.apiKey || null;
    this.timeout = Number(config.timeout) || 30000;
    this.defaultHeaders = { ...(config.headers || {}) };
    this.fetchImpl = config.fetch || this._resolveFetch();

    this.cache = {
      voices: null,
      providers: null,
      capabilities: {},
      timestamp: null,
      ttl: Number(config.cacheTTL) || 300000
    };

    this.eventListeners = {};
  }

  // ==================== Events ====================

  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.eventListeners[event]) {
      return;
    }

    this.eventListeners[event] = this.eventListeners[event].filter((item) => item !== callback);
  }

  _emit(event, data) {
    if (!this.eventListeners[event]) {
      return;
    }

    this.eventListeners[event].forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        // 不让事件监听器打断主调用链
        console.error('[TtsClient] Event listener error:', error);
      }
    });
  }

  // ==================== Public HTTP ====================

  async request(endpoint, options = {}) {
    return this._request(endpoint, options);
  }

  async get(endpoint, query) {
    return this._request(endpoint, { method: 'GET', query });
  }

  async post(endpoint, body, options = {}) {
    return this._request(endpoint, {
      ...options,
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  async _request(endpoint, options = {}) {
    if (!this.fetchImpl) {
      throw new Error(
        'No fetch implementation available. Pass config.fetch in Node.js < 18 or old browsers.'
      );
    }

    const method = (options.method || 'GET').toUpperCase();
    const url = this._buildUrl(endpoint, options.query);
    const headers = {
      ...this.defaultHeaders,
      ...(options.headers || {})
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    if (method !== 'GET' && method !== 'HEAD' && options.body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    const startedAt = Date.now();

    this._emit('requestStart', { endpoint, method, url, options });

    try {
      const response = await this.fetchImpl(url, {
        ...options,
        method,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const payload = await this._parseResponse(response);
      const latency = Date.now() - startedAt;

      if (!response.ok) {
        const error = this._buildRequestError(response, payload);
        this._emit('requestError', { endpoint, method, url, error, response: payload });
        throw error;
      }

      this._emit('requestSuccess', { endpoint, method, url, latency, result: payload });
      return payload;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        const timeoutError = new Error('请求超时');
        timeoutError.code = 'TIMEOUT_ERROR';
        timeoutError.status = 408;
        this._emit('requestError', { endpoint, method, url, error: timeoutError });
        throw timeoutError;
      }

      this._emit('requestError', { endpoint, method, url, error });
      throw error;
    }
  }

  async _parseResponse(response) {
    const contentType = response.headers && typeof response.headers.get === 'function'
      ? response.headers.get('content-type')
      : '';

    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      return { success: response.ok, raw: text };
    }
  }

  _buildRequestError(response, payload) {
    const message =
      (payload && (payload.error || payload.message)) ||
      `HTTP ${response.status}`;

    const error = new Error(message);
    error.code = (payload && payload.code) || 'HTTP_ERROR';
    error.status = response.status;
    error.response = payload;
    return error;
  }

  // ==================== Synthesize ====================

  /**
   * @param {string|Object} input
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async synthesize(input, options = {}) {
    const params = this._normalizeSynthesizeArgs(input, options);
    const requestBody = this._buildSynthesizeBody(params);

    try {
      const result = await this.post('/tts/synthesize', requestBody);

      if (!result || result.success !== true) {
        throw this._buildUnexpectedResponseError(result, '合成失败');
      }

      const normalized = this._normalizeSynthesisResult(result);
      this._emit('synthesizeSuccess', {
        params,
        provider: normalized.provider,
        serviceType: normalized.serviceType,
        requestId: normalized.requestId
      });

      return normalized;
    } catch (error) {
      this._emit('synthesizeError', { params, error });
      throw error;
    }
  }

  /**
   * 批量合成策略：
   * - auto: 有 service 且未使用 voiceCode/systemId 时优先走服务端批量接口
   * - server: 强制走 /tts/batch
   * - client: 逐条调用 /tts/synthesize，支持 voiceCode/systemId
   *
   * @param {Object|string[]} input
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async batchSynthesize(input, options = {}) {
    const params = this._normalizeBatchArgs(input, options);
    const mode = params.mode || 'auto';

    if (!Array.isArray(params.texts) || params.texts.length === 0) {
      throw new Error('texts 必须是非空数组');
    }

    if (params.texts.length > 10) {
      throw new Error('批量合成最多支持 10 条文本');
    }

    const useServerBatch = this._shouldUseServerBatch(params, mode);
    return useServerBatch
      ? this._batchSynthesizeByServer(params)
      : this._batchSynthesizeByClient(params);
  }

  async _batchSynthesizeByServer(params) {
    if (!params.service) {
      throw new Error('服务端批量模式必须提供 service');
    }

    const commonOptions = this._buildCommonOptionPayload(params);
    const requestBody = {
      service: params.service,
      texts: params.texts,
      options: commonOptions
    };

    const result = await this.post('/tts/batch', requestBody);

    if (!result || result.success !== true) {
      throw this._buildUnexpectedResponseError(result, '批量合成失败');
    }

    return {
      success: true,
      mode: 'server',
      results: result.data?.results || [],
      errors: result.data?.errors || [],
      summary: result.data?.summary || {
        total: params.texts.length,
        successful: 0,
        failed: params.texts.length
      },
      service: result.service || params.service,
      timestamp: result.timestamp
    };
  }

  async _batchSynthesizeByClient(params) {
    const concurrency = this._normalizeConcurrency(params.concurrency);
    const tasks = params.texts.map((text, index) => async () => {
      try {
        const result = await this.synthesize({
          ...params,
          text
        });

        return {
          kind: 'result',
          value: {
            index,
            text,
            success: true,
            data: result
          }
        };
      } catch (error) {
        return {
          kind: 'error',
          value: {
            index,
            text,
            error: error.message,
            code: error.code,
            status: error.status
          }
        };
      }
    });

    const settled = await this._runTaskPool(tasks, concurrency);
    const results = settled.filter((item) => item.kind === 'result').map((item) => item.value);
    const errors = settled.filter((item) => item.kind === 'error').map((item) => item.value);

    return {
      success: errors.length === 0,
      mode: 'client',
      results,
      errors,
      summary: {
        total: params.texts.length,
        successful: results.length,
        failed: errors.length
      },
      service: params.service,
      timestamp: new Date().toISOString()
    };
  }

  async _runTaskPool(tasks, concurrency) {
    const results = new Array(tasks.length);
    let cursor = 0;

    const worker = async () => {
      while (cursor < tasks.length) {
        const currentIndex = cursor;
        cursor += 1;
        results[currentIndex] = await tasks[currentIndex]();
      }
    };

    const workerCount = Math.min(concurrency, tasks.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
  }

  _shouldUseServerBatch(params, mode) {
    if (mode === 'server') {
      return true;
    }

    if (mode === 'client') {
      return false;
    }

    return Boolean(params.service && !params.voiceCode && !params.systemId);
  }

  // ==================== Convenience Methods ====================

  async synthesizeWithVoiceCode(text, voiceCode, options = {}) {
    return this.synthesize(text, { ...options, voiceCode });
  }

  async synthesizeWithSystemId(text, systemId, options = {}) {
    return this.synthesize(text, { ...options, systemId });
  }

  async synthesizeWithService(text, service, voice, options = {}) {
    return this.synthesize(text, { ...options, service, voice });
  }

  async aliyunQwen(text, voice, options = {}) {
    return this.synthesize(text, { ...options, service: 'aliyun_qwen_http', voice });
  }

  async aliyunCosyvoice(text, voice, options = {}) {
    return this.synthesize(text, { ...options, service: 'aliyun_cosyvoice', voice });
  }

  async tencent(text, voice, options = {}) {
    return this.synthesize(text, { ...options, service: 'tencent', voice });
  }

  async volcengine(text, voice, options = {}) {
    return this.synthesize(text, { ...options, service: 'volcengine_http', voice });
  }

  async moss(text, voice, options = {}) {
    return this.synthesize(text, { ...options, service: 'moss_tts', voice });
  }

  async minimax(text, voice, options = {}) {
    return this.synthesize(text, { ...options, service: 'minimax_tts', voice });
  }

  // ==================== Query APIs ====================

  /**
   * 兼容旧方法名：
   * - 默认返回前端精简音色列表 /tts/frontend
   * - 若传入 service，则查询 /tts/voices?service=...
   */
  async getVoices(options = {}) {
    const { useCache = true, forceRefresh = false, service } = options;

    if (service) {
      return this.getServiceVoices(service);
    }

    if (useCache && !forceRefresh && this._isCacheValid('voices')) {
      return this.cache.voices;
    }

    const result = await this.get('/tts/frontend');
    if (result.success) {
      this.cache.voices = result;
      this.cache.timestamp = Date.now();
    }
    return result;
  }

  async getFrontendVoices(options = {}) {
    return this.getVoices(options);
  }

  async getServiceVoices(service) {
    return this.get('/tts/voices', { service });
  }

  async getVoiceDetail(voiceId) {
    return this.get(`/tts/voices/${encodeURIComponent(voiceId)}/detail`);
  }

  async getCatalog() {
    return this.get('/tts/catalog');
  }

  async getProviders(options = {}) {
    const { useCache = true, forceRefresh = false } = options;

    if (useCache && !forceRefresh && this._isCacheValid('providers')) {
      return this.cache.providers;
    }

    const result = await this.get('/tts/providers');
    if (result.success) {
      this.cache.providers = result;
      this.cache.timestamp = Date.now();
    }
    return result;
  }

  async getCapabilities(serviceKey, options = {}) {
    const { useCache = true, forceRefresh = false } = options;

    if (useCache && !forceRefresh && this.cache.capabilities[serviceKey]) {
      return this.cache.capabilities[serviceKey];
    }

    const result = await this.get(`/tts/capabilities/${encodeURIComponent(serviceKey)}`);
    if (result.success) {
      this.cache.capabilities[serviceKey] = result;
    }
    return result;
  }

  async getFilterOptions() {
    return this.get('/tts/filters');
  }

  async getHealth() {
    return this.get('/tts/health');
  }

  async getStats() {
    return this.get('/tts/stats');
  }

  // ==================== Cache / Config ====================

  clearCache() {
    const ttl = this.cache.ttl;
    this.cache = {
      voices: null,
      providers: null,
      capabilities: {},
      timestamp: null,
      ttl
    };
  }

  clearCapabilitiesCache(serviceKey) {
    if (serviceKey) {
      delete this.cache.capabilities[serviceKey];
      return;
    }

    this.cache.capabilities = {};
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey || null;
  }

  setBaseUrl(baseUrl) {
    this.apiBaseUrl = this._normalizeBaseUrl(baseUrl);
    this.clearCache();
  }

  setTimeout(timeout) {
    this.timeout = Number(timeout) || this.timeout;
  }

  setFetch(fetchImpl) {
    this.fetchImpl = fetchImpl;
  }

  // ==================== Internal Helpers ====================

  _normalizeSynthesizeArgs(input, options) {
    if (typeof input === 'string') {
      return { ...(options || {}), text: input };
    }

    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return input;
    }

    throw new Error('synthesize 参数必须是对象，或使用 (text, options) 形式');
  }

  _normalizeBatchArgs(input, options) {
    if (Array.isArray(input)) {
      return { ...(options || {}), texts: input };
    }

    if (input && typeof input === 'object') {
      return input;
    }

    throw new Error('batchSynthesize 参数必须是对象，或使用 (texts, options) 形式');
  }

  _buildSynthesizeBody(params) {
    this._validateText(params.text);
    this._validateIdentity(params);

    const body = { text: params.text };

    if (params.voiceCode) {
      body.voiceCode = params.voiceCode;
    } else if (params.systemId) {
      body.systemId = params.systemId;
    } else if (params.service) {
      body.service = params.service;
      if (params.voice !== undefined) {
        body.voice = params.voice;
      } else if (params.voiceId !== undefined) {
        body.voice = params.voiceId;
      }
    }

    Object.assign(
      body,
      this._buildCommonOptionPayload(params, {
        includeIdentityOptions: !params.voiceCode && !params.systemId
      })
    );
    return body;
  }

  _buildCommonOptionPayload(params, options = {}) {
    const { includeIdentityOptions = true } = options;
    const payload = { ...(params.options || {}) };

    const mappedFields = [
      'model',
      'format',
      'sampleRate',
      'speed',
      'pitch',
      'volume',
      'emotion',
      'expectedDurationSec',
      'samplingParams',
      'seed'
    ];

    if (includeIdentityOptions) {
      mappedFields.unshift('voiceId');
      mappedFields.unshift('voice');
    }

    mappedFields.forEach((field) => {
      if (params[field] !== undefined) {
        payload[field] = params[field];
      }
    });

    this._pickExtraPayloadFields(params, payload);
    return payload;
  }

  _pickExtraPayloadFields(params, payload) {
    const reservedKeys = new Set([
      'text',
      'texts',
      'voiceCode',
      'systemId',
      'service',
      'voice',
      'voiceId',
      'options',
      'mode',
      'concurrency'
    ]);

    Object.keys(params).forEach((key) => {
      if (!reservedKeys.has(key) && params[key] !== undefined) {
        payload[key] = params[key];
      }
    });
  }

  _normalizeSynthesisResult(result) {
    return {
      success: true,
      audioUrl: result.data?.audioUrl,
      filePath: result.data?.filePath,
      fileName: result.data?.fileName,
      format: result.data?.format,
      sampleRate: result.data?.sampleRate,
      duration: result.data?.duration,
      fileSize: result.data?.fileSize,
      provider: result.metadata?.provider || result.data?.provider,
      serviceType: result.metadata?.serviceType || result.data?.serviceType,
      voice: result.data?.voice,
      model: result.data?.model,
      requestId: result.metadata?.requestId,
      systemId: result.metadata?.systemId,
      fromCache: Boolean(result.fromCache || result.data?.fromCache),
      timestamp: result.timestamp,
      raw: result
    };
  }

  _buildUnexpectedResponseError(result, fallbackMessage) {
    const error = new Error(result?.error || result?.message || fallbackMessage);
    error.code = result?.code || 'INVALID_RESPONSE';
    error.response = result;
    return error;
  }

  _validateText(text) {
    if (typeof text !== 'string' || text.trim() === '') {
      throw new Error('text 必须是非空字符串');
    }
  }

  _validateIdentity(params) {
    const hasIdentity = Boolean(params.voiceCode || params.systemId || params.service);
    if (!hasIdentity) {
      throw new Error('必须提供 voiceCode、systemId 或 service 三者之一');
    }
  }

  _normalizeConcurrency(concurrency) {
    const value = Number(concurrency) || 3;
    return Math.max(1, Math.min(10, value));
  }

  _isCacheValid(key) {
    return Boolean(
      this.cache[key] &&
      this.cache.timestamp &&
      (Date.now() - this.cache.timestamp) < this.cache.ttl
    );
  }

  _normalizeBaseUrl(baseUrl) {
    if (!baseUrl) {
      return '/api';
    }

    return String(baseUrl).replace(/\/+$/, '');
  }

  _buildUrl(endpoint, query) {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const base = `${this.apiBaseUrl}${path}`;

    if (!query || typeof query !== 'object' || Object.keys(query).length === 0) {
      return base;
    }

    const search = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((item) => search.append(key, String(item)));
        return;
      }

      search.append(key, String(value));
    });

    const queryString = search.toString();
    return queryString ? `${base}?${queryString}` : base;
  }

  _resolveFetch() {
    if (typeof fetch === 'function') {
      return fetch.bind(typeof globalThis !== 'undefined' ? globalThis : null);
    }

    return null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TtsClient;
  module.exports.default = TtsClient;
} else if (typeof window !== 'undefined') {
  window.TtsClient = TtsClient;
}
