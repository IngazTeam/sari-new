import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import {
  getSession, createSession, updateSession, restoreSession, destroySession, destroyMerchantSessions,
  type ConversationSession,
} from './session-context';
import { currentInboundExecution } from '../messaging/inbound-context';
import { assertInboundOwned } from '../messaging/inbound-jobs';

const TTL = 60 * 60 * 1000;
export class SessionConflictError extends Error {
  constructor() { super('Session changed during processing'); this.name = 'SessionConflictError'; }
}
function usesDatabase() {
  if (process.env.SESSION_STORE === 'memory') {
    if (process.env.NODE_ENV === 'production') throw new Error('Production sessions require durable storage');
    return false;
  }
  return Boolean(process.env.DATABASE_URL);
}
async function poolForSessions() {
  await assertRuntimeSchema('durable conversation context', [{ table: 'session_contexts', columns: ['version'] }]);
  const pool = await getPool();
  if (!pool) throw new Error('Session database unavailable');
  return pool;
}
function decode(row: RowDataPacket, merchantId: number, conversationId: number): ConversationSession | null {
  if (!row || !row.active) return null;
  const data = typeof row.context_json === 'string' ? JSON.parse(row.context_json) : row.context_json;
  if (!data || data.merchantId !== merchantId || data.conversationId !== conversationId) return null;
  return { ...data, merchantId, conversationId, version: row.version };
}

/** Database is authoritative on every new message; memory is only a local view. */
export async function getSessionWithFallback(merchantId: number, conversationId: number): Promise<ConversationSession | null> {
  if (!usesDatabase()) return getSession(merchantId, conversationId);
  const pool = await poolForSessions();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT s.context_json, s.version, s.expires_at > UTC_TIMESTAMP() AS active
     FROM session_contexts s JOIN conversations c ON c.id = s.conversation_id AND c.merchantId = s.merchant_id
     WHERE s.merchant_id = ? AND s.conversation_id = ?`, [merchantId, conversationId],
  );
  const session = decode(rows[0], merchantId, conversationId);
  if (session) restoreSession(session);
  else destroySession(merchantId, conversationId);
  return session;
}

async function mutateSession(merchantId: number, conversationId: number,
  mutate: (current: ConversationSession | null) => ConversationSession | null,
  expectedVersion?: number): Promise<ConversationSession | null> {
  const pool = await poolForSessions();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const execution = currentInboundExecution();
    if (execution) {
      if (execution.merchantId !== merchantId) throw new Error('Session tenant mismatch');
      await assertInboundOwned({ id: execution.id, lease_token: execution.token }, connection);
    }
    // Lock the conversation even before a context row exists (concurrent first messages).
    const [conversations] = await connection.execute<RowDataPacket[]>(
      'SELECT id FROM conversations WHERE id = ? AND merchantId = ? FOR UPDATE', [conversationId, merchantId],
    );
    if (!conversations.length) throw new Error('Session conversation tenant mismatch');
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT context_json, version, expires_at > UTC_TIMESTAMP() AS active FROM session_contexts
       WHERE merchant_id = ? AND conversation_id = ? FOR UPDATE`, [merchantId, conversationId],
    );
    const row = rows[0];
    if (expectedVersion !== undefined && Number(row?.version || 0) !== expectedVersion) throw new SessionConflictError();
    const current = decode(row, merchantId, conversationId);
    const next = mutate(current);
    if (!next) { await connection.commit(); destroySession(merchantId, conversationId); return null; }
    next.version = Number(row?.version || 0) + 1;
    if (Buffer.byteLength(JSON.stringify(next)) > 1024 * 1024) throw new Error('Session exceeds storage limit');
    await connection.execute(
      `INSERT INTO session_contexts (merchant_id, conversation_id, session_key, context_json, expires_at, version)
       VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE context_json = VALUES(context_json),
       expires_at = VALUES(expires_at), version = VALUES(version)`,
      [merchantId, conversationId, `${merchantId}:${conversationId}`, JSON.stringify(next), new Date(next.lastActivityAt + TTL), next.version],
    );
    await connection.commit();
    return restoreSession(next);
  } catch (error) {
    await connection.rollback();
    destroySession(merchantId, conversationId);
    throw error;
  } finally { connection.release(); }
}

export async function createSessionWithPersist(data: Parameters<typeof createSession>[0], expectedVersion?: number): Promise<ConversationSession> {
  const rebuild = (current: ConversationSession | null) => {
    const next = createSession(data);
    if (current) {
      next.messageCount = current.messageCount + 1;
      next.createdAt = current.createdAt;
      next.topicsDiscussed = [...current.topicsDiscussed];
      next.persuasionUsed = [...current.persuasionUsed];
      next.sentimentTrajectory = [...current.sentimentTrajectory, data.initialSentiment].slice(-10);
      next.dealStage = current.dealStage;
    }
    return restoreSession(next);
  };
  if (!usesDatabase()) return rebuild(getSession(data.merchantId, data.conversationId));
  return (await mutateSession(data.merchantId, data.conversationId, current => {
    // A racing initial build cannot overwrite an already active context.
    if (current && expectedVersion === undefined) return current;
    return rebuild(current);
  }, expectedVersion))!;
}

export async function updateSessionWithPersist(merchantId: number, conversationId: number,
  updates: Parameters<typeof updateSession>[2]): Promise<ConversationSession | null> {
  if (!usesDatabase()) return updateSession(merchantId, conversationId, updates);
  return mutateSession(merchantId, conversationId, current => {
    if (!current) return null;
    restoreSession(current);
    return updateSession(merchantId, conversationId, updates);
  });
}

export async function invalidateMerchantSessions(merchantId: number): Promise<void> {
  if (usesDatabase()) {
    const pool = await poolForSessions();
    // Tombstones retain the version so a stale topic rebuild fails its CAS check.
    await pool.execute(`UPDATE session_contexts SET context_json = 'null', expires_at = UTC_TIMESTAMP(),
      version = version + 1 WHERE merchant_id = ?`, [merchantId]);
  }
  destroyMerchantSessions(merchantId);
}

export async function cleanupExpiredSessions(): Promise<number> {
  if (!usesDatabase()) return 0;
  const pool = await poolForSessions();
  const [result] = await pool.execute<any>(
    `DELETE FROM session_contexts WHERE expires_at < TIMESTAMPADD(DAY, -1, UTC_TIMESTAMP()) LIMIT 1000`,
  );
  return result.affectedRows;
}
