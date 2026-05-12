/**
 * Cluster 多进程入口
 *
 * 使用方式：
 *   node apps/api/cluster.js
 *
 * 环境变量控制：
 *   CLUSTER_ENABLED=true|false  默认 false（单进程）
 *   CLUSTER_WORKERS=auto|N      默认 auto（CPU核心数）
 *
 * 多进程架构：
 *   Master 进程：只接收连接，分发给 Worker
 *   Worker 进程：处理完整的 HTTP 请求/响应生命周期
 *   每个 Worker 独立运行 TTS 服务栈
 *
 * 缓存不共享注意事项：
 *   每个 Worker 各自维护 CompiledCapability / VoiceRegistry /
 *   服务商 adapter 实例等内存缓存，多进程下内存占用 = Worker数 × 单份。
 *   并行需求高时建议将 CompiledCapability 和 VoiceRegistry
 *   放入 Redis 共享缓存，避免重复加载和内存膨胀。
 */

const cluster = require('cluster');
const os = require('os');

const ENABLED = process.env.CLUSTER_ENABLED === 'true';
const WORKER_COUNT = process.env.CLUSTER_WORKERS === 'auto' || !process.env.CLUSTER_WORKERS
  ? os.cpus().length
  : parseInt(process.env.CLUSTER_WORKERS, 10);

if (!ENABLED) {
  require('./index');
  return;
}

if (cluster.isMaster) {
  console.log(`[Cluster] Master ${process.pid} starting ${WORKER_COUNT} workers (${os.cpus().length} CPUs)`);

  for (let i = 0; i < WORKER_COUNT; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[Cluster] Worker ${worker.process.pid} died (code=${code}, signal=${signal}). Restarting...`);
    cluster.fork();
  });

  cluster.on('online', (worker) => {
    console.log(`[Cluster] Worker ${worker.process.pid} online`);
  });

  process.on('SIGTERM', () => {
    console.log('[Cluster] SIGTERM received, shutting down...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGTERM');
    }
    setTimeout(() => process.exit(0), 5000);
  });

} else {
  require('./index');
}
