import { randomBytes } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { getPool } from "./db/connection";
import { assertRuntimeSchema } from "./db/schema-readiness";
import { privacyHashExact } from "./accounts/privacy-hash";
import { hashSessionId, isSessionId } from "./_core/session-security";
import { hasPermission, type MerchantRole } from "./_core/permissions";
import { buildPublicUrl } from "./utils/public-url";

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
export class SheetsOAuthError extends Error {
  constructor(
    public readonly reason:
      | "configuration"
      | "forbidden"
      | "invalid_state"
      | "changed"
      | "rate_limit"
      | "exchange"
  ) {
    super(reason);
  }
}
type Actor = { userId: number; sessionId: string };
type Scope = Actor & { merchantId: number };
const statePattern = /^[A-Za-z0-9_-]{43}$/;
const digest = (value: unknown) =>
  privacyHashExact(`sheets-oauth:${JSON.stringify(value)}`);
const validId = (v: number) => Number.isInteger(v) && v > 0 && v <= 2147483647;
function actor(input: Actor) {
  if (!validId(input.userId) || !isSessionId(input.sessionId))
    throw new SheetsOAuthError("forbidden");
}
async function transaction<T>(
  run: (c: PoolConnection) => Promise<T>
): Promise<T> {
  await assertRuntimeSchema("Sheets OAuth", [
    {
      table: "sheets_oauth_states",
      columns: ["source_hash", "session_hash", "consumed_at"],
      uniqueIndexes: [
        {
          name: "uq_sheets_oauth_merchant_user",
          columns: ["merchant_id", "user_id"],
        },
        { name: "uq_sheets_oauth_state", columns: ["state_hash"] },
      ],
    },
  ]);
  const pool = await getPool();
  if (!pool) throw Error("Sheets storage unavailable");
  const c = await pool.getConnection();
  let committing = false,
    reusable = true;
  try {
    await c.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await c.beginTransaction();
    const result = await run(c);
    committing = true;
    await c.commit();
    return result;
  } catch (error) {
    if (committing) reusable = false;
    else
      try {
        await c.rollback();
      } catch {
        reusable = false;
      }
    throw error;
  } finally {
    if (reusable) c.release();
    else c.destroy();
  }
}
async function authority(c: PoolConnection, input: Scope) {
  actor(input);
  if (!validId(input.merchantId)) throw new SheetsOAuthError("forbidden");
  const [merchants] = await c.execute<any[]>(
    "SELECT id,userId,status FROM merchants WHERE id=? FOR UPDATE",
    [input.merchantId]
  );
  const [users] = await c.execute<any[]>(
    "SELECT account_status FROM users WHERE id=? FOR SHARE",
    [input.userId]
  );
  const [members] = await c.execute<any[]>(
    "SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE",
    [input.merchantId, input.userId]
  );
  const [sessions] = await c.execute<any[]>(
    "SELECT id FROM auth_sessions WHERE user_id=? AND token_id_hash=? AND revoked_at IS NULL AND expires_at>NOW() FOR SHARE",
    [input.userId, hashSessionId(input.sessionId)]
  );
  const merchant = merchants[0];
  const role =
    members.length === 1 && Number(members[0].is_active) === 1
      ? members[0].role
      : members.length === 0 && Number(merchant?.userId) === input.userId
        ? "owner"
        : null;
  if (
    merchants.length !== 1 ||
    merchant.status === "suspended" ||
    users.length !== 1 ||
    users[0].account_status !== "active" ||
    sessions.length !== 1 ||
    !role ||
    !hasPermission(role as MerchantRole, "integrations.manage")
  )
    throw new SheetsOAuthError("forbidden");
}
async function source(c: PoolConnection, merchantId: number) {
  const [configs] = await c.execute<any[]>(
    "SELECT id,clientId,clientSecret,is_enabled FROM google_oauth_settings ORDER BY id LIMIT 2 FOR SHARE"
  );
  const config = configs[0];
  if (
    configs.length !== 1 ||
    Number(config.is_enabled) !== 1 ||
    !config.clientId ||
    !config.clientSecret
  )
    throw new SheetsOAuthError("configuration");
  const redirectUri = buildPublicUrl("/api/auth/oauth/google/sheets/callback");
  const url = new URL(redirectUri);
  if (
    url.protocol !== "https:" &&
    (process.env.NODE_ENV === "production" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new SheetsOAuthError("configuration");
  const [integrations] = await c.execute<any[]>(
    "SELECT id,credentials,sheet_id,is_active FROM google_integrations WHERE merchant_id=? AND integration_type='sheets' ORDER BY id LIMIT 2 FOR UPDATE",
    [merchantId]
  );
  if (integrations.length > 1) throw new SheetsOAuthError("changed");
  return {
    config,
    redirectUri,
    integration: integrations[0],
    hash: digest({
      merchantId,
      config,
      redirectUri,
      integration: integrations[0] ?? null,
    }),
  };
}
const sessionHash = (input: Actor) => digest([input.userId, input.sessionId]);
export const sheetsOAuthStore = { transaction, authority, source };

/** Creates a one-time request only after the user explicitly starts connecting. */
export async function beginSheetsOAuth(input: Scope) {
  actor(input);
  return sheetsOAuthStore.transaction(async c => {
    await sheetsOAuthStore.authority(c, input);
    const current = await sheetsOAuthStore.source(c, input.merchantId);
    const [existing] = await c.execute<any[]>(
      "SELECT id,created_at>DATE_SUB(NOW(),INTERVAL 10 SECOND) AS cooling FROM sheets_oauth_states WHERE merchant_id=? AND user_id=? FOR UPDATE",
      [input.merchantId, input.userId]
    );
    if (existing[0]?.cooling) throw new SheetsOAuthError("rate_limit");
    const state = randomBytes(32).toString("base64url");
    const values = [
      digest(state),
      sessionHash(input),
      current.hash,
      input.merchantId,
      input.userId,
    ];
    if (existing.length)
      await c.execute(
        "UPDATE sheets_oauth_states SET state_hash=?,session_hash=?,source_hash=?,expires_at=DATE_ADD(NOW(),INTERVAL 10 MINUTE),consumed_at=NULL,created_at=NOW() WHERE merchant_id=? AND user_id=?",
        values
      );
    else
      await c.execute(
        "INSERT INTO sheets_oauth_states (state_hash,session_hash,source_hash,merchant_id,user_id,expires_at) VALUES (?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 10 MINUTE))",
        values
      );
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    for (const [key, value] of Object.entries({
      client_id: current.config.clientId,
      redirect_uri: current.redirectUri,
      response_type: "code",
      scope: SHEETS_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    }))
      url.searchParams.set(key, String(value));
    return { authorizationUrl: url.toString() };
  });
}

async function claim(input: Actor & { state: string }) {
  actor(input);
  if (!statePattern.test(input.state))
    throw new SheetsOAuthError("invalid_state");
  return sheetsOAuthStore.transaction(async c => {
    // Read the merchant first, then lock in the same order as begin/save.
    const args = [digest(input.state), input.userId, sessionHash(input)];
    const select =
      "SELECT merchant_id,source_hash FROM sheets_oauth_states WHERE state_hash=? AND user_id=? AND session_hash=? AND consumed_at IS NULL AND expires_at>NOW()";
    const [lookup] = await c.execute<any[]>(select, args);
    if (lookup.length !== 1) throw new SheetsOAuthError("invalid_state");
    const scope = { ...input, merchantId: Number(lookup[0].merchant_id) };
    await sheetsOAuthStore.authority(c, scope);
    const current = await sheetsOAuthStore.source(c, scope.merchantId);
    const [locked] = await c.execute<any[]>(select + " FOR UPDATE", args);
    if (locked.length !== 1) throw new SheetsOAuthError("invalid_state");
    if (locked[0].source_hash !== current.hash)
      throw new SheetsOAuthError("changed");
    await c.execute(
      "UPDATE sheets_oauth_states SET consumed_at=NOW() WHERE state_hash=? AND user_id=? AND session_hash=? AND consumed_at IS NULL",
      args
    );
    return { ...scope, current };
  });
}
const token = z
  .string()
  .min(1)
  .max(16384)
  .regex(/^[^\s\x00-\x1f\x7f]+$/);
const tokenReply = z.object({
  access_token: token,
  refresh_token: token,
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().min(1).max(86400),
  scope: z.string().max(4096).optional(),
});
export async function exchangeSheetsCode(
  config: { clientId: string; clientSecret: string },
  redirectUri: string,
  code: string,
  fetchImpl: typeof fetch = fetch
) {
  try {
    const response = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!response.ok || !response.body) throw Error();
    const reader = response.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) throw Error();
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const raw = tokenReply.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8"))
    );
    if (raw.scope && !raw.scope.split(/\s+/).includes(SHEETS_SCOPE))
      throw Error();
    return {
      access_token: raw.access_token,
      refresh_token: raw.refresh_token,
      token_type: raw.token_type,
      expiry_date: Date.now() + raw.expires_in * 1000,
      ...(raw.scope ? { scope: raw.scope } : {}),
    };
  } catch {
    throw new SheetsOAuthError("exchange");
  }
}
export async function completeSheetsOAuth(
  input: Actor & { state: string; code?: string; denied?: boolean },
  exchange = exchangeSheetsCode
) {
  if (
    !input.denied &&
    (typeof input.code !== "string" ||
      !input.code ||
      input.code.length > 4096 ||
      /[\x00-\x1f\x7f]/.test(input.code))
  )
    throw new SheetsOAuthError("invalid_state");
  const attempt = await claim(input);
  if (input.denied) return { cancelled: true, merchantId: attempt.merchantId };
  const credentials = await exchange(
    attempt.current.config,
    attempt.current.redirectUri,
    input.code!
  );
  await sheetsOAuthStore.transaction(async c => {
    await sheetsOAuthStore.authority(c, attempt);
    const current = await sheetsOAuthStore.source(c, attempt.merchantId);
    if (current.hash !== attempt.current.hash)
      throw new SheetsOAuthError("changed");
    const [states] = await c.execute<any[]>(
      "SELECT id FROM sheets_oauth_states WHERE state_hash=? AND user_id=? AND session_hash=? AND consumed_at IS NOT NULL AND expires_at>NOW() FOR UPDATE",
      [digest(input.state), input.userId, sessionHash(input)]
    );
    if (states.length !== 1) throw new SheetsOAuthError("invalid_state");
    const json = JSON.stringify(credentials);
    // A different Google account must never inherit the previous sheet or report schedule.
    if (current.integration)
      await c.execute(
        "UPDATE google_integrations SET credentials=?,is_active=1,sheet_id=NULL,last_sync=NULL,settings=NULL WHERE id=? AND merchant_id=? AND integration_type='sheets'",
        [json, current.integration.id, attempt.merchantId]
      );
    else
      await c.execute(
        "INSERT INTO google_integrations (merchant_id,integration_type,credentials,is_active) VALUES (?,'sheets',?,1)",
        [attempt.merchantId, json]
      );
  });
  return { cancelled: false, merchantId: attempt.merchantId };
}
