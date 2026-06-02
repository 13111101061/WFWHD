/**
 * Redis 连接池 — 单例管理
 *
 * 两个连接：
 *   - primary: 用于读写 (HGETALL/HSET/HDEL)
 *   - sub:     Pub/Sub 订阅专用（不能复用于命令）
 */

const Redis = require('ioredis');

let _primary = null;
let _sub = null;
let _ready = false;

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_DB = parseInt(process.env.REDIS_DB || '0', 10);

function createClient() {
  const client = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    db: REDIS_DB,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 200, 3000);
    },
    maxRetriesPerRequest: 3
  });

  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  return client;
}

async function initialize() {
  if (_ready) return;

  _primary = createClient();
  _sub = createClient();

  try {
    await _primary.connect();
    await _sub.connect();
    _ready = true;
    console.log(`[Redis] Connected to ${REDIS_HOST}:${REDIS_PORT} (db ${REDIS_DB})`);
  } catch (e) {
    console.warn(`[Redis] Connection failed (${e.message}) — running without Redis persistence`);
    _primary = null;
    _sub = null;
    _ready = false;
  }
}

function getPrimary() {
  return _primary;
}

function getSubscriber() {
  return _sub;
}

function isReady() {
  return _ready;
}

async function shutdown() {
  if (_sub) { _sub.disconnect(); _sub = null; }
  if (_primary) { _primary.quit(); _primary = null; }
  _ready = false;
}

module.exports = { initialize, getPrimary, getSubscriber, isReady, shutdown };
