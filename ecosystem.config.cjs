module.exports = {
  apps: [
    {
      name: 'sari',
      script: 'dist/index.js',

      // ─── Cluster Mode ──────────────────────────────────
      // Uses all available CPU cores for maximum throughput
      // Each instance gets its own event loop + DB pool (25 conn each)
      // PM2 handles load balancing via round-robin
      exec_mode: 'cluster',
      instances: 'max',       // Use all CPU cores

      // ─── Process Management ────────────────────────────
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: 10000,     // 10s grace period for graceful shutdown
      listen_timeout: 8000,    // 8s to start before marked unhealthy
      wait_ready: false,

      // ─── Environment ──────────────────────────────────
      env: {
        NODE_ENV: 'production',
        PORT: 3000
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
