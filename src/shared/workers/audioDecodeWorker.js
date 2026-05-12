const { parentPort } = require('worker_threads');

/**
 * Audio Decode Worker — 执行 Base64 → Buffer 解码
 *
 * 消息契约：
 *   in:  { id: number, base64: string }
 *   out: { id: number, buffer: Buffer | error: string }
 *
 * 不转移 ArrayBuffer：Worker 生命周期短，解码后立即返回，
 * 转移方式（零拷贝）在部分 Node 版本下 Buffer 会 detach，
 * 导致主线程 Buffer.from(detached) 行为不确定。
 */
parentPort.on('message', ({ id, base64 }) => {
  try {
    const buffer = Buffer.from(base64, 'base64');
    parentPort.postMessage({ id, buffer });
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
