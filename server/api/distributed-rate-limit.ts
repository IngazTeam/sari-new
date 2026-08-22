import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { privacyHashExact } from '../accounts/privacy-hash';

export interface ApiRateLimitPolicy {
  namespace: string;
  identity: string;
  maxRequests: number;
  windowMs: number;
}

export interface ApiRateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

interface ApiRateLimitRow extends RowDataPacket {
  requestCount: number | string;
  expired: number | string;
  retryAfterMs: number | string | null;
}

function validatePolicy(policy: ApiRateLimitPolicy): void {
  if (
    !/^[a-z0-9:_-]{1,80}$/.test(policy.namespace)
    || typeof policy.identity !== 'string'
    || policy.identity.length < 1
    || policy.identity.length > 512
    || !Number.isSafeInteger(policy.maxRequests)
    || policy.maxRequests < 1
    || policy.maxRequests > 10_000
    || !Number.isSafeInteger(policy.windowMs)
    || policy.windowMs < 1_000
    || policy.windowMs > 86_400_000
  ) {
    throw new Error('Invalid API rate-limit policy');
  }
}

export function apiRateLimitBucketHash(namespace: string, identity: string): string {
  return privacyHashExact(`${namespace}\u0000${identity}`);
}

/**
 * Atomically reserves one request in a fixed window shared by every app instance.
 * The bucket stores only an HMAC; API credentials, tenant domains, and key IDs are
 * never persisted in the limiter table.
 */
export async function reserveApiRateLimit(policy: ApiRateLimitPolicy): Promise<ApiRateLimitDecision> {
  validatePolicy(policy);
  const bucketHash = apiRateLimitBucketHash(policy.namespace, policy.identity);
  const windowMicros = policy.windowMs * 1_000;

  await assertRuntimeSchema('distributed API rate limiting', [
    {
      table: 'api_rate_limit_windows',
      columns: ['bucket_hash', 'window_started_at', 'expires_at', 'request_count'],
    },
  ]);
  const pool = await getPool();
  if (!pool) throw new Error('API rate-limit storage unavailable');
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO api_rate_limit_windows (
         bucket_hash, window_started_at, expires_at, request_count
       ) VALUES (?, NOW(3), TIMESTAMPADD(MICROSECOND, ?, NOW(3)), 0)
       ON DUPLICATE KEY UPDATE bucket_hash = bucket_hash`,
      [bucketHash, windowMicros],
    );
    const [rows] = await connection.execute<ApiRateLimitRow[]>(
      `SELECT request_count AS requestCount,
              expires_at <= NOW(3) AS expired,
              GREATEST(0, TIMESTAMPDIFF(MICROSECOND, NOW(3), expires_at) DIV 1000) AS retryAfterMs
         FROM api_rate_limit_windows
        WHERE bucket_hash = ?
        FOR UPDATE`,
      [bucketHash],
    );
    const row = rows[0];
    if (!row) throw new Error('API rate-limit bucket unavailable');

    const expired = Number(row.expired) === 1;
    const currentCount = Number(row.requestCount);
    if (!Number.isSafeInteger(currentCount) || currentCount < 0) {
      throw new Error('Invalid API rate-limit counter');
    }

    if (expired) {
      await connection.execute(
        `UPDATE api_rate_limit_windows
            SET window_started_at = NOW(3),
                expires_at = TIMESTAMPADD(MICROSECOND, ?, NOW(3)),
                request_count = 1
          WHERE bucket_hash = ?`,
        [windowMicros, bucketHash],
      );
      await connection.commit();
      return { allowed: true, remaining: policy.maxRequests - 1, retryAfterMs: policy.windowMs };
    }

    if (currentCount >= policy.maxRequests) {
      const retryAfterMs = Math.max(1, Number(row.retryAfterMs) || policy.windowMs);
      await connection.commit();
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    const nextCount = currentCount + 1;
    await connection.execute(
      'UPDATE api_rate_limit_windows SET request_count = ? WHERE bucket_hash = ?',
      [nextCount, bucketHash],
    );
    await connection.commit();
    return {
      allowed: true,
      remaining: policy.maxRequests - nextCount,
      retryAfterMs: 0,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export interface ApiRateLimitCleanupOptions {
  retentionMs?: number;
  batchSize?: number;
  maxBatches?: number;
}

/**
 * Deletes old fixed-window buckets in bounded batches. A valid integration can
 * still present many tenant identifiers, so expired bucket retention must not
 * depend on those identifiers being trustworthy or finite.
 */
export async function pruneExpiredApiRateLimitWindows(
  options: ApiRateLimitCleanupOptions = {},
): Promise<number> {
  const retentionMs = options.retentionMs ?? 86_400_000;
  const batchSize = options.batchSize ?? 5_000;
  const maxBatches = options.maxBatches ?? 10;
  if (
    !Number.isSafeInteger(retentionMs)
    || retentionMs < 3_600_000
    || retentionMs > 2_592_000_000
    || !Number.isSafeInteger(batchSize)
    || batchSize < 1
    || batchSize > 10_000
    || !Number.isSafeInteger(maxBatches)
    || maxBatches < 1
    || maxBatches > 100
  ) {
    throw new Error('Invalid API rate-limit cleanup policy');
  }

  await assertRuntimeSchema('API rate-limit cleanup', [
    { table: 'api_rate_limit_windows', columns: ['bucket_hash', 'expires_at'] },
  ]);
  const pool = await getPool();
  if (!pool) throw new Error('API rate-limit storage unavailable');

  let deleted = 0;
  const retentionMicros = retentionMs * 1_000;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM api_rate_limit_windows
        WHERE expires_at < TIMESTAMPADD(MICROSECOND, ?, NOW(3))
        ORDER BY expires_at
        LIMIT ?`,
      [-retentionMicros, batchSize],
    );
    deleted += result.affectedRows;
    if (result.affectedRows < batchSize) break;
  }
  return deleted;
}
