const path = require('node:path');

const configuredConcurrency = Number.parseInt(process.env.SARI_WEB_CONCURRENCY || '2', 10);
if (!Number.isInteger(configuredConcurrency) || configuredConcurrency < 1 || configuredConcurrency > 4) {
  throw new Error('SARI_WEB_CONCURRENCY must be an integer between 1 and 4');
}

const configuredPort = Number.parseInt(process.env.PORT || '3000', 10);
if (!Number.isInteger(configuredPort) || configuredPort < 1024 || configuredPort > 65535) {
  throw new Error('PORT must be an integer between 1024 and 65535');
}

module.exports = {
  apps: [
    {
      name: 'sari',
      script: 'dist/index.js',
      cwd: __dirname,

      // ─── Cluster Mode ──────────────────────────────────
      // Bounded web workers, with ten DB connections per process by default.
      // The dedicated inbound process has its own ten-connection pool.
      // PM2 handles load balancing via round-robin
      exec_mode: 'cluster',
      // Keep aggregate DB pool usage bounded. Scale only after measuring the
      // connection budget; every worker owns its own pool.
      instances: configuredConcurrency,

      // ─── Process Management ────────────────────────────
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: 35000,     // Server has a 30s graceful shutdown deadline.
      listen_timeout: 60000,   // Includes DB/schema readiness validation.
      wait_ready: true,
      min_uptime: '30s',
      max_restarts: 10,
      exp_backoff_restart_delay: 1000,

      // ─── Environment ──────────────────────────────────
      env: {
        NODE_ENV: 'production',
        SARI_INBOUND_WORKER: 'external',
        SARI_DB_POOL_SIZE: '10',
        PORT: configuredPort,
        SARI_ENV_FILE: process.env.SARI_ENV_FILE || path.join(__dirname, '.env'),
      },

      // ─── Logging ──────────────────────────────────────
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      merge_logs: true,         // Merge logs from all cluster instances
    },
    {
      name: 'sari-inbound',
      script: 'dist/worker.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      kill_timeout: 35000,
      listen_timeout: 60000,
      wait_ready: true,
      min_uptime: '30s',
      max_restarts: 10,
      exp_backoff_restart_delay: 1000,
      env: {
        NODE_ENV: 'production',
        SARI_DB_POOL_SIZE: '10',
        SARI_ENV_FILE: process.env.SARI_ENV_FILE || path.join(__dirname, '.env'),
      },
      error_file: './logs/inbound-err.log',
      out_file: './logs/inbound-out.log',
      time: true,
    }
  ]
};
