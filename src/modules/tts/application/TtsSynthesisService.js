const { VoiceResolver } = require('./VoiceResolver');
const { createProvider } = require('../adapters/providers');
const credentials = require('../../credentials');
const { buildSynthesisSuccessResponse, buildSynthesisErrorResponse } = require('../catalog/dto/synthesisResultDto');

const DEFAULT_POLICY = {
  timeoutMs: parseInt(process.env.TTS_SYNTH_TIMEOUT_MS || '60000', 10),
  retryTimes: parseInt(process.env.TTS_SYNTH_RETRY_TIMES || '1', 10)
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(error) {
  if (!error) return false;
  const retryableCodes = new Set([
    'API_ERROR',
    'PROVIDER_ERROR',
    'TIMEOUT_ERROR',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'EAI_AGAIN'
  ]);
  if (retryableCodes.has(error.code)) return true;

  const msg = String(error.message || '').toLowerCase();
  return msg.includes('timeout') || msg.includes('timed out') || msg.includes('network');
}

async function withTimeout(taskPromise, timeoutMs) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Synthesis timeout after ${timeoutMs}ms`);
      error.code = 'TIMEOUT_ERROR';
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const TtsSynthesisService = {
  async _synthesizeWithPolicy(adapter, text, runtimeOptions) {
    const timeoutMs = DEFAULT_POLICY.timeoutMs;
    const retryTimes = Number.isFinite(DEFAULT_POLICY.retryTimes) ? DEFAULT_POLICY.retryTimes : 1;
    const attempts = Math.max(1, retryTimes + 1);

    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await withTimeout(
          adapter.synthesizeAndSave(text, runtimeOptions),
          timeoutMs
        );
      } catch (error) {
        lastError = error;
        const shouldRetry = attempt < attempts && isRetryableError(error);
        if (!shouldRetry) break;
        await sleep(120 * attempt);
      }
    }

    throw lastError;
  },

  _splitResult(result = {}) {
    const {
      url,
      format,
      size,
      isRemote,
      filePath,
      audio,
      ...extras
    } = result;

    return {
      core: { url, format, size, isRemote },
      metadata: extras
    };
  },

  async synthesize(request = {}) {
    try {
      const normalizedRequest = VoiceResolver.normalizeRequest(request);
      VoiceResolver.validateText(normalizedRequest.text);

      const resolved = VoiceResolver.resolve(normalizedRequest);

      const providerKey = resolved.providerKey;
      if (!credentials.isConfigured(providerKey)) {
        return buildSynthesisErrorResponse({
          error: `Provider not configured: ${providerKey}`,
          code: 'PROVIDER_NOT_CONFIGURED',
          provider: providerKey,
          hint: 'Please check API key configuration'
        });
      }

      const adapter = createProvider(resolved.adapterKey);
      const rawResult = await this._synthesizeWithPolicy(
        adapter,
        normalizedRequest.text,
        resolved.runtimeOptions
      );

      const { core, metadata } = this._splitResult(rawResult);

      return buildSynthesisSuccessResponse({
        audioUrl: core.url,
        format: core.format,
        size: core.size,
        isRemote: core.isRemote,
        provider: resolved.adapterKey,
        voice: resolved.runtimeOptions.voice,
        duration: metadata.duration,
        usage: metadata.usage,
        metadata
      });
    } catch (error) {
      return buildSynthesisErrorResponse({
        error: error.message,
        code: error.code,
        provider: request.service
      });
    }
  },

  getStatusCode(result) {
    if (result.success) {
      return 200;
    }

    const code = result.code;
    switch (code) {
      case 'VALIDATION_ERROR':
      case 'UNKNOWN_SERVICE':
        return 400;
      case 'TIMEOUT_ERROR':
        return 504;
      case 'PROVIDER_NOT_CONFIGURED':
      case 'CONFIG_ERROR':
        return 503;
      default:
        return 500;
    }
  },

  async quickSynthesize(serviceKey, text, options = {}) {
    return this.synthesize({
      text,
      service: serviceKey,
      options
    });
  }
};

module.exports = {
  TtsSynthesisService
};
