import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { getPool } from '../db/connection';
import { aiPriceCardInput, aiPriceCardSaveInput, aiPriceCurrent, aiPriceDigest,
  aiPriceHistoryInput, aiPriceHistoryOutput, aiPriceSaveOutput, type AiPriceCard } from '../../shared/ai-price-contract';

export class AiPriceAdminError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'CONFLICT' | 'PRECONDITION_FAILED') { super('AI_PRICE_' + code); }
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const snapshotSchema = z.object({
  schemaVersion: z.literal(1), card: aiPriceCardInput, origin: z.enum(['legacy', 'admin']),
  actorId: z.number().int().positive().nullable(), reference: z.string().min(8).max(240).nullable(),
  previousRevision: aiPriceDigest.nullable(),
}).strict();

/** Check persisted authority as well as the caller's session. Hold it through a write. */
export async function assertAiBudgetAdmin(connection: Pick<PoolConnection, 'execute'>, actorId: number, lock = false) {
  if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new AiPriceAdminError('FORBIDDEN');
  const [rows] = await connection.execute<any[]>(
    `SELECT role, account_status FROM users WHERE id = ?${lock ? ' FOR SHARE' : ''}`, [actorId]);
  if (rows[0]?.role !== 'admin' || rows[0]?.account_status !== 'active') throw new AiPriceAdminError('FORBIDDEN');
}

export function currentAiPrice(row: Record<string, unknown>): z.infer<typeof aiPriceCurrent> {
  if (![0, 1].includes(Number(row.enabled))) throw new Error('Invalid price state');
  const card = aiPriceCardInput.parse({ provider: row.provider, model: row.model, version: row.version,
    inputUsdPerMillion: Number(row.input_micro_usd_per_million) / 1_000_000,
    outputUsdPerMillion: Number(row.output_micro_usd_per_million) / 1_000_000,
    flatUsd: Number(row.flat_micro_usd) / 1_000_000, maxInputTokens: Number(row.max_input_tokens), enabled: Number(row.enabled) === 1 });
  return { ...card, revision: digest(card) };
}

function revision(row: any) {
  const snapshot = snapshotSchema.parse(typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot);
  if (digest(snapshot) !== row.snapshot_digest || row.provider !== snapshot.card.provider || row.model !== snapshot.card.model
    || row.version !== snapshot.card.version || row.origin !== snapshot.origin || row.actor_id !== snapshot.actorId
    || row.reference !== snapshot.reference || (snapshot.origin === 'legacy'
      ? snapshot.actorId !== null || snapshot.reference !== null || snapshot.previousRevision !== null || row.request_id !== null || row.request_digest !== null
      : snapshot.actorId === null || snapshot.reference === null || !z.string().uuid().safeParse(row.request_id).success || !aiPriceDigest.safeParse(row.request_digest).success)) {
    throw new Error('Price audit integrity failure');
  }
  return { id: Number(row.id), card: snapshot.card, origin: snapshot.origin, actorId: snapshot.actorId,
    reference: snapshot.reference, recordedAt: new Date(row.created_at).toISOString() };
}

export async function readAiPriceHistory(raw: z.input<typeof aiPriceHistoryInput>, actorId: number) {
  const input = aiPriceHistoryInput.parse(raw), pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  await assertAiBudgetAdmin(pool, actorId);
  const [rows] = await pool.execute<any[]>(`SELECT * FROM ai_price_card_revisions WHERE provider = ? AND model = ?
    ${input.beforeId === undefined ? '' : 'AND id < ?'} ORDER BY id DESC LIMIT 21`,
    [input.provider, input.model, ...(input.beforeId === undefined ? [] : [input.beforeId])]);
  const entries = rows.slice(0, 20).map(revision);
  if (entries.some(entry => entry.card.provider !== input.provider || entry.card.model !== input.model)) throw new AiPriceAdminError('CONFLICT');
  return aiPriceHistoryOutput.parse({ entries, nextBeforeId: rows.length > 20 ? entries.at(-1)!.id : null });
}

