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
      // Uses all available CPU cores for maximum throughput
      // Each instance gets its own event loop + DB pool (25 conn each)
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
        PORT: configuredPort,
        SARI_ENV_FILE: process.env.SARI_ENV_FILE || path.join(__dirname, '.env'),
      },

      // ─── Logging ──────────────────────────────────────
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      merge_logs: true,         // Merge logs from all cluster instances
    }
  ]
};
