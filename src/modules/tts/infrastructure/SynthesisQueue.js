/**
 * SynthesisQueue - TTS 合成排队系统
 *
 * 控制并发合成数、排队等待、任务追踪、取消。
 * 任务不持久化（纯内存），适合单实例部署。
 * 后续扩展方向：Redis 分布式队列、多实例共享、持久化回放。
 */

const config = require('../config/synthesis-queue.json');

function envInt(key, fallback) {
  const v = parseInt(process.env[key], 10);
  return Number.isFinite(v) ? v : fallback;
}

class SynthesisQueue {
  constructor(options = {}) {
    this.maxConcurrency = options.maxConcurrency
      || envInt(config.envOverrides.maxConcurrency, config.maxConcurrency);
    this.maxQueueLength = options.maxQueueLength
      || envInt(config.envOverrides.maxQueueLength, config.maxQueueLength);
    this.queueTimeoutMs = options.queueTimeoutMs
      || envInt(config.envOverrides.queueTimeoutMs, config.queueTimeoutMs);
    this.completionRetentionMs = options.completionRetentionMs
      || envInt(config.envOverrides.completionRetentionMs, config.completionRetentionMs);

    this.active = new Map();      // requestId → TaskRecord
    this.waiting = [];            // [{ requestId, serviceKey, run, resolve, reject, enqueuedAt }]
    this.completed = new Map();   // requestId → { status, result?, error?, completedAt }

    this._nextId = 0;

    this.metrics = {
      totalEnqueued: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalCancelled: 0,
      totalTimedOut: 0,
      totalRejected: 0
    };
  }

  // ==================== 入队 ====================

  /**
   * 入队并等待合成完成
   * @param {string} serviceKey - 服务标识
   * @param {Function} taskFn - 执行函数，返回 Promise<AudioResult>
   * @param {Object} context - 上下文 { requestId?, text? }
   * @returns {Promise<{result: AudioResult, queueStats: Object}>}
   */
  enqueue(serviceKey, taskFn, context = {}) {
    const requestId = context.requestId || this._generateRequestId();
    const text = context.text || '';

    this.metrics.totalEnqueued++;

    return new Promise((resolve, reject) => {
      const entry = {
        requestId,
        serviceKey,
        taskFn,
        resolve,
        reject,
        text,
        abortController: new AbortController(),
        enqueuedAt: Date.now()
      };

      if (this.active.size < this.maxConcurrency) {
        this._startTask(entry);
      } else if (this.waiting.length < this.maxQueueLength) {
        this.waiting.push(entry);
        this._scheduleQueueTimeout(entry);
      } else {
        this.metrics.totalRejected++;
        const err = new Error(`Queue full (max ${this.maxQueueLength} waiting)`);
        err.code = 'QUEUE_FULL';
        reject(err);
      }
    });
  }

  // ==================== 取消 ====================

  /**
   * 取消任务
   * @returns {boolean} 是否成功取消
   */
  cancel(requestId) {
    // 1. 检查等待队列
    const idx = this.waiting.findIndex(t => t.requestId === requestId);
    if (idx !== -1) {
      const [entry] = this.waiting.splice(idx, 1);
      entry.abortController.abort();
      entry.reject(this._createCancelError(requestId));
      this.metrics.totalCancelled++;
      this._logCompleted(requestId, 'cancelled');
      return true;
    }

    // 2. 检查活跃任务（通过 AbortController 中断 HTTP）
    const active = this.active.get(requestId);
    if (active) {
      active.cancelled = true;
      if (active.abortController) active.abortController.abort();
      this.metrics.totalCancelled++;
      return true;
    }

    return false;
  }

  // ==================== 状态查询 ====================

  getStatus(requestId) {
    const activeIdx = this._findActiveIndex(requestId);
    if (activeIdx !== -1) {
      const a = this.active.get(requestId);
      return {
        requestId,
        status: 'processing',
        position: 0,
        startedAt: a.startedAt,
        serviceKey: a.serviceKey,
        text: a.text
      };
    }

    const waitIdx = this.waiting.findIndex(t => t.requestId === requestId);
    if (waitIdx !== -1) {
      const w = this.waiting[waitIdx];
      return {
        requestId,
        status: 'queued',
        position: waitIdx + 1,
        waitingCount: this.waiting.length,
        activeCount: this.active.size,
        enqueuedAt: new Date(w.enqueuedAt).toISOString()
      };
    }

    const completed = this.completed.get(requestId);
    if (completed) {
      return {
        requestId,
        status: completed.status,
        completedAt: completed.completedAt
      };
    }

    return null;
  }

  getQueueSnapshot() {
    return {
      active: this.active.size,
      waiting: this.waiting.length,
      maxConcurrency: this.maxConcurrency,
      maxQueueLength: this.maxQueueLength,
      metrics: { ...this.metrics },
      waitingTasks: this.waiting.map((w, i) => ({
        requestId: w.requestId,
        position: i + 1,
        serviceKey: w.serviceKey,
        waitingMs: Date.now() - w.enqueuedAt
      }))
    };
  }

  // ==================== 内部方法 ====================

  _startTask(entry) {
    const { requestId, serviceKey, taskFn, text, abortController } = entry;
    const startedAt = Date.now();

    const record = { requestId, serviceKey, text, startedAt, cancelled: false, abortController };
    this.active.set(requestId, record);

    taskFn(abortController.signal)
      .then(result => {
        if (record.cancelled) {
          this._logCompleted(requestId, 'cancelled');
          return;
        }
        entry.resolve({
          result,
          queueStats: {
            position: 0,
            waitingBefore: 0,
            waitMs: 0
          }
        });
        this._logCompleted(requestId, 'completed', { result });
        this.metrics.totalCompleted++;
      })
      .catch(err => {
        if (record.cancelled) {
          this._logCompleted(requestId, 'cancelled');
          return;
        }
        entry.reject(err);
        this._logCompleted(requestId, 'failed', { error: err.message });
        this.metrics.totalFailed++;
      })
      .finally(() => {
        this.active.delete(requestId);
        this._processNext();
      });
  }

  _processNext() {
    while (this.active.size < this.maxConcurrency && this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (next._timeoutId) clearTimeout(next._timeoutId);
      this._startTask(next);
    }
  }

  _scheduleQueueTimeout(entry) {
    entry._timeoutId = setTimeout(() => {
      const idx = this.waiting.indexOf(entry);
      if (idx !== -1) {
        this.waiting.splice(idx, 1);
        entry.reject(new Error(`Queue timeout after ${this.queueTimeoutMs}ms`));
        this.metrics.totalTimedOut++;
        this._logCompleted(entry.requestId, 'timeout');
      }
    }, this.queueTimeoutMs);
  }

  _logCompleted(requestId, status, extra = {}) {
    this.completed.set(requestId, {
      requestId,
      status,
      completedAt: new Date().toISOString(),
      ...extra
    });
    this._scheduleCompletedCleanup(requestId);
  }

  _scheduleCompletedCleanup(requestId) {
    setTimeout(() => {
      this.completed.delete(requestId);
    }, this.completionRetentionMs);
  }

  _findActiveIndex(requestId) {
    return this.active.has(requestId) ? 0 : -1;
  }

  _generateRequestId() {
    this._nextId++;
    return `qtask_${Date.now()}_${this._nextId}`;
  }

  _createCancelError(requestId) {
    const err = new Error(`Task cancelled: ${requestId}`);
    err.code = 'TASK_CANCELLED';
    return err;
  }
}

module.exports = { SynthesisQueue };
