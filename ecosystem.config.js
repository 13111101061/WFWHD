/**
 * PM2 进程管理配置
 *
 * 使用方式：
 *   pm2 start ecosystem.config.js                    # 启动默认（单进程）
 *   pm2 start ecosystem.config.js --only tts-cluster   # 启动集群模式
 *   pm2 start ecosystem.config.js --env production     # 生产环境
 *   pm2 stop tts-microservice                          # 停止
 *   pm2 restart tts-microservice                       # 重启
 *   pm2 logs tts-microservice                          # 查看日志
 *   pm2 monit                                          # 监控面板
 */

const os = require('os');

module.exports = {
  apps: [
    // ── 单进程模式（开发 / 轻量部署） ──
    {
      name: 'tts-microservice',
      script: './apps/api/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        PORT: 6678,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 6678,
      },
      // 日志
      error_file: './logs/tts-error.log',
      out_file: './logs/tts-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      // 重启策略
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
    },

    // ── 集群模式（生产 / 高并发） ──
    {
      name: 'tts-cluster',
      script: './apps/api/cluster.js',
      cwd: __dirname,
      instances: 1,           // cluster.js 内部自行 fork worker
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 6678,
        CLUSTER_ENABLED: 'true',
        CLUSTER_WORKERS: 'auto',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 6678,
        CLUSTER_ENABLED: 'true',
        CLUSTER_WORKERS: 'auto',
      },
      error_file: './logs/tts-cluster-error.log',
      out_file: './logs/tts-cluster-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
    },
  ],
};
