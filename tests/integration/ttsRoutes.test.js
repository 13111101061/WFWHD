/**
 * ttsRoutes 集成测试 — 鉴权矩阵 + happy path
 *
 * 作为阶段 4（路由鉴权补齐）的基准回归网。
 *
 * 策略：
 * - 设置 process.env.API_KEYS 让 unifiedAuth 加载已知测试 key
 * - 构造一个 mini express app，只挂载 ttsRoutes
 * - 通过 require cache 拦截 ServiceContainer，注入 fake ttsHttpAdapter
 *   （避免真实凭证/网络依赖；鉴权层测试根本到不了 adapter）
 * - 对每条路由分别发起「无 key」和「有 key」请求，记录状态码
 *
 * 当前已知无 auth 的路由（阶段 4 会补齐）：
 *   /voices, /voices/:id, /voices/:id/detail
 *   /queue, /queue/:requestId (GET/DELETE)
 *   /bootstrap, /services/form-summary
 *   /filters, /catalog, /frontend (deprecated)
 *
 * 运行：npm run test:routes（需独立运行，不与需要真实 ServiceContainer 的测试混跑）
 */

const assert = require('assert');

// ==================== 环境准备（必须在 require app 之前）====================

// 设置测试 API key（unifiedAuth 在 require 时读取）
process.env.API_KEYS = 'test-key-1';
process.env.NODE_ENV = 'test';

// ==================== Mock ServiceContainer ====================
//
// ttsRoutes 内部用 `serviceContainer.initialize().then(()=>serviceContainer.get('ttsHttpAdapter'))`
// 我们在 require ttsRoutes 之前，先拦截 ServiceContainer 模块，注入 fake。
// 这样 getAdapter() 返回的永远是我们的 fake adapter。

const FAKE_ADAPTER = {
  // 所有方法默认返回成功占位，鉴权层会先拦截所以多数到不了这里
  synthesize: async (req, res) => res.json({ success: true, data: { audioUrl: 'fake' }, service: 'fake', metadata: {}, timestamp: new Date().toISOString() }),
  batchSynthesize: async (req, res) => res.json({ success: true, data: { results: [], errors: [], summary: { total: 0, successful: 0, failed: 0 } }, service: 'fake', timestamp: new Date().toISOString() }),
  getVoices: async (req, res) => res.json({ success: true, data: [], meta: {}, pagination: { total: 0 }, timestamp: new Date().toISOString() }),
  getVoiceById: async (req, res) => res.status(404).json({ success: false, error: 'not found' }),
  getVoiceDetail: async (req, res) => res.status(404).json({ success: false, error: 'not found' }),
  getProviders: async (req, res) => res.json({ success: true, data: [], providerCount: 0, timestamp: new Date().toISOString() }),
  getProviderMetrics: async (req, res) => res.json({ success: true, data: {}, timestamp: new Date().toISOString() }),
  matchProviders: async (req, res) => res.json({ success: true, data: [], timestamp: new Date().toISOString() }),
  getCapabilities: async (req, res) => res.json({ success: true, data: {}, timestamp: new Date().toISOString() }),
  getFilterOptions: async (req, res) => res.json({ success: true, data: {}, timestamp: new Date().toISOString() }),
  getFrontendCatalog: async (req, res) => res.json({ success: true, data: {}, timestamp: new Date().toISOString() }),
  getFrontendVoices: async (req, res) => res.json({ success: true, data: {}, timestamp: new Date().toISOString() }),
  getFrontendBootstrap: async (req, res) => res.json({ success: true, data: {}, timestamp: new Date().toISOString() }),
  getAllServicesFormSummary: async (req, res) => res.json({ success: true, data: {}, timestamp: new Date().toISOString() }),
  getServiceForm: async (req, res) => res.json({ success: true, data: {}, timestamp: new Date().toISOString() }),
  getQueueSnapshot: async (req, res) => res.json({ success: true, data: { active: 0, waiting: 0 }, timestamp: new Date().toISOString() }),
  getQueueStatus: async (req, res) => res.json({ success: true, data: {}, timestamp: new Date().toISOString() }),
  cancelQueueTask: async (req, res) => res.json({ success: true, message: 'cancelled', timestamp: new Date().toISOString() }),
  getHealthStatus: async (req, res) => res.json({ success: true, data: { overall: 'healthy' }, timestamp: new Date().toISOString() }),
  getStats: async (req, res) => res.json({ success: true, data: {}, timestamp: new Date().toISOString() }),
  resetStats: async (req, res) => res.json({ success: true, message: 'ok', timestamp: new Date().toISOString() }),
  clearCache: async (req, res) => res.json({ success: true, clearedItems: 0, timestamp: new Date().toISOString() })
};

	// 拦截 ServiceContainer：自包含 fake（不依赖真实 ServiceContainer）。
	// 此测试需要独立运行（npm run test:routes），不与需要真实容器的测试混跑。
	// 因为 ttsRoutes 在 require 时会调用 ProviderManifest 加载 manifest，
	// 而 manifest 加载是无副作用的静态读取，无 Redis/网络依赖，所以安全。
	const serviceContainerPath = require.resolve('../../src/config/ServiceContainer');
	const _FAKE_ADAPTER = FAKE_ADAPTER; // 闭包引用
	const fakeServiceContainer = {
	  _initialized: true,
	  initialize: () => Promise.resolve(fakeServiceContainer),
	  isInitialized: () => true,
	  get: (name) => {
	    if (name === 'ttsHttpAdapter') return _FAKE_ADAPTER;
	    throw new Error(`ttsRoutes test: unexpected service get: ${name}. Run this test standalone (npm run test:routes).`);
	  },
	  register: () => {},
	  getRegisteredServices: () => []
	};
	require.cache[serviceContainerPath] = {
	  id: serviceContainerPath,
	  filename: serviceContainerPath,
	  loaded: true,
	  exports: fakeServiceContainer
	};
	
	// 同样需要清理 ttsRoutes 自身的 cache（用于 after() 清理）
	const ttsRoutesPath = require.resolve('../../apps/api/routes/ttsRoutes');

