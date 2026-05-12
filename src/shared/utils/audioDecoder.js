/**
 * Audio Decoder — 用 Worker Thread 做 Base64 解码，避免大音频阻塞主线程
 *
 * 逻辑：
 * - 小音频（≤ 512KB）直接在主线程同步解码，省去线程通信开销
 * - 大音频（> 512KB）扔到 Worker 池异步解码，不占主线程
 */

const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

const WORKER_THRESHOLD = 512 * 1024; // Base64 字符串 512KB≈600KB 解码后
const POOL_SIZE = Math.max(1, os.cpus().length - 1);

let _pool = null;
let _taskId = 0;

class WorkerPool {
  constructor(size) {
    this.size = size;
    this.workers = [];
    this.queue = [];
    this.callbacks = new Map();

    const scriptPath = path.join(__dirname, 'workers', 'audioDecodeWorker.js');

    for (let i = 0; i < size; i++) {
      const worker = new Worker(scriptPath);
      worker.on('message', (msg) => this._onMessage(worker, msg));
      worker.on('error', (err) => this._onError(worker, err));
      this.workers.push({ worker, busy: false });
    }
  }

  _getAvailableWorker() {
    return this.workers.find(w => !w.busy) || null;
  }

  _onMessage(workerRef, msg) {
    const cb = this.callbacks.get(msg.id);
    if (cb) {
      this.callbacks.delete(msg.id);
      if (msg.error) {
        cb.reject(new Error(msg.error));
      } else {
        cb.resolve(Buffer.from(msg.buffer));
      }
      workerRef.busy = false;
      this._processQueue();
    }
  }

  _onError(workerRef, err) {
    for (const entry of this.workers) {
      if (entry === workerRef) {
        entry.busy = false;
        break;
      }
    }
    this._processQueue();
  }

  async decode(base64String) {
    if (base64String.length < WORKER_THRESHOLD) {
      return Buffer.from(base64String, 'base64');
    }

    const id = ++_taskId;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      const available = this._getAvailableWorker();

      if (available) {
        available.busy = true;
        available.worker.postMessage({ id, base64: base64String });
      } else {
        this.queue.push({ id, base64: base64String });
      }
    });
  }

  _processQueue() {
    if (this.queue.length === 0) return;
    const available = this._getAvailableWorker();
    if (!available) return;
    const job = this.queue.shift();
    available.busy = true;
    available.worker.postMessage({ id: job.id, base64: job.base64 });
  }

  destroy() {
    for (const { worker } of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.callbacks.clear();
    this.queue = [];
  }
}

function getPool() {
  if (!_pool) {
    _pool = new WorkerPool(POOL_SIZE);
  }
  return _pool;
}

/**
 * 解码 Base64 音频数据 → Buffer
 * 小数据同步解码，大数据走 Worker 池异步解码
 * @param {string} base64String
 * @returns {Promise<Buffer>}
 */
async function decodeAudio(base64String) {
  return getPool().decode(base64String);
}

module.exports = { decodeAudio, WorkerPool };
