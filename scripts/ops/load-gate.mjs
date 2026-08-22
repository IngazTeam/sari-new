#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { percentile, validateLoadConfig, validateLoadTarget } from './ops-policy.mjs';

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--allow-staging') result.allowStaging = true;
    else if (arg.startsWith('--') && arg.includes('=')) {
      const [key, ...value] = arg.slice(2).split('=');
      result[key] = value.join('=');
    } else throw new Error(`Unsupported argument: ${arg}`);
  }
  return result;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runLoad(target, config) {
  const totalPlanned = Math.ceil(config.requestsPerSecond * config.durationSeconds);
  const startedAt = performance.now();
  let nextIndex = 0;
  const latencies = [];
  const statuses = {};
  let errors = 0;
  let serverErrors = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= totalPlanned) return;
      const scheduledAt = startedAt + (index * 1_000) / config.requestsPerSecond;
      const delay = scheduledAt - performance.now();
      if (delay > 0) await sleep(delay);
      const requestStarted = performance.now();
      try {
        const response = await fetch(target, {
          method: 'GET', redirect: 'manual', cache: 'no-store',
          signal: AbortSignal.timeout(config.timeoutMs),
          headers: { accept: 'application/json', 'user-agent': 'sari-staging-load-gate/1.0' },
        });
        statuses[response.status] = (statuses[response.status] || 0) + 1;
        if (response.status < 200 || response.status >= 400) errors += 1;
        if (response.status >= 500) serverErrors += 1;
        await response.body?.cancel();
      } catch {
        errors += 1;
        statuses.network_error = (statuses.network_error || 0) + 1;
      } finally {
        latencies.push(performance.now() - requestStarted);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(config.concurrency, totalPlanned) }, () => worker()));
  const elapsedSeconds = (performance.now() - startedAt) / 1_000;
  const total = latencies.length;
  const errorRate = total ? errors / total : 1;
  const p95Ms = percentile(latencies, 0.95);
  const passed = total === totalPlanned && serverErrors === 0 && errorRate <= config.maxErrorRate && p95Ms <= config.p95LimitMs;
  return {
    passed,
    target: `${target.origin}${target.pathname}`,
    method: 'GET',
    plannedRequests: totalPlanned,
    completedRequests: total,
    elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
    achievedRequestsPerSecond: Number((total / Math.max(config.durationSeconds, elapsedSeconds)).toFixed(2)),
    statusCounts: statuses,
    serverErrors,
    errorRate: Number(errorRate.toFixed(6)),
    latencyMs: {
      p50: Number(percentile(latencies, 0.5)?.toFixed(2)),
      p95: Number(p95Ms?.toFixed(2)),
      p99: Number(percentile(latencies, 0.99)?.toFixed(2)),
      max: Number(Math.max(...latencies).toFixed(2)),
    },
    thresholds: { p95Ms: config.p95LimitMs, maxErrorRate: config.maxErrorRate },
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const config = validateLoadConfig({
    durationSeconds: args['duration-seconds'], concurrency: args.concurrency,
    requestsPerSecond: args.rps, timeoutMs: args['timeout-ms'],
    p95LimitMs: args['p95-ms'], maxErrorRate: args['max-error-rate'],
  });
  const target = validateLoadTarget({
    origin: args.origin || 'http://127.0.0.1:3000', pathname: args.path || '/health',
    allowStaging: Boolean(args.allowStaging), stagingOrigin: process.env.LOAD_TEST_STAGING_ORIGIN,
  });
  if (args.dryRun) {
    console.log(JSON.stringify({ dryRun: true, target: `${target.origin}${target.pathname}`, method: 'GET', config }, null, 2));
  } else {
    const result = await runLoad(target, config);
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  }
} catch (error) {
  console.error(`[load-gate] ${error instanceof Error ? error.message : 'Invalid configuration'}`);
  process.exitCode = 2;
}
