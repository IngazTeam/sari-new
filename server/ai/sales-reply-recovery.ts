import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { reconcileSalesReplyConversation, SalesReplyDeliveryConflict } from './sales-reply-delivery';

const claimSchema = z.object({ merchantId: z.number().int().positive().safe(), deliveryId: z.number().int().positive().safe(),
  authorizationDigest: z.string().regex(/^[a-f0-9]{64}$/), token: z.string().uuid(), attempt: z.number().int().min(1).max(8) }).strict();
export type SalesReplyProjectionClaim = z.infer<typeof claimSchema>;
export async function assertSalesReplyRecoverySchema() {
  await assertRuntimeSchema('sales reply projection recovery', [
    { table: 'ai_sales_reply_deliveries', columns: ['projection_state','projection_token','projection_lease_until','projection_next_at',
      'projection_attempts','projection_last_error','projection_completed_at'], checkConstraints: ['ck_sales_reply_projection'] },
    { table: 'ai_interaction_jobs', columns: ['reply_origin','reply_digest','sales_delivery_id','outgoing_message_reference'],
      uniqueIndexes: [{ name: 'uq_ai_interaction_message', columns: ['merchant_id','incoming_message_id'] }] },
  ]);
}

/** A short row-only claim transaction. Parent/conversation locks belong to projection, after this commit. */
export async function claimSalesReplyProjections(limit = 10): Promise<SalesReplyProjectionClaim[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw Error('Invalid reply recovery batch');
  await assertSalesReplyRecoverySchema();
  const pool = await getPool(); if (!pool) throw Error('Reply recovery unavailable');
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const [rows] = await c.execute<any[]>(`SELECT id,merchant_id,authorization_digest,projection_attempts FROM ai_sales_reply_deliveries
      WHERE state='dispatching' AND projection_state='pending' AND projection_next_at<=UTC_TIMESTAMP(3)
        AND (projection_lease_until IS NULL OR projection_lease_until<=UTC_TIMESTAMP(3))
      ORDER BY projection_next_at,id LIMIT ${limit} FOR UPDATE SKIP LOCKED`);
    const claims: SalesReplyProjectionClaim[] = [];
    for (const row of rows) {
      const token = randomUUID();
      const parsed = claimSchema.safeParse({ merchantId: Number(row.merchant_id), deliveryId: Number(row.id),
        authorizationDigest: row.authorization_digest, token, attempt: Number(row.projection_attempts)+1 });
      if (Number(row.projection_attempts) >= 8 || !parsed.success) {
        await c.execute(`UPDATE ai_sales_reply_deliveries SET projection_state='review',projection_next_at=NULL,
          projection_token=NULL,projection_lease_until=NULL,projection_last_error=? WHERE id=?`,
          [Number(row.projection_attempts) >= 8 ? 'attempts_exhausted' : 'evidence_unavailable',row.id]);
        continue;
      }
      await c.execute(`UPDATE ai_sales_reply_deliveries SET projection_token=?,projection_lease_until=TIMESTAMPADD(MINUTE,2,UTC_TIMESTAMP(3)),
        projection_next_at=TIMESTAMPADD(MINUTE,2,UTC_TIMESTAMP(3)),projection_attempts=projection_attempts+1 WHERE id=?`, [token,row.id]);
      claims.push(parsed.data);
    }
    await c.commit(); return claims;
  } catch (error) { try { await c.rollback(); } catch { /* An uncertain lease never grants a send. */ } throw error; }
  finally { c.release(); }
}

