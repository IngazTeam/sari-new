/**
 * Session Store — DB-backed Session Persistence
 * 
 * Solves: Server restart = all active conversations lose context.
 * 
 * Design:
 * - Memory-first for speed (0ms reads)
 * - Async DB write-through on create/update (non-blocking)
 * - DB fallback on read when memory misses (post-restart recovery)
 * - Toggle: SESSION_STORE=memory (default) | db
 * - Does NOT modify session-context.ts — wraps it transparently
 * 
 * Schema: Uses existing conversations table's metadata
 * or a dedicated session_contexts table (lazy-created).
 */

import { getSession, createSession, updateSession, type ConversationSession, type CustomerIntent } from './session-context';

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const DB_ENABLED = process.env.SESSION_STORE === 'db';
const SESSION_TABLE = 'session_contexts';

// ═══════════════════════════════════════════════════════════════
// Lazy Table Creation
// ═══════════════════════════════════════════════════════════════

let tableChecked = false;

async function ensureTable(): Promise<void> {
  if (tableChecked || !DB_ENABLED) return;
  try {
    const { getPool } = await import('../db');
    const pool = await getPool();
    if (!pool) return;

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ${SESSION_TABLE} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        conversation_id INT NOT NULL,
        session_key VARCHAR(50) NOT NULL,
        context_json MEDIUMTEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY idx_session_key (session_key),
        INDEX idx_merchant (merchant_id),
        INDEX idx_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    tableChecked = true;
    console.log('[SessionStore] ✅ DB table verified');
  } catch (e) {
    console.warn('[SessionStore] Table creation failed (non-fatal):', (e as Error).message);
  }
}

// ═══════════════════════════════════════════════════════════════
// DB Operations (all non-blocking / fire-and-forget)
// ═══════════════════════════════════════════════════════════════

function sessionKey(merchantId: number, conversationId: number): string {
  return `${merchantId}:${conversationId}`;
}

async function writeSessionToDb(session: ConversationSession): Promise<void> {
  if (!DB_ENABLED) return;
  try {
    await ensureTable();
    const { getPool } = await import('../db');
    const pool = await getPool();
    if (!pool) return;

    const key = sessionKey(session.merchantId, session.conversationId);
    const json = JSON.stringify({
      ragFacts: session.ragFacts,
      ragBehaviors: session.ragBehaviors,
      relevantProducts: session.relevantProducts,
      contextPrompt: session.contextPrompt,
      customerIntent: session.customerIntent,
      sentimentTrajectory: session.sentimentTrajectory,
      topicsDiscussed: session.topicsDiscussed,
      persuasionUsed: session.persuasionUsed,
      messageCount: session.messageCount,
      dealStage: session.dealStage,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
    });

    // TTL: 60 minutes from last activity
    const expiresAt = new Date(session.lastActivityAt + 60 * 60 * 1000);

    await pool.execute(`
      INSERT INTO ${SESSION_TABLE} (merchant_id, conversation_id, session_key, context_json, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE context_json = VALUES(context_json), expires_at = VALUES(expires_at)
    `, [session.merchantId, session.conversationId, key, json, expiresAt]);
  } catch (e) {
    // Never let DB failure affect the chat pipeline
    console.warn('[SessionStore] DB write failed (non-fatal):', (e as Error).message);
  }
}

