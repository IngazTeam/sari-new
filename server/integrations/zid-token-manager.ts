import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db';
import { decryptSecret, encryptSecret } from '../security/secrets';
import { refreshZidAuthorization } from './zid-oauth';

const REFRESH_SKEW_MS = 5 * 60_000;
const UNKNOWN_EXPIRY_RECHECK_MS = 55 * 60_000;

type ZidCredentialRow = RowDataPacket & {
  id: number;
  accessToken: string | null;
  refreshToken: string | null;
  settings: string | null;
};

export type ZidApiCredentials = {
  authorizationToken: string;
  managerToken: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
};

function parseSettings(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function requireCredential(value: string | null | undefined): string {
  const plaintext = decryptSecret(value)?.trim().replace(/^Bearer\s+/i, '');
  if (!plaintext) throw new Error('ZID_REAUTH_REQUIRED');
  return plaintext;
}

export async function getValidZidApiCredentials(input: {
  merchantId: number;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}): Promise<ZidApiCredentials> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // The row lock is intentionally held through the bounded refresh request:
    // only one process may rotate a single-use refresh token for this merchant.
    const [rows] = await connection.execute<ZidCredentialRow[]>(
      `SELECT pi.id, pi.access_token AS accessToken, pi.refresh_token AS refreshToken, pi.settings
         FROM platform_integrations pi
         INNER JOIN merchants m ON m.id = pi.merchant_id AND m.status = 'active'
        WHERE pi.merchant_id = ? AND pi.platform_type = 'zid' AND pi.is_active = 1
        LIMIT 1 FOR UPDATE`,
      [input.merchantId],
    );
    const row = rows[0];
    if (!row) throw new Error('ZID_NOT_CONNECTED');

    const settings = parseSettings(row.settings);
    let authorizationToken = requireCredential(row.accessToken);
    let managerToken = requireCredential(
      typeof settings.managerToken === 'string' ? settings.managerToken : null,
    );
    let refreshToken = row.refreshToken ? requireCredential(row.refreshToken) : undefined;
    const tokenExpiresAt = typeof settings.tokenExpiresAt === 'string'
      ? settings.tokenExpiresAt
      : undefined;
    const expiryMs = tokenExpiresAt ? Date.parse(tokenExpiresAt) : Number.NaN;
    const nowMs = input.nowMs ?? Date.now();
    const shouldRefresh = Boolean(tokenExpiresAt) && (
      !Number.isFinite(expiryMs) || expiryMs <= nowMs + REFRESH_SKEW_MS
    );

    if (shouldRefresh) {
      if (!refreshToken) throw new Error('ZID_REAUTH_REQUIRED');
      const refreshed = await refreshZidAuthorization(refreshToken, input.fetchImpl);
      authorizationToken = refreshed.authorizationToken;
      managerToken = refreshed.managerToken;
      refreshToken = refreshed.refreshToken || refreshToken;
      const nextExpiry = new Date(nowMs + (
        refreshed.expiresIn && refreshed.expiresIn > 0
          ? refreshed.expiresIn * 1000
          : UNKNOWN_EXPIRY_RECHECK_MS
      )).toISOString();
      settings.managerToken = encryptSecret(managerToken);
      settings.tokenExpiresAt = nextExpiry;
      await connection.execute(
        `UPDATE platform_integrations
            SET access_token = ?, refresh_token = ?, settings = ?, updated_at = NOW()
          WHERE id = ?`,
        [
          encryptSecret(authorizationToken),
          encryptSecret(refreshToken),
          JSON.stringify(settings),
          row.id,
        ],
      );
    }

    await connection.commit();
    return {
      authorizationToken,
      managerToken,
      refreshToken,
      tokenExpiresAt: typeof settings.tokenExpiresAt === 'string'
        ? settings.tokenExpiresAt
        : undefined,
    };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}
