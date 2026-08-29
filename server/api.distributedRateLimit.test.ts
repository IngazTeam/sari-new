import { beforeEach, describe, expect, it } from 'vitest';
import { apiRateLimitWindows } from '../drizzle/schema';
import {
  apiRateLimitBucketHash,
  pruneExpiredApiRateLimitWindows,
  reserveApiRateLimit,
} from './api/distributed-rate-limit';
import { getDb, getPool } from './db';

describe.skipIf(!process.env.DATABASE_URL)('distributed REST rate limiting (MySQL integration)', () => {
  beforeEach(async () => {
    const database = await getDb();
    if (!database) throw new Error('Database not initialized');
    await database.delete(apiRateLimitWindows);
  });

  it('serializes independent callers and admits exactly the shared limit', async () => {
    const decisions = await Promise.all(
      Array.from({ length: 16 }, () => reserveApiRateLimit({
        namespace: 'mysql-concurrency',
        identity: 'merchant-key:17',
        maxRequests: 10,
        windowMs: 60_000,
      })),
    );

    expect(decisions.filter(decision => decision.allowed)).toHaveLength(10);
    expect(decisions.filter(decision => !decision.allowed)).toHaveLength(6);
    expect(decisions.filter(decision => !decision.allowed).every(decision => decision.retryAfterMs > 0)).toBe(true);

    const database = await getDb();
    if (!database) throw new Error('Database not initialized');
    const rows = await database.select().from(apiRateLimitWindows);
    expect(rows).toHaveLength(1);
    expect(rows[0].requestCount).toBe(10);
  });

  it('separates namespaces and complete authenticated identities without persisting them', async () => {
    const policies = [
      { namespace: 'merchant-global', identity: 'key:alpha' },
      { namespace: 'merchant-global', identity: 'key:beta' },
      { namespace: 'platform-global', identity: 'key:alpha' },
    ];
    const first = await Promise.all(policies.map(policy => reserveApiRateLimit({
      ...policy,
      maxRequests: 1,
      windowMs: 60_000,
    })));
    const second = await Promise.all(policies.map(policy => reserveApiRateLimit({
      ...policy,
      maxRequests: 1,
      windowMs: 60_000,
    })));

    expect(first.every(decision => decision.allowed)).toBe(true);
    expect(second.every(decision => !decision.allowed)).toBe(true);
    const database = await getDb();
    if (!database) throw new Error('Database not initialized');
    const rows = await database.select().from(apiRateLimitWindows);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map(row => row.bucketHash)).size).toBe(3);
    expect(rows.every(row => /^[a-f0-9]{64}$/.test(row.bucketHash))).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/key:alpha|key:beta/);
  });

  it('resets an expired window to one request under the database clock', async () => {
    const policy = {
      namespace: 'mysql-expiry',
      identity: 'key:expiry',
      maxRequests: 2,
      windowMs: 60_000,
    } as const;
    await reserveApiRateLimit(policy);
    await reserveApiRateLimit(policy);
    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    await pool.execute(
      'UPDATE api_rate_limit_windows SET expires_at = DATE_SUB(NOW(3), INTERVAL 1 SECOND) WHERE bucket_hash = ?',
      [apiRateLimitBucketHash(policy.namespace, policy.identity)],
    );

    const reset = await reserveApiRateLimit(policy);
    expect(reset).toEqual({ allowed: true, remaining: 1, retryAfterMs: 60_000 });
    const database = await getDb();
    if (!database) throw new Error('Database not initialized');
    const [row] = await database.select().from(apiRateLimitWindows);
    expect(row.requestCount).toBe(1);
  });

  it('prunes only retained expired windows and leaves a live bucket intact', async () => {
    const oldPolicy = {
      namespace: 'mysql-cleanup', identity: 'old', maxRequests: 2, windowMs: 60_000,
    } as const;
    const livePolicy = {
      namespace: 'mysql-cleanup', identity: 'live', maxRequests: 2, windowMs: 60_000,
    } as const;
    await reserveApiRateLimit(oldPolicy);
    await reserveApiRateLimit(livePolicy);
    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    await pool.execute(
      'UPDATE api_rate_limit_windows SET expires_at = DATE_SUB(NOW(3), INTERVAL 2 HOUR) WHERE bucket_hash = ?',
      [apiRateLimitBucketHash(oldPolicy.namespace, oldPolicy.identity)],
    );

    const deleted = await pruneExpiredApiRateLimitWindows({
      retentionMs: 3_600_000,
      batchSize: 1,
      maxBatches: 10,
    });
    expect(deleted).toBe(1);
    const database = await getDb();
    if (!database) throw new Error('Database not initialized');
    const rows = await database.select().from(apiRateLimitWindows);
    expect(rows.map(row => row.bucketHash)).toEqual([
      apiRateLimitBucketHash(livePolicy.namespace, livePolicy.identity),
    ]);
  });
});