type RecoveryReason = 'transport_unknown' | 'transport_rejected' | 'transport_failed' | 'evidence_unavailable' | 'projection_unavailable';
async function release(claim: SalesReplyProjectionClaim, reason: RecoveryReason, terminal: boolean) {
  const pool = await getPool(); if (!pool) throw Error('Reply recovery unavailable');
  const [updated] = await pool.execute<any>(`UPDATE ai_sales_reply_deliveries SET
    projection_state=IF(? OR projection_attempts>=8,'review','pending'),
    projection_next_at=IF(? OR projection_attempts>=8,NULL,TIMESTAMPADD(SECOND,LEAST(3600,30*POW(2,LEAST(projection_attempts,7))),UTC_TIMESTAMP(3))),
    projection_last_error=?,projection_token=NULL,projection_lease_until=NULL
    WHERE merchant_id=? AND id=? AND authorization_digest=? AND projection_state='pending'
      AND projection_token=? AND projection_attempts=? AND projection_lease_until>UTC_TIMESTAMP(3)`,
    [terminal,terminal,reason,claim.merchantId,claim.deliveryId,claim.authorizationDigest,claim.token,claim.attempt]);
  if (Number(updated.affectedRows) !== 1) return 'skipped' as const;
  return terminal || claim.attempt >= 8 ? 'review' as const : 'deferred' as const;
}

/** Local SQL recovery only. No provider lookup, generation, send, exposure or learning. */
export async function recoverSalesReplyProjection(value: SalesReplyProjectionClaim) {
  const claim = claimSchema.parse(value);
  try {
    const result = await reconcileSalesReplyConversation(claim.merchantId,
      { deliveryId: claim.deliveryId, authorizationDigest: claim.authorizationDigest }, claim.token);
    if (result.outgoingMessageId !== null) return 'projected' as const;
    if (['rejected','suppressed','failed'].includes(result.transport))
      return release(claim, result.transport === 'failed' ? 'transport_failed' : 'transport_rejected', true);
    return release(claim,'transport_unknown',false);
  } catch (error) {
    return release(claim,error instanceof SalesReplyDeliveryConflict ? 'evidence_unavailable' : 'projection_unavailable',error instanceof SalesReplyDeliveryConflict);
  }
}

export async function runSalesReplyRecoveryBatch() {
  const claims = await claimSalesReplyProjections(), result = { claimed: claims.length, projected: 0, review: 0, deferred: 0, skipped: 0 };
  for (const claim of claims) { try { result[await recoverSalesReplyProjection(claim)]++; } catch { result.deferred++; } }
  return result;
}

/** Aggregate operational state only; the API caller must be an active administrator. */
export class SalesReplyRecoveryAccessDenied extends Error {}
export async function salesReplyRecoveryHealth(actorUserId: number) {
  if (!Number.isSafeInteger(actorUserId) || actorUserId < 1) throw new SalesReplyRecoveryAccessDenied();
  await assertSalesReplyRecoverySchema(); const pool = await getPool(); if (!pool) throw Error('Reply recovery unavailable');
  const [actors] = await pool.execute<any[]>("SELECT id FROM users WHERE id=? AND role='admin' AND account_status='active'", [actorUserId]);
  if (actors.length !== 1) throw new SalesReplyRecoveryAccessDenied();
  const [rows] = await pool.execute<any[]>(`SELECT IF(state='authorized','awaiting_dispatch',projection_state) AS status,
    COUNT(*) AS count, SUM(state='dispatching' AND projection_state='pending' AND projection_next_at<=UTC_TIMESTAMP(3)
      AND (projection_lease_until IS NULL OR projection_lease_until<=UTC_TIMESTAMP(3))) AS due,
    MAX(GREATEST(0,TIMESTAMPDIFF(SECOND,created_at,UTC_TIMESTAMP()))) AS oldestSeconds
    FROM ai_sales_reply_deliveries GROUP BY status`);
  return rows.map(row => ({ status: String(row.status), count: Number(row.count), due: Number(row.due), oldestSeconds: Number(row.oldestSeconds) }));
}

export async function startSalesReplyRecoveryWorker() {
  await assertSalesReplyRecoverySchema(); let stopped = false, active: Promise<unknown> | undefined;
  const tick = () => {
    if (stopped || active) return;
    active = runSalesReplyRecoveryBatch().then(result => {
      if (result.review) console.warn('[SalesReplyRecovery] Local projections need review', { count: result.review });
    }).catch(() => console.error('[SalesReplyRecovery] Local projection recovery deferred'))
      .finally(() => { active = undefined; });
  };
  const timer = setInterval(tick,60_000); timer.unref(); tick();
  return async () => { stopped = true; clearInterval(timer); await active; };
}