async function readSessionFromDb(merchantId: number, conversationId: number): Promise<ConversationSession | null> {
  if (!DB_ENABLED) return null;
  try {
    await ensureTable();
    const { getPool } = await import('../db');
    const pool = await getPool();
    if (!pool) return null;

    const key = sessionKey(merchantId, conversationId);
    const [rows] = await pool.execute(
      `SELECT context_json FROM ${SESSION_TABLE} WHERE session_key = ? AND expires_at > NOW() LIMIT 1`,
      [key]
    );

    const row = (rows as any[])?.[0];
    if (!row?.context_json) return null;

    const data = JSON.parse(row.context_json);
    return {
      merchantId,
      conversationId,
      ragFacts: data.ragFacts || '',
      ragBehaviors: data.ragBehaviors || '',
      relevantProducts: data.relevantProducts || [],
      contextPrompt: data.contextPrompt || '',
      customerIntent: data.customerIntent || 'unknown',
      sentimentTrajectory: data.sentimentTrajectory || [],
      topicsDiscussed: data.topicsDiscussed || [],
      persuasionUsed: data.persuasionUsed || [],
      messageCount: data.messageCount || 0,
      dealStage: data.dealStage,
      createdAt: data.createdAt || Date.now(),
      lastActivityAt: data.lastActivityAt || Date.now(),
    } as ConversationSession;
  } catch (e) {
    console.warn('[SessionStore] DB read failed (non-fatal):', (e as Error).message);
    return null;
  }
}

async function deleteSessionFromDb(merchantId: number, conversationId: number): Promise<void> {
  if (!DB_ENABLED) return;
  try {
    const { getPool } = await import('../db');
    const pool = await getPool();
    if (!pool) return;

    const key = sessionKey(merchantId, conversationId);
    await pool.execute(`DELETE FROM ${SESSION_TABLE} WHERE session_key = ?`, [key]);
  } catch { /* silent */ }
}

// ═══════════════════════════════════════════════════════════════
// Public API — Same interface as session-context.ts
// ═══════════════════════════════════════════════════════════════

/**
 * Get session with DB fallback.
 * Memory hit → instant return.
 * Memory miss → DB lookup → restore to memory.
 */
export async function getSessionWithFallback(
  merchantId: number,
  conversationId: number
): Promise<ConversationSession | null> {
  // 1. Memory first (0ms)
  const memSession = getSession(merchantId, conversationId);
  if (memSession) return memSession;

  // 2. DB fallback (post-restart recovery)
  const dbSession = await readSessionFromDb(merchantId, conversationId);
  if (dbSession) {
    // Restore to memory for future reads
    createSession({
      merchantId: dbSession.merchantId,
      conversationId: dbSession.conversationId,
      ragFacts: dbSession.ragFacts,
      ragBehaviors: dbSession.ragBehaviors,
      relevantProducts: dbSession.relevantProducts,
      contextPrompt: dbSession.contextPrompt,
      initialSentiment: dbSession.sentimentTrajectory[0] || 'neutral',
      initialIntent: dbSession.customerIntent,
    });
    console.log(`[SessionStore] 🔄 Recovered session from DB: ${merchantId}:${conversationId}`);
    return dbSession;
  }

  return null;
}

/**
 * Create session + async DB write.
 */
export function createSessionWithPersist(data: Parameters<typeof createSession>[0]): ConversationSession {
  const session = createSession(data);
  // Fire-and-forget DB write
  writeSessionToDb(session).catch(() => {});
  return session;
}

/**
 * Update session + async DB write.
 */
export function updateSessionWithPersist(
  merchantId: number,
  conversationId: number,
  updates: Parameters<typeof updateSession>[2]
): ConversationSession | null {
  const session = updateSession(merchantId, conversationId, updates);
  if (session) {
    // Fire-and-forget DB write
    writeSessionToDb(session).catch(() => {});
  }
  return session;
}

/**
 * Cleanup expired DB sessions (called by cron).
 */
export async function cleanupExpiredSessions(): Promise<number> {
  if (!DB_ENABLED) return 0;
  try {
    const { getPool } = await import('../db');
    const pool = await getPool();
    if (!pool) return 0;

    const [result] = await pool.execute(
      `DELETE FROM ${SESSION_TABLE} WHERE expires_at < NOW()`
    );
    const deleted = (result as any)?.affectedRows || 0;
    if (deleted > 0) {
      console.log(`[SessionStore] Cleaned up ${deleted} expired DB sessions`);
    }
    return deleted;
  } catch {
    return 0;
  }
}
