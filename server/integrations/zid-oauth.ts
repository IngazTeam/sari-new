import crypto from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { privacyHashExact } from '../accounts/privacy-hash';
import { ENV } from '../_core/env';
import { getPool } from '../db';
import { buildPublicUrl } from '../utils/public-url';

const ZID_AUTHORIZE_URL = 'https://oauth.zid.sa/oauth/authorize';
const ZID_TOKEN_URL = 'https://oauth.zid.sa/oauth/token';
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const OAUTH_BEGIN_COOLDOWN_SECONDS = 10;
const OAUTH_STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type OAuthStateRow = RowDataPacket & { id: number };

export class ZidOAuthError extends Error {
  constructor(public readonly code: 'configuration' | 'invalid_state' | 'rate_limited' | 'token_exchange') {
    super(code);
  }
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && String((error as { code?: unknown }).code) === 'ER_DUP_ENTRY';
}

function oauthConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = ENV.zidClientId.trim();
  const clientSecret = ENV.zidClientSecret.trim();
  if (!clientId || !clientSecret) throw new ZidOAuthError('configuration');
  const redirectUri = buildPublicUrl('/merchant/zid/callback');
  const parsed = new URL(redirectUri);
  if (ENV.isProduction && parsed.protocol !== 'https:') throw new ZidOAuthError('configuration');
  return { clientId, clientSecret, redirectUri };
}

function sessionDigest(userId: number, sessionId: string): string {
  return privacyHashExact(`zid-oauth-session:${userId}:${sessionId}`);
}

export async function beginZidOAuth(input: {
  merchantId: number;
  userId: number;
  sessionId: string;
}): Promise<{ authorizationUrl: string }> {
  const config = oauthConfig();
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');
  const state = crypto.randomBytes(32).toString('base64url');
  const stateHash = privacyHashExact(`zid-oauth-state:${state}`);
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS)
    .toISOString().slice(0, 19).replace('T', ' ');

  const connection = await pool.getConnection();
  try {
    // The conditional write and unique merchant/user key form a distributed
    // cooldown: one server may rotate an old state, while concurrent servers
    // either miss the condition or lose the insert race and fail closed.
    const [rotation] = await connection.execute<ResultSetHeader>(
      `UPDATE zid_oauth_states
          SET state_hash = ?, session_hash = ?, expires_at = ?, consumed_at = NULL, created_at = NOW()
        WHERE merchant_id = ? AND user_id = ?
          AND created_at <= DATE_SUB(NOW(), INTERVAL ${OAUTH_BEGIN_COOLDOWN_SECONDS} SECOND)`,
      [
        stateHash,
        sessionDigest(input.userId, input.sessionId),
        expiresAt,
        input.merchantId,
        input.userId,
      ],
    );
    if (rotation.affectedRows === 0) {
      try {
        await connection.execute(
          `INSERT INTO zid_oauth_states
            (merchant_id, user_id, state_hash, session_hash, expires_at)
           VALUES (?, ?, ?, ?, ?)`,
          [input.merchantId, input.userId, stateHash, sessionDigest(input.userId, input.sessionId), expiresAt],
        );
      } catch (error) {
        if (isDuplicateKey(error)) throw new ZidOAuthError('rate_limited');
        throw error;
      }
    }
  } catch (error) {
    throw error;
  } finally {
    connection.release();
  }

  const authorizationUrl = new URL(ZID_AUTHORIZE_URL);
  authorizationUrl.searchParams.set('client_id', config.clientId);
  authorizationUrl.searchParams.set('redirect_uri', config.redirectUri);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('state', state);
  return { authorizationUrl: authorizationUrl.toString() };
}

export async function consumeZidOAuthState(input: {
  merchantId: number;
  userId: number;
  sessionId: string;
  state: string;
}): Promise<void> {
  if (!OAUTH_STATE_PATTERN.test(input.state)) throw new ZidOAuthError('invalid_state');
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<OAuthStateRow[]>(
      `SELECT id FROM zid_oauth_states
        WHERE merchant_id = ? AND user_id = ? AND state_hash = ? AND session_hash = ?
          AND consumed_at IS NULL AND expires_at > NOW()
        LIMIT 1 FOR UPDATE`,
      [
        input.merchantId,
        input.userId,
        privacyHashExact(`zid-oauth-state:${input.state}`),
        sessionDigest(input.userId, input.sessionId),
      ],
    );
    const row = rows[0];
    if (!row) throw new ZidOAuthError('invalid_state');
    const [claim] = await connection.execute<ResultSetHeader>(
      `UPDATE zid_oauth_states SET consumed_at = NOW()
        WHERE id = ? AND consumed_at IS NULL AND expires_at > NOW()`,
      [row.id],
    );
    if (claim.affectedRows !== 1) throw new ZidOAuthError('invalid_state');
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export type ZidOAuthTokens = {
  authorizationToken: string;
  managerToken: string;
  refreshToken?: string;
  expiresIn?: number;
};

function requiredToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^Bearer\s+/i, '');
  return normalized.length >= 16 && normalized.length <= 16_384 ? normalized : null;
}

async function requestZidTokens(
  grant: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<ZidOAuthTokens> {
  const config = oauthConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...grant,
  });
  let response: Response;
  try {
    response = await fetchImpl(ZID_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ZidOAuthError('token_exchange');
  }
  if (!response.ok) throw new ZidOAuthError('token_exchange');

  let payload: Record<string, unknown>;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    throw new ZidOAuthError('token_exchange');
  }
  const authorizationToken = requiredToken(payload.Authorization ?? payload.authorization);
  const managerToken = requiredToken(payload.access_token);
  if (!authorizationToken || !managerToken) throw new ZidOAuthError('token_exchange');
  const refreshToken = requiredToken(payload.refresh_token) || undefined;
  const rawExpiresIn = typeof payload.expires_in === 'string'
    ? Number(payload.expires_in)
    : payload.expires_in;
  const expiresIn = typeof rawExpiresIn === 'number' && Number.isFinite(rawExpiresIn)
    ? Math.max(0, Math.floor(rawExpiresIn))
    : undefined;
  return { authorizationToken, managerToken, refreshToken, expiresIn };
}

export async function exchangeZidAuthorizationCode(
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ZidOAuthTokens> {
  if (!code || code.length > 4096 || /[\u0000-\u001f\u007f]/.test(code)) {
    throw new ZidOAuthError('token_exchange');
  }
  const redirectUri = oauthConfig().redirectUri;
  return requestZidTokens({
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  }, fetchImpl);
}

export async function refreshZidAuthorization(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ZidOAuthTokens> {
  const normalized = requiredToken(refreshToken);
  if (!normalized) throw new ZidOAuthError('token_exchange');
  return requestZidTokens({
    grant_type: 'refresh_token',
    refresh_token: normalized,
  }, fetchImpl);
}