// ==================== 构造测试 app ====================

const express = require('express');
const request = require('supertest');
const ttsRoutes = require('../../apps/api/routes/ttsRoutes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/tts', ttsRoutes);
  return app;
}

// ==================== 测试 ====================

describe('ttsRoutes 鉴权矩阵（阶段 4 基准）', () => {
  let app;

  before(() => {
    app = makeApp();
  });

  // 辅助：带 key 的请求
  const withKey = (req) => req.set('X-API-Key', 'test-key-1');
  // 辅助：无 key 的请求
  const noKey = (req) => req;

  // 鉴权矩阵：[method, path, body, 当前是否有auth]
  // hasAuth = 当前代码中该路由是否挂了 unifiedAuth（阶段 4 会把 false 的改为 true）
  const routes = [
    ['POST', '/api/tts/synthesize', { text: 'hi', service: 'x' }, true],
    ['POST', '/api/tts/', { text: 'hi', service: 'x' }, true],
    ['POST', '/api/tts/batch', { service: 'x', texts: ['hi'] }, true],
    ['GET', '/api/tts/voices', null, false],
    ['GET', '/api/tts/voices/someid', null, false],
    ['GET', '/api/tts/voices/someid/detail', null, false],
    ['GET', '/api/tts/providers', null, true],
    ['GET', '/api/tts/providers/metrics', null, true],
    ['POST', '/api/tts/providers/match', { requirements: {} }, true],
    ['GET', '/api/tts/capabilities/aliyun_qwen_http', null, true],
    ['GET', '/api/tts/filters', null, false],          // deprecated
    ['GET', '/api/tts/catalog', null, false],           // deprecated
    ['GET', '/api/tts/frontend', null, false],          // deprecated
    ['GET', '/api/tts/bootstrap', null, false],
    ['GET', '/api/tts/services/form-summary', null, false],
    ['GET', '/api/tts/services/aliyun_qwen_http/form', null, true],
    ['GET', '/api/tts/queue', null, false],
    ['GET', '/api/tts/queue/req-1', null, false],
    ['DELETE', '/api/tts/queue/req-1', null, false],
    ['GET', '/api/tts/health', null, true],
    ['GET', '/api/tts/stats', null, true],
    ['POST', '/api/tts/reset-stats', null, true],
    ['POST', '/api/tts/clear-cache', null, true]
  ];

  // 无 key 时的预期行为：有 auth 的应返回 401（或 403），无 auth 的应放行（2xx/4xx 但非 401）
  routes.forEach(([method, path, body, hasAuth]) => {
    it(`无 key 时 ${method} ${path} ${hasAuth ? '应被鉴权拒绝' : '当前放行（阶段4将加 auth）'}`, async () => {
      let req = request(app)[method.toLowerCase()](path);
      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        req = req.send(body);
      }
      const res = await noKey(req);

      if (hasAuth) {
        // 当前有 auth：无 key 应被拒绝（401 或 403）
        assert.ok(
          res.statusCode === 401 || res.statusCode === 403,
          `${method} ${path} 有 auth 但无 key 返回了 ${res.statusCode}（应 401/403）`
        );
      } else {
        // 当前无 auth：放行（不应是 401/403）
        // 注意：可能因参数校验返回 400，或 fake adapter 返回 200/404，都算"放行"
        assert.ok(
          res.statusCode !== 401 && res.statusCode !== 403,
          `${method} ${path} 当前无 auth，但返回了 ${res.statusCode}（鉴权层不应拦截）`
        );
      }
    });
  });

  // 带 key 时，所有路由都应通过鉴权层（2xx/4xx/404，但非 401）
  routes.forEach(([method, path, body, hasAuth]) => {
    it(`有 key 时 ${method} ${path} 应通过鉴权层`, async () => {
      let req = request(app)[method.toLowerCase()](path);
      req = withKey(req);
      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        req = req.send(body);
      }
      const res = await req;

      assert.ok(
        res.statusCode !== 401 && res.statusCode !== 403,
        `${method} ${path} 带 key 仍被鉴权拒绝：${res.statusCode}`
      );
    });
  });
});

