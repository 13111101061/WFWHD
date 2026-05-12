const { parentPort } = require('worker_threads');

parentPort.on('message', ({ id, base64 }) => {
  try {
    const buffer = Buffer.from(base64, 'base64');
    parentPort.postMessage({ id, buffer: buffer.buffer }, [buffer.buffer]);
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
