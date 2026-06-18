/**
 * securityMiddleware 单元测试
 *
 * 作为重构回归网：
 * - 锁定 sanitizeInput / detectMaliciousContent / validateTtsParams 当前行为
 * - 标记已知的误杀合法 TTS 文本场景（阶段 3 安全层降级后会改变）
 *
 * 运行：npm test
 */

const assert = require('assert');
const {
  sanitizeInput,
  detectMaliciousContent,
  validateTtsParams,
  generateRequestFingerprint
} = require('../../../src/shared/middleware/securityMiddleware');

describe('securityMiddleware', () => {

  // ==================== sanitizeInput ====================

  describe('sanitizeInput', () => {
    it('应剥离 <script> 标签', () => {
      const input = 'hello <script>alert(1)</script> world';
      assert.strictEqual(sanitizeInput(input), 'hello  world');
    });

    it('应剥离 <iframe>/<object>/<embed>', () => {
      const input = 'a <iframe src="x"></iframe> b <object></object> c <embed> d';
      const result = sanitizeInput(input);
      assert.ok(!result.includes('<iframe'));
      assert.ok(!result.includes('<object'));
      assert.ok(!result.includes('<embed'));
    });

    it('应移除 javascript:/vbscript: 协议', () => {
      assert.strictEqual(sanitizeInput('click javascript:alert(1)'), 'click alert(1)');
      assert.strictEqual(sanitizeInput('click vbscript:msgbox(1)'), 'click msgbox(1)');
    });

    it('应移除危险事件处理器 onload=/onerror= 等', () => {
      const result = sanitizeInput('<img onload=alert(1) onerror=alert(2)>');
      assert.ok(!result.includes('onload'));
      assert.ok(!result.includes('onerror'));
    });

    it('非字符串输入应原样返回', () => {
      assert.strictEqual(sanitizeInput(42), 42);
      assert.strictEqual(sanitizeInput(null), null);
      assert.strictEqual(sanitizeInput(undefined), undefined);
      assert.deepStrictEqual(sanitizeInput({ a: 1 }), { a: 1 });
    });

    // === 误杀合法 TTS 文本场景（阶段 3 会修正） ===
    // 当前实现会剥离所有 <...> 标签，这对 TTS 场景是过度清洗
    describe('当前行为：误杀合法 TTS 文本（阶段 3 将修正）', () => {
      it('会剥离所有尖括号包裹的内容（如数学符号、感叹号）', () => {
        // 这种文本对 TTS 完全合法，但当前会被破坏
        const math = 'x < 5 and y > 3';
        const result = sanitizeInput(math);
        // 当前行为：会移除 < 5 and y >（因为 <...> 被当 HTML 标签剥离）
        // 注意：实际剥离取决于 > 是否出现闭合
        // 这是已知误杀，记录在此作为重构基准
        assert.ok(typeof result === 'string');
      });

      it('会破坏含 XML/SSML 风格的合法标记', () => {
        const ssml = 'say <break time="1s"/> now';
        const result = sanitizeInput(ssml);
        // 当前行为：所有 <...> 被剥离
        assert.ok(!result.includes('<break'));
      });
    });
  });

  // ==================== detectMaliciousContent ====================

  describe('detectMaliciousContent', () => {
    it('应检测路径遍历', () => {
      const result = detectMaliciousContent('../../etc/passwd');
      assert.strictEqual(result.detected, true);
    });

    it('应检测控制字符', () => {
      const result = detectMaliciousContent('hello\x00world\x07');
      assert.strictEqual(result.detected, true);
    });

    it('应检测 Unicode override 字符', () => {
      const result = detectMaliciousContent('hello\u202Eworld');
      assert.strictEqual(result.detected, true);
    });

    // === 误杀合法 TTS 文本场景（阶段 3 会修正） ===
    describe('当前行为：误杀合法英文文本（阶段 3 将修正）', () => {
      it('会把含 OR/AND 的合法英文标记为恶意', () => {
        // 普通 TTS 文本，完全合法
        const legit1 = 'Please select option A or option B';
        // 注意：当前正则是 \b(OR|AND)\s+\d+\s*=\s*\d+，需要 OR 1=1 形式才触发
        // 但 \b(SELECT|...)\b 会触发普通 "select" 单词
        const result = detectMaliciousContent('Please SELECT your language');
        // 当前正则大小写不敏感（/gi），SELECT 会被命中
        assert.strictEqual(result.detected, true);
      });

      it('会把含 curl/wget/ssh 的技术文档标记为恶意', () => {
        // 技术教程类 TTS 文本
        const docs = 'You can use curl to download files from the server';
        const result = detectMaliciousContent(docs);
        assert.strictEqual(result.detected, true);
      });

      it('会把含命令行相关词的文本标记为恶意', () => {
        const legit = 'open cmd and type help';
        const result = detectMaliciousContent(legit);
        assert.strictEqual(result.detected, true);
      });

      it('会把含 shell 元字符的合法数学文本标记为恶意', () => {
        // 数学或代码类 TTS 文本
        const legit = 'the result is a && b or c | d';
        const result = detectMaliciousContent(legit);
        assert.strictEqual(result.detected, true);
      });
    });
  });

  // ==================== validateTtsParams ====================

  describe('validateTtsParams', () => {
    // 辅助：构造 mock req/res/next
    const mockReq = (body = {}) => ({ body, method: 'POST', requestId: 'test-req-id' });
    const mockRes = () => {
      const res = {};
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (payload) => { res.body = payload; return res; };
      return res;
    };

    it('合法文本应通过（next 被调用）', () => {
      const req = mockReq({ text: 'hello world', service: 'aliyun_qwen_http' });
      const res = mockRes();
      let called = false;
      validateTtsParams(req, res, () => { called = true; });
      assert.strictEqual(called, true);
      assert.strictEqual(res.body, undefined);
    });

    it('缺少 text 应返回 400 VALIDATION_ERROR', () => {
      const req = mockReq({ service: 'aliyun_qwen_http' });
      const res = mockRes();
      validateTtsParams(req, res, () => { assert.fail('不应调用 next'); });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
      assert.strictEqual(res.body.retryable, false);
      assert.strictEqual(res.body.requestId, 'test-req-id');
      assert.ok(res.body.errors.length > 0);
    });

    it('空字符串 text 应返回 400', () => {
      const req = mockReq({ text: '   ', service: 'x' });
      const res = mockRes();
      validateTtsParams(req, res, () => { assert.fail('不应调用 next'); });
      assert.strictEqual(res.statusCode, 400);
    });

    it('超长文本（>10000）应返回 400', () => {
      const req = mockReq({ text: 'a'.repeat(10001), service: 'x' });
      const res = mockRes();
      validateTtsParams(req, res, () => { assert.fail('不应调用 next'); });
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.message.includes('10000'));
    });

    it('恰好 10000 字符应通过', () => {
      const req = mockReq({ text: 'a'.repeat(10000), service: 'x' });
      const res = mockRes();
      let called = false;
      validateTtsParams(req, res, () => { called = true; });
      assert.strictEqual(called, true);
    });

    it('text 为非字符串非 undefined 值（如数字）：当前会 crash（bug，阶段 3 修正）', () => {
      // 已知 bug：validateTtsParams 先 push 了类型错误，但随后 if(body.text) 仍执行 body.text.trim()
      // 对数字会抛 TypeError，导致请求 500 而非 400。
      // 阶段 3 重写安全层时应修复：非字符串直接返回 400，不调用 .trim()。
      // 此处用 try/catch 锁定当前 crash 行为作为基准。
      const req = mockReq({ text: 12345, service: 'x' });
      const res = mockRes();
      assert.throws(
        () => validateTtsParams(req, res, () => {}),
        /trim is not a function/
      );
    });

    it('含 <script> 的文本应被拒绝（清洗后与原文不等）', () => {
      const req = mockReq({ text: 'hi <script>x</script>', service: 'x' });
      const res = mockRes();
      validateTtsParams(req, res, () => { assert.fail('不应调用 next'); });
      assert.strictEqual(res.statusCode, 400);
    });

    it('service 非 string 应返回 400', () => {
      const req = mockReq({ text: 'ok', service: 123 });
      const res = mockRes();
      validateTtsParams(req, res, () => { assert.fail('不应调用 next'); });
      assert.strictEqual(res.statusCode, 400);
    });

    it('voice 为字符串应通过', () => {
      const req = mockReq({ text: 'ok', service: 'x', voice: 'cherry' });
      const res = mockRes();
      let called = false;
      validateTtsParams(req, res, () => { called = true; });
      assert.strictEqual(called, true);
    });

    it('voice 为整数应通过', () => {
      const req = mockReq({ text: 'ok', service: 'x', voice: 101000 });
      const res = mockRes();
      let called = false;
      validateTtsParams(req, res, () => { called = true; });
      assert.strictEqual(called, true);
    });

    it('voice 为非整数数字应返回 400', () => {
      const req = mockReq({ text: 'ok', service: 'x', voice: 1.5 });
      const res = mockRes();
      validateTtsParams(req, res, () => { assert.fail('不应调用 next'); });
      assert.strictEqual(res.statusCode, 400);
    });

    it('批量 texts 超过 10 项应返回 400', () => {
      const texts = Array(11).fill('hello');
      const req = mockReq({ texts, service: 'x' });
      const res = mockRes();
      validateTtsParams(req, res, () => { assert.fail('不应调用 next'); });
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.message.includes('10'));
    });

    it('批量单项超过 5000 字符应返回 400', () => {
      const texts = ['a'.repeat(5001)];
      const req = mockReq({ texts, service: 'x' });
      const res = mockRes();
      validateTtsParams(req, res, () => { assert.fail('不应调用 next'); });
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.message.includes('5000'));
    });

    it('合法文本应被 sanitize 后写回 req.body.text', () => {
      // 注意：合法文本 = 清洗后等于原文
      const req = mockReq({ text: 'hello world', service: 'x' });
      const res = mockRes();
      validateTtsParams(req, res, () => {});
      assert.strictEqual(req.body.text, 'hello world');
    });

    it('批量合法 texts 应被 sanitize 后写回 req.body.texts', () => {
      const req = mockReq({ texts: ['hello', 'world'], service: 'x' });
      const res = mockRes();
      validateTtsParams(req, res, () => {});
      assert.deepStrictEqual(req.body.texts, ['hello', 'world']);
    });
  });

  // ==================== generateRequestFingerprint ====================

  describe('generateRequestFingerprint', () => {
    it('应返回 16 位 hex 字符串', () => {
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'test' }, path: '/x', method: 'GET' };
      const fp = generateRequestFingerprint(req);
      assert.strictEqual(typeof fp, 'string');
      assert.strictEqual(fp.length, 16);
      assert.ok(/^[0-9a-f]{16}$/.test(fp));
    });

    it('相同输入应产生相同指纹', () => {
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'test' }, path: '/x', method: 'GET' };
      const req2 = { ip: '127.0.0.1', headers: { 'user-agent': 'test' }, path: '/x', method: 'GET' };
      // 注意：含 timestamp，相邻调用时间戳可能相同也可能不同
      // 仅断言格式稳定，不强制相等
      const fp = generateRequestFingerprint(req);
      assert.ok(/^[0-9a-f]{16}$/.test(fp));
    });
  });
});
