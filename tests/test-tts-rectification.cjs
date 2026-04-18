/**
 * TTS模块整改验收测试 - HTTP端点测试
 * 
 * P0: 顶层参数、/batch、volcengine_ws路由
 * P1: getProviders结构、服务键一致性
 */

const http = require('http');

const BASE = 'http://localhost:6678';
const KEY = 'key1';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE);
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ s: res.statusCode, d: JSON.parse(d), r: d }); } catch(e) { resolve({ s: res.statusCode, d: null, r: d }); } });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function run() {
  let pass = 0, fail = 0;
  const log = (t, ok, msg) => { console.log(ok ? '✅' : '❌', `[${t}]`, msg); ok ? pass++ : fail++; };

  console.log('\n=== P0 测试 ===\n');

  // P0-1: /synthesize 顶层参数
  try {
    const r = await req('POST', '/api/tts/synthesize', { text: '测试', service: 'moss_tts', voice: 'moss-tts-ashui' });
    log('P0', r.s !== 404, `/synthesize 路由存在 (${r.s}) - ${r.r?.substring(0, 80)}`);
  } catch(e) { log('P0', false, e.message); }

  // P0-2: /batch 批量合成
  try {
    const r = await req('POST', '/api/tts/batch', { service: 'moss_tts', texts: ['一', '二'] });
    log('P0', r.s === 200 || (r.d && r.d.data), `/batch 批量请求 (${r.s}) - ${r.r?.substring(0, 100)}`);
  } catch(e) { log('P0', false, e.message); }

  // P0-3: /batch 空数组校验
  try {
    const r = await req('POST', '/api/tts/batch', { service: 'moss_tts', texts: [] });
    log('P0', r.s === 400 && r.d?.details, `/batch 空数组校验 (${r.s}) - ${r.d?.details?.[0] || r.r?.substring(0, 80)}`);
  } catch(e) { log('P0', false, e.message); }

  // P0-4: /volcengine/websocket 路由
  try {
    const r = await req('POST', '/api/tts/volcengine/websocket', { text: '测试', voice: 'test' });
    log('P0', r.s !== 404, `/volcengine/websocket 路由存在 (${r.s}) - ${r.r?.substring(0, 80)}`);
  } catch(e) { log('P0', false, e.message); }

  console.log('\n=== P1 测试 ===\n');

  // P1-1: /providers 结构
  try {
    const r = await req('GET', '/api/tts/providers');
    if (r.s === 200 && r.d?.data && Array.isArray(r.d.data) && r.d.data.length > 0) {
      const p = r.d.data[0];
      const ok = p.key && p.provider && p.service && p.displayName && 'configured' in p;
      log('P1', ok, `/providers 结构 ${ok ? '正确' : '缺失字段: ' + Object.keys(p)}`);
    } else {
      log('P1', false, `/providers 响应异常 (${r.s})`);
    }
  } catch(e) { log('P1', false, e.message); }

  // P1-2: /voices 响应
  try {
    const r = await req('GET', '/api/tts/voices');
    log('P1', r.s === 200 && r.d?.data, `/voices 响应 (${r.s})`);
  } catch(e) { log('P1', false, e.message); }

  console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
