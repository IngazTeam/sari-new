import path from 'node:path';

export const LOAD_PATHS = new Set(['/health', '/ready']);
export const CRITICAL_TABLES = Object.freeze([
  'users', 'merchants', 'products', 'customer_profiles', 'conversations', 'messages',
  'orders', 'merchant_subscriptions', 'payment_transactions',
]);

const SAFE_RESTORE_DATABASE = /(?:^|[_-])(restore|drill|test)(?:[_-]|$)/i;

function isProductionHost(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === 'sary.live' || normalized.endsWith('.sary.live');
}

function requireFiniteNumber(value, name, { min, max }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

export function validateLoadConfig(input) {
  const concurrency = requireFiniteNumber(input.concurrency ?? 5, 'concurrency', { min: 1, max: 25 });
  if (!Number.isInteger(concurrency)) throw new Error('concurrency must be an integer');
  return {
    durationSeconds: requireFiniteNumber(input.durationSeconds ?? 10, 'durationSeconds', { min: 1, max: 600 }),
    concurrency,
    requestsPerSecond: requireFiniteNumber(input.requestsPerSecond ?? 10, 'requestsPerSecond', { min: 1, max: 50 }),
    timeoutMs: Math.trunc(requireFiniteNumber(input.timeoutMs ?? 5_000, 'timeoutMs', { min: 250, max: 30_000 })),
    p95LimitMs: requireFiniteNumber(input.p95LimitMs ?? 750, 'p95LimitMs', { min: 1, max: 30_000 }),
    maxErrorRate: requireFiniteNumber(input.maxErrorRate ?? 0.01, 'maxErrorRate', { min: 0, max: 1 }),
  };
}

export function validateLoadTarget({ origin, pathname = '/health', allowStaging = false, stagingOrigin }) {
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Load origin must use HTTP or HTTPS');
  if (url.username || url.password) throw new Error('Credentials are forbidden in the load origin');
  if (url.search || url.hash || url.pathname !== '/') throw new Error('Load origin must not contain a path, query, or fragment');
  if (isProductionHost(url.hostname)) throw new Error('Production load testing is always forbidden');

  const target = new URL(pathname, url);
  if (target.search || target.hash || !LOAD_PATHS.has(target.pathname)) {
    throw new Error(`Load path must be one of: ${[...LOAD_PATHS].join(', ')}`);
  }

  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase());
  if (!isLocal) {
    if (url.protocol !== 'https:') throw new Error('Remote staging load testing requires HTTPS');
    if (!allowStaging) throw new Error('Non-local load testing requires --allow-staging');
    if (!stagingOrigin) throw new Error('LOAD_TEST_STAGING_ORIGIN is required');
    const expected = new URL(stagingOrigin);
    if (!['http:', 'https:'].includes(expected.protocol) || expected.username || expected.password || expected.pathname !== '/' || expected.search || expected.hash) {
      throw new Error('LOAD_TEST_STAGING_ORIGIN must be a credential-free HTTP(S) origin');
    }
    if (expected.origin !== url.origin) throw new Error('Load origin does not match LOAD_TEST_STAGING_ORIGIN');
    if (isProductionHost(expected.hostname)) throw new Error('Production cannot be configured as staging');
  }
  return target;
}

export function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)];
}

export function databaseIdentity(databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'mysql:') throw new Error('Database URL must use mysql://');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!url.hostname || !database) throw new Error('Database URL must include a host and database name');
  return {
    host: url.hostname.toLowerCase(),
    port: url.port || '3306',
    database,
    key: `${url.hostname.toLowerCase()}:${url.port || '3306'}/${database}`,
  };
}

export function validateRestoreTarget({ sourceDatabaseUrl, restoreDatabaseUrl, acknowledgement }) {
  if (acknowledgement !== 'isolated-test-database') {
    throw new Error('RESTORE_DRILL_ACK must equal isolated-test-database');
  }
  const source = databaseIdentity(sourceDatabaseUrl);
  const restore = databaseIdentity(restoreDatabaseUrl);
  if (source.key === restore.key) throw new Error('Restore target must differ from the source database');
  if (!SAFE_RESTORE_DATABASE.test(restore.database)) {
    throw new Error('Restore database name must contain restore, drill, or test as a separate token');
  }
  return { source, restore };
}

export function validateManifestSource(manifest, sourceDatabaseUrl) {
  if (manifest?.database !== databaseIdentity(sourceDatabaseUrl).key) {
    throw new Error('Manifest does not belong to SOURCE_DATABASE_URL');
  }
  return true;
}

export function resolveManifestPath(workspaceRoot, requestedPath) {
  if (!requestedPath) throw new Error('--manifest is required');
  const allowedRoot = path.resolve(workspaceRoot, 'artifacts', 'ops');
  const resolved = path.resolve(workspaceRoot, requestedPath);
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('Manifest path must remain under artifacts/ops');
  }
  if (path.extname(resolved).toLowerCase() !== '.json') throw new Error('Manifest must be a JSON file');
  return resolved;
}

export function compareRestoreManifests(source, restored) {
  const failures = [];
  if (source.schemaVersion !== 1 || restored.schemaVersion !== 1) failures.push('unsupported manifest schema');
  for (const table of CRITICAL_TABLES) {
    const expected = source.tables?.[table];
    const actual = restored.tables?.[table];
    if (!expected || !actual) {
      failures.push(`${table}: missing`);
      continue;
    }
    if (expected.schemaHash !== actual.schemaHash) failures.push(`${table}: schema mismatch`);
    if (String(expected.rowCount) !== String(actual.rowCount)) failures.push(`${table}: row count mismatch`);
  }
  return { ok: failures.length === 0, failures };
}