export async function saveAiPriceCard(raw: z.input<typeof aiPriceCardSaveInput>, actorId: number) {
  const input = aiPriceCardSaveInput.parse(raw), card = aiPriceCardInput.parse(Object.fromEntries(
    Object.entries(input).filter(([key]) => !['requestId', 'expectedRevision', 'reference'].includes(key))));
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const connection = await pool.getConnection();
  const requestDigest = digest({ actorId, input });
  try {
    await connection.beginTransaction();
    await assertAiBudgetAdmin(connection, actorId, true);
    // Serialize central price writes, including first creation. The policy is never changed here.
    const [policy] = await connection.execute<any[]>("SELECT scope_key FROM ai_budget_policies WHERE scope_key = 'global' FOR UPDATE");
    if (!policy.length) throw new AiPriceAdminError('PRECONDITION_FAILED');
    const [requests] = await connection.execute<any[]>('SELECT * FROM ai_price_card_revisions WHERE request_id = ?', [input.requestId]);
    if (requests.length) {
      const entry = revision(requests[0]);
      if (requests[0].request_digest !== requestDigest || entry.actorId !== actorId || digest(entry.card) !== digest(card)) throw new AiPriceAdminError('CONFLICT');
      await connection.commit();
      return aiPriceSaveOutput.parse({ success: true, revisionId: entry.id, revision: digest(entry.card), replayed: true });
    }
    const [cards] = await connection.execute<any[]>('SELECT * FROM ai_price_cards WHERE provider = ? AND model = ? FOR UPDATE', [card.provider, card.model]);
    const current = cards[0] ? currentAiPrice(cards[0]) : null;
    if ((current?.revision ?? null) !== input.expectedRevision || current && (current.provider !== card.provider || current.model !== card.model)) throw new AiPriceAdminError('CONFLICT');
    const [last] = await connection.execute<any[]>('SELECT * FROM ai_price_card_revisions WHERE provider = ? AND model = ? ORDER BY id DESC LIMIT 1', [card.provider, card.model]);
    if (last.length && (!current || digest(revision(last[0]).card) !== current.revision)) throw new AiPriceAdminError('PRECONDITION_FAILED');
    const [used] = await connection.execute<any[]>('SELECT id FROM ai_price_card_revisions WHERE provider = ? AND model = ? AND version = ?', [card.provider, card.model, card.version]);
    if (used.length || current?.version === card.version) throw new AiPriceAdminError('CONFLICT');
    const insert = async (price: AiPriceCard, origin: 'legacy' | 'admin') => {
      const snapshot = snapshotSchema.parse({ schemaVersion: 1, card: price, origin,
        actorId: origin === 'admin' ? actorId : null, reference: origin === 'admin' ? input.reference : null,
        previousRevision: origin === 'admin' ? current?.revision ?? null : null });
      const [result] = await connection.execute<any>(`INSERT INTO ai_price_card_revisions
        (provider, model, version, origin, actor_id, reference, request_id, request_digest, snapshot, snapshot_digest)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [price.provider, price.model, price.version, origin, snapshot.actorId,
        snapshot.reference, origin === 'admin' ? input.requestId : null, origin === 'admin' ? requestDigest : null, JSON.stringify(snapshot), digest(snapshot)]);
      return Number(result.insertId);
    };
    if (current && !last.length) {
      const { revision: _revision, ...legacy } = current;
      await insert(legacy, 'legacy');
    }
    const revisionId = await insert(card, 'admin');
    await connection.execute(`INSERT INTO ai_price_cards (provider, model, version, input_micro_usd_per_million,
      output_micro_usd_per_million, flat_micro_usd, max_input_tokens, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE version=VALUES(version), input_micro_usd_per_million=VALUES(input_micro_usd_per_million),
      output_micro_usd_per_million=VALUES(output_micro_usd_per_million), flat_micro_usd=VALUES(flat_micro_usd),
      max_input_tokens=VALUES(max_input_tokens), enabled=VALUES(enabled)`,
      [card.provider, card.model, card.version, Math.round(card.inputUsdPerMillion * 1_000_000), Math.round(card.outputUsdPerMillion * 1_000_000),
        Math.round(card.flatUsd * 1_000_000), card.maxInputTokens, Number(card.enabled)]);
    await connection.commit();
    return aiPriceSaveOutput.parse({ success: true, revisionId, revision: digest(card), replayed: false });
  } catch (error) {
    await connection.rollback();
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new AiPriceAdminError('CONFLICT');
    throw error;
  } finally { connection.release(); }
}
