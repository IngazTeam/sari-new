import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { getPool } from '../db/connection';
import { databaseTimeEpoch } from '../db/time';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { hasPermission } from '../_core/permissions';
import { inspectNoticeEvidence } from './salla-notice-receipts';
import { assertSallaCreationEffectsSchema, inspectSallaEffectContext } from './salla-creation-effects';
import { sallaEffectListInput, sallaEffectCheckInput, sallaEffectPage, sallaEffectItem,
  sallaEffectAuditItem, sallaEffectAuditPage, sallaEffectAuditListInput } from '../../shared/salla-effect-review';

const id = z.number().int().positive().max(2147483647);
const request = sallaEffectCheckInput.extend({ merchantId: id, reviewerUserId: id }).strict();
const snapshot = z.object({ version: z.literal('salla-effect-review.v1'), request,
  observedAt: z.string().datetime({ precision: 3 }), effect: sallaEffectItem }).strict();
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v !== null && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,value])=>[k,canonical(value)]));
  return v;
}
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const iso = (v: string | Date) => new Date(databaseTimeEpoch(v)).toISOString();
const unavailable = (): never => { throw Error('Salla effect review unavailable'); };
export async function assertSallaEffectReviewSchema() {
  await assertSallaCreationEffectsSchema();
  await assertRuntimeSchema('Salla effect reviews', [{ table: 'salla_effect_reviews',
    columns: ['merchant_id','reviewer_user_id','effect_id','order_id','request_id','request_digest','snapshot','snapshot_digest','created_at'],
    uniqueIndexes: [{ name: 'salla_effect_review_request', columns: ['merchant_id','request_id'] }],
  }], { cacheSuccess: false });
}
async function transaction<T>(work: (c: PoolConnection) => Promise<T>) {
  const pool = await getPool(); if (!pool) return unavailable(); const c = await pool.getConnection();
  let reusable = true, committing = false;
  try {
    await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await c.beginTransaction(); const result = await work(c); committing = true; await c.commit(); committing = false; return result;
  } catch (error) {
    if (committing) { reusable = false; c.destroy(); }
    else { try { await c.rollback(); } catch { reusable = false; c.destroy(); } }
    throw error;
  } finally { if (reusable) c.release(); }
}
async function authorize(c: PoolConnection, merchant: number, reviewer: number) {
  // Shared authority locks also allow the effects worker to inspect this merchant.
  const [m] = await c.execute<any[]>('SELECT userId,status FROM merchants WHERE id=? FOR SHARE', [merchant]);
  const [u] = await c.execute<any[]>('SELECT account_status FROM users WHERE id=? FOR SHARE', [reviewer]);
  const [members] = await c.execute<any[]>('SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE', [merchant,reviewer]);
  if (m.length !== 1 || m[0].status !== 'active' || u.length !== 1 || u[0].account_status !== 'active' || members.length > 1) return unavailable();
  if (members.length ? (!members[0].is_active || !hasPermission(members[0].role, 'integrations.manage')) : m[0].userId !== reviewer) return unavailable();
}
async function inspect(c: PoolConnection, row: any, now: number) {
  const expired = databaseTimeEpoch(row.lease_until) <= now;
  const diagnostic = row.state === 'accepted' ? 'accepted' : row.state === 'pending' ? 'queued'
    : row.state === 'processing' ? expired ? 'preparation_expired' : 'preparing'
    : row.state === 'dispatching' ? expired ? 'outcome_unknown' : 'in_flight'
    : row.dispatch_started_at ? 'outcome_unknown' : 'review_before_send';
  return sallaEffectItem.parse({ id: row.id, orderId: row.local_order_id, kind: row.kind, state: row.state,
    attempts: row.attempts, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    dispatchStartedAt: row.dispatch_started_at ? iso(row.dispatch_started_at) : null,
    acceptedAt: row.accepted_at ? iso(row.accepted_at) : null,
    contextValid: await inspectSallaEffectContext(c, row), diagnostic,
    ...(['owner_notice','merchant_notice'].includes(row.kind)?{notice:await inspectNoticeEvidence(c,row)}:{}) });
}
function readAudit(row: any) {
  const raw = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
  const s = snapshot.parse(raw), r = s.request;
  if (hash(raw) !== row.snapshot_digest || hash(s) !== row.snapshot_digest || hash(r) !== row.request_digest
    || r.merchantId !== row.merchant_id || r.reviewerUserId !== row.reviewer_user_id || r.effectId !== row.effect_id
    || r.requestId !== row.request_id || s.effect.id !== row.effect_id || s.effect.orderId !== row.order_id
    || s.observedAt !== iso(row.created_at)) return unavailable();
  return s;
}
function auditItem(row: any) {
  const s = readAudit(row);
  return sallaEffectAuditItem.parse({ id: row.id, reviewerUserId: row.reviewer_user_id, reason: s.request.reason, observedAt: s.observedAt, effect: s.effect });
}
export async function listSallaEffects(merchant: number, reviewer: number, raw: z.infer<typeof sallaEffectListInput>) {
  id.parse(merchant); id.parse(reviewer); const input = sallaEffectListInput.parse(raw); await assertSallaEffectReviewSchema();
  return transaction(async c => {
    await authorize(c,merchant,reviewer);
    const filters = (['orderId','state','kind','beforeId'] as const).filter(k => input[k] !== undefined);
    const clauses = {orderId:'local_order_id=?',state:'state=?',kind:'kind=?',beforeId:'id<?'};
    const [rows] = await c.execute<any[]>(`SELECT * FROM salla_creation_effects WHERE merchant_id=?${filters.map(k=>' AND '+clauses[k]).join('')} ORDER BY id DESC LIMIT 21 FOR SHARE`, [merchant,...filters.map(k=>input[k]!)]);
    const [[clock]] = await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
    const items = []; for (const row of rows.slice(0,20)) items.push(await inspect(c,row,databaseTimeEpoch(clock.now)));
    return sallaEffectPage.parse({ items, nextCursor: rows.length > 20 ? items.at(-1)!.id : null });
  });
}
export async function listSallaEffectReviews(merchant: number, reviewer: number, raw: z.infer<typeof sallaEffectAuditListInput>) {
  id.parse(merchant); id.parse(reviewer); const input = sallaEffectAuditListInput.parse(raw); await assertSallaEffectReviewSchema();
  return transaction(async c => {
    await authorize(c,merchant,reviewer);
    const [rows] = await c.execute<any[]>(`SELECT * FROM salla_effect_reviews WHERE merchant_id=?${input.orderId?' AND order_id=?':''}${input.beforeId?' AND id<?':''} ORDER BY id DESC LIMIT 21 FOR SHARE`,
      [merchant,...(input.orderId?[input.orderId]:[]),...(input.beforeId?[input.beforeId]:[])]);
    const items = rows.slice(0,20).map(auditItem);
    return sallaEffectAuditPage.parse({ items, nextCursor: rows.length > 20 ? items.at(-1)!.id : null });
  });
}
/** Records a fresh SQL observation only. Never sends, retries or manually accepts an effect. */
export async function checkSallaEffect(merchant: number, reviewer: number, raw: z.infer<typeof sallaEffectCheckInput>) {
  id.parse(merchant); id.parse(reviewer); const input = sallaEffectCheckInput.parse(raw); await assertSallaEffectReviewSchema();
  const r = request.parse({ ...input, merchantId: merchant, reviewerUserId: reviewer });
  return transaction(async c => {
    await authorize(c,merchant,reviewer);
    const [prior] = await c.execute<any[]>('SELECT * FROM salla_effect_reviews WHERE merchant_id=? AND request_id=? FOR SHARE',[merchant,input.requestId]);
    if (prior.length) { if (hash(readAudit(prior[0]).request) !== hash(r)) return unavailable(); return auditItem(prior[0]); }
    const [rows] = await c.execute<any[]>('SELECT * FROM salla_creation_effects WHERE merchant_id=? AND id=? FOR SHARE',[merchant,input.effectId]);
    if (rows.length !== 1) return unavailable();
    const [[clock]] = await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
    const s = snapshot.parse({ version: 'salla-effect-review.v1', request: r, observedAt: iso(clock.now), effect: await inspect(c,rows[0],databaseTimeEpoch(clock.now)) });
    // The unique request key serializes simultaneous reviews without changing the original observation.
    await c.execute(`INSERT INTO salla_effect_reviews (merchant_id,reviewer_user_id,effect_id,order_id,request_id,request_digest,snapshot,snapshot_digest,created_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id`,
      [merchant,reviewer,input.effectId,s.effect.orderId,input.requestId,hash(r),JSON.stringify(s),hash(s),s.observedAt.slice(0,23).replace('T',' ')]);
    const [[saved]] = await c.execute<any[]>('SELECT * FROM salla_effect_reviews WHERE merchant_id=? AND request_id=? FOR SHARE',[merchant,input.requestId]);
    if (hash(readAudit(saved).request) !== hash(r)) return unavailable();
    return auditItem(saved);
  });
}