describe('ttsRoutes happy path', () => {
  let app;
  before(() => { app = makeApp(); });

  it('POST /api/tts/synthesize 带 key 应返回 200 + audioUrl', async () => {
    const res = await request(app)
      .post('/api/tts/synthesize')
      .set('X-API-Key', 'test-key-1')
      .send({ text: 'hello', service: 'aliyun_qwen_http' });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.audioUrl);
  });

  it('POST /api/tts/batch 带 key 应返回 200 + summary', async () => {
    const res = await request(app)
      .post('/api/tts/batch')
      .set('X-API-Key', 'test-key-1')
      .send({ service: 'aliyun_qwen_http', texts: ['hello', 'world'] });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.summary);
  });

  it('POST /api/tts/synthesize 无 key 应返回 401', async () => {
    const res = await request(app)
      .post('/api/tts/synthesize')
      .send({ text: 'hello', service: 'aliyun_qwen_http' });

    assert.ok(res.statusCode === 401 || res.statusCode === 403);
  });

  it('POST /api/tts/synthesize 缺 text 应返回 400 VALIDATION_ERROR（鉴权通过后）', async () => {
    const res = await request(app)
      .post('/api/tts/synthesize')
      .set('X-API-Key', 'test-key-1')
      .send({ service: 'aliyun_qwen_http' });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
  });
});

// ==================== 全局清理 ====================
//
// 本文件通过 require.cache 注入了 fake ServiceContainer，污染了进程级模块缓存。
// mocha 在同进程顺序执行所有测试文件，若不清理，后续文件（如 TtsSynthesisService.test.js）
// require ServiceContainer 时会拿到 fake 而崩溃。
// 此全局 after 在本文件所有测试结束后执行，删除被污染的 cache 条目，
// 让后续测试文件能重新 require 到真实 ServiceContainer。
after(() => {
  delete require.cache[serviceContainerPath];
  delete require.cache[ttsRoutesPath];
});
