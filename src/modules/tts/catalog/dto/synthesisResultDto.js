function buildSynthesisSuccessResponse(params) {
  const {
    audioUrl,
    format,
    size,
    isRemote,
    provider,
    voice,
    duration,
    usage,
    metadata
  } = params;

  const data = {
    audioUrl,
    format,
    provider,
    voice,
    isRemote: isRemote !== undefined ? isRemote : false
  };

  if (size !== undefined) data.size = size;
  if (duration !== undefined) data.duration = duration;
  if (usage !== undefined) data.usage = usage;
  if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
    data.metadata = metadata;
  }

  return {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };
}

function buildSynthesisErrorResponse(params) {
  const { error, code, provider, hint } = params;

  const response = {
    success: false,
    error
  };

  if (code) response.code = code;
  if (provider) response.provider = provider;
  if (hint) response.hint = hint;

  response.timestamp = new Date().toISOString();
  return response;
}

function buildResponseFromResult(result, context) {
  return buildSynthesisSuccessResponse({
    audioUrl: result.url,
    format: result.format,
    size: result.size,
    isRemote: result.isRemote,
    provider: context.provider,
    voice: context.voice
  });
}

function getErrorStatusCode(error) {
  switch (error.code) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'CONFIG_ERROR':
    case 'PROVIDER_NOT_CONFIGURED':
      return 503;
    case 'UNKNOWN_SERVICE':
      return 400;
    case 'PROVIDER_ERROR':
      return 502;
    case 'TIMEOUT_ERROR':
      return 504;
    default:
      return 500;
  }
}

module.exports = {
  buildSynthesisSuccessResponse,
  buildSynthesisErrorResponse,
  buildResponseFromResult,
  getErrorStatusCode
};
