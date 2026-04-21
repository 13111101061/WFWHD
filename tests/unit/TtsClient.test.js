const assert = require('assert');
const TtsClient = require('../../sdk/javascript/tts/TtsClient');

function createJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type'
          ? 'application/json'
          : null;
      }
    },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    }
  };
}

describe('TtsClient', () => {
  it('synthesize 应把通用参数整理到顶层请求体', async () => {
    const calls = [];
    const client = new TtsClient({
      apiBaseUrl: '/api/',
      apiKey: 'demo-key',
      fetch: async (url, init) => {
        calls.push({ url, init });
        return createJsonResponse({
          success: true,
          data: {
            audioUrl: 'https://cdn.local/test.mp3',
            format: 'mp3'
          },
          metadata: {
            provider: 'moss',
            serviceType: 'tts',
            requestId: 'req-1'
          },
          timestamp: '2026-04-21T00:00:00.000Z'
        });
      }
    });

    const result = await client.synthesize({
      text: '你好',
      voiceCode: '001000030000005',
      speed: 1.2,
      format: 'mp3',
      options: { pitch: 0.9 },
      emotion: 'calm'
    });

    assert.strictEqual(result.audioUrl, 'https://cdn.local/test.mp3');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, '/api/tts/synthesize');
    assert.strictEqual(calls[0].init.headers['X-API-Key'], 'demo-key');

    const body = JSON.parse(calls[0].init.body);
    assert.deepStrictEqual(body, {
      text: '你好',
      voiceCode: '001000030000005',
      pitch: 0.9,
      speed: 1.2,
      format: 'mp3',
      emotion: 'calm'
    });
  });

  it('batchSynthesize 在 voiceCode 模式下应自动走客户端批量', async () => {
    const calls = [];
    const client = new TtsClient({
      apiBaseUrl: '/api',
      fetch: async (url, init) => {
        calls.push({ url, init });
        return createJsonResponse({
          success: true,
          data: {
            audioUrl: `https://cdn.local/${calls.length}.mp3`
          },
          metadata: {
            provider: 'moss',
            serviceType: 'tts',
            requestId: `req-${calls.length}`
          },
          timestamp: '2026-04-21T00:00:00.000Z'
        });
      }
    });

    const result = await client.batchSynthesize({
      texts: ['第一句', '第二句'],
      voiceCode: '001000030000005'
    });

    assert.strictEqual(result.mode, 'client');
    assert.strictEqual(result.summary.total, 2);
    assert.strictEqual(result.summary.successful, 2);
    assert.strictEqual(calls.length, 2);
    assert.ok(calls.every((call) => call.url === '/api/tts/synthesize'));
  });

  it('batchSynthesize 在 service 模式下应走服务端批量并把 voice 放进 options', async () => {
    const calls = [];
    const client = new TtsClient({
      apiBaseUrl: '/api',
      fetch: async (url, init) => {
        calls.push({ url, init });
        return createJsonResponse({
          success: true,
          data: {
            results: [],
            errors: [],
            summary: {
              total: 2,
              successful: 2,
              failed: 0
            }
          },
          service: 'aliyun_qwen_http',
          timestamp: '2026-04-21T00:00:00.000Z'
        });
      }
    });

    const result = await client.batchSynthesize({
      texts: ['A', 'B'],
      service: 'aliyun_qwen_http',
      voice: 'Cherry',
      speed: 1.05
    });

    assert.strictEqual(result.mode, 'server');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, '/api/tts/batch');

    const body = JSON.parse(calls[0].init.body);
    assert.deepStrictEqual(body, {
      service: 'aliyun_qwen_http',
      texts: ['A', 'B'],
      options: {
        voice: 'Cherry',
        speed: 1.05
      }
    });
  });
});
