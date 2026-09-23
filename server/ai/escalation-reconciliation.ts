import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { getPool } from '../db/connection';
import { checkoutTransaction } from './checkout-agreements';
import { normalizeCampaignPhone } from '../automation/campaign-guard';

const id = z.number().int().positive().safe();
export const relayReviewSchema = z.object({ conversationId: id, relayId: id, expectedRevision: z.number().int().nonnegative(),
  evidence: z.string().regex(/^[a-f0-9]{64}$/), reviewed: z.literal(true), note: z.string().trim().min(3).max(1000) }).strict();
type Review = z.infer<typeof relayReviewSchema> & { merchantId: number; actorUserId: number };
type Outcome = 'accepted' | 'failed' | 'unresolved';
const parse = (value: any) => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
const key = (r: any) => `escalation_relay:${r.merchant_id}:${r.escalation_id}`;
const relaySql = `SELECT r.*,e.conversation_id,e.question,e.customer_phone,e.source_message_id,c.customerPhone
  FROM sales_escalation_relays r JOIN sari_escalation_queue e ON e.id=r.escalation_id AND e.merchant_id=r.merchant_id
  JOIN conversations c ON c.id=e.conversation_id AND c.merchantId=r.merchant_id`;

/** A status or a manually supplied receipt alone is not evidence for this attempt. */
function inspect(r: any, d: any) {
  const request = parse(d?.request_json), g = request?.escalationGuard;
  const valid = Boolean(d && d.instance_id === r.instance_id && d.merchant_id === r.merchant_id && d.direction === 'outgoing'
    && ['green_api', 'meta_cloud', ...(process.env.NODE_ENV === 'test' ? ['mock'] : [])].includes(d.provider)
    && request?.kind === 'text' && request?.text === r.reply_text && g?.mode === 'relay' && g?.id === r.escalation_id
    && g?.relayId === r.id && g?.sourceMessageId === r.source_message_id && g?.version === r.ownership_version
    && typeof request?.to === 'string' && /^[+\d][\d ()-]*(?:@c\.us)?$/.test(request.to)
    && normalizeCampaignPhone(request.to) && normalizeCampaignPhone(request.to) === normalizeCampaignPhone(r.customer_phone)
    && normalizeCampaignPhone(r.customerPhone) === normalizeCampaignPhone(r.customer_phone));
  const receipt = typeof d?.provider_message_id === 'string' && /^[^\s<>\x00-\x1f]{1,255}$/.test(d.provider_message_id) ? d.provider_message_id : null;
  const accepted = valid && receipt && (['sent', 'delivered', 'read'].includes(d.status)
    || (r.status === 'accepted' && r.provider_message_id === receipt));
  const state: 'missing' | 'invalid' | 'pending' | 'failed' | 'accepted' | 'delivered' | 'read' = !d ? 'missing' : !valid ? 'invalid'
    : d.status === 'failed' ? 'failed' : d.status === 'read' ? 'read' : d.status === 'delivered' ? 'delivered' : accepted ? 'accepted' : 'pending';
  const outcome: Outcome = accepted ? 'accepted' : valid && d.status === 'failed' ? 'failed' : 'unresolved';
  // Ignore worker bookkeeping times. Evidence changes invalidate an open review, even at the same review revision.
  const evidence = createHash('sha256').update(JSON.stringify([r.id,r.merchant_id,r.conversation_id,r.instance_id,r.reply_text,r.question,
    r.source_message_id,r.ownership_version,r.status,r.provider_message_id,r.customer_phone,r.customerPhone,
    d?.id ?? null,d?.instance_id ?? null,d?.provider ?? null,d?.direction ?? null,d?.status ?? null,receipt,request])).digest('hex');
  return { state, outcome, evidence, receipt: accepted ? receipt : null };
}

async function loadLocked(c: PoolConnection, merchantId: number, relayId: number, conversationId?: number) {
  const [targets] = await c.execute<any[]>(`${relaySql} WHERE r.id=? AND r.merchant_id=?`, [relayId, merchantId]);
  if (targets.length !== 1 || (conversationId !== undefined && targets[0].conversation_id !== conversationId)) throw new Error('Relay unavailable');
  // Match the sender's lock order. Callback updates only lock the delivery, never the conversation afterwards.
  await c.execute('SELECT id FROM conversations WHERE id=? AND merchantId=? FOR UPDATE', [targets[0].conversation_id, merchantId]);
  const [rows] = await c.execute<any[]>(`${relaySql} WHERE r.id=? AND r.merchant_id=? FOR UPDATE`, [relayId, merchantId]);
  const r = rows[0]; if (!r) throw new Error('Relay unavailable');
  const [deliveries] = await c.execute<any[]>('SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=? FOR UPDATE', [merchantId, key(r)]);
  return { r, d: deliveries[0] };
}

async function settle(merchantId: number, relayId: number, review?: Review) {
  const record = await checkoutTransaction(async c => {
    const { r, d } = await loadLocked(c, merchantId, relayId, review?.conversationId);
    const proof = inspect(r, d);
    if (review && (r.review_revision !== review.expectedRevision || proof.evidence !== review.evidence)) throw new Error('Review evidence changed');
    if (proof.receipt) {
      const [messages] = await c.execute<any[]>('SELECT id,direction,content,sender_type FROM messages WHERE conversationId=? AND externalId=?', [r.conversation_id, proof.receipt]);
      if (messages.some(m => m.direction !== 'outgoing' || m.content !== r.reply_text || m.sender_type !== 'merchant')) throw new Error('Receipt projection conflict');
      if (!messages.length) await c.execute(`INSERT INTO messages (conversationId,direction,messageType,content,externalId,isProcessed,sender_type,createdAt)
        VALUES (?,'outgoing','text',?,?,1,'merchant',?)`, [r.conversation_id, r.reply_text, proof.receipt, r.created_at]);
      await c.execute(`UPDATE sales_escalation_relays SET status='accepted',provider_message_id=?,reconciled_at=COALESCE(reconciled_at,UTC_TIMESTAMP()),
        last_reconcile_error=NULL WHERE id=? AND merchant_id=?`, [proof.receipt, relayId, merchantId]);
      await c.execute(`UPDATE sari_escalation_queue SET status='answered',merchant_answer=?,merchant_answered_at=COALESCE(merchant_answered_at,UTC_TIMESTAMP())
        WHERE id=? AND merchant_id=? AND status IN ('pending','notified')`, [r.reply_text, r.escalation_id, merchantId]);
      if (!messages.length) await c.execute('UPDATE conversations SET lastMessageAt=GREATEST(COALESCE(lastMessageAt,?),?) WHERE id=? AND merchantId=?',
        [r.created_at, r.created_at, r.conversation_id, merchantId]);
    } else await c.execute('UPDATE sales_escalation_relays SET last_reconcile_error=? WHERE id=? AND merchant_id=?', [proof.state, relayId, merchantId]);
    if (review) {
      await c.execute(`INSERT INTO sales_escalation_reviews (merchant_id,relay_id,actor_user_id,revision,evidence_hash,outcome,note) VALUES (?,?,?,?,?,?,?)`,
        [merchantId,relayId,review.actorUserId,r.review_revision+1,proof.evidence,proof.outcome,review.note]);
      await c.execute('UPDATE sales_escalation_relays SET review_revision=review_revision+1 WHERE id=? AND merchant_id=?', [relayId,merchantId]);
    }
    return { ...r, outcome: proof.outcome, receipt: proof.receipt };
  });
  if (record.receipt && !record.teaching_recorded_at) {
    try {
      const { saveMerchantTeaching } = await import('../knowledge/merchant-teaching');
      await saveMerchantTeaching({ merchantId, question: record.question.slice(0,500), answer: record.reply_text, origin: 'escalation_reply', referenceId: record.escalation_id });
      const pool = await getPool(); if (!pool) throw new Error('Storage unavailable');
      await pool.execute('UPDATE sales_escalation_relays SET teaching_recorded_at=UTC_TIMESTAMP(),next_reconcile_at=NULL WHERE id=? AND merchant_id=? AND status=\'accepted\'', [relayId,merchantId]);
    } catch {
      const pool = await getPool();
      await pool?.execute("UPDATE sales_escalation_relays SET last_reconcile_error='teaching_pending',next_reconcile_at=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP()) WHERE id=? AND merchant_id=?", [relayId,merchantId]).catch(() => {});
    }
  } else if (record.receipt) {
    const pool = await getPool();
    await pool?.execute('UPDATE sales_escalation_relays SET next_reconcile_at=NULL WHERE id=? AND merchant_id=?', [relayId,merchantId]);
  }
  return { outcome: record.outcome as Outcome, customerPhone: record.customer_phone as string };
}

export async function reconcileEscalationRelay(merchantId: number, relayId: number) {
  id.parse(merchantId); id.parse(relayId); return settle(merchantId, relayId);
}
export async function reviewEscalationRelay(input: Review) {
  const review = relayReviewSchema.extend({ merchantId: id, actorUserId: id }).parse(input);
  return settle(review.merchantId, review.relayId, review);
}

export async function listEscalationRelays(merchantId: number, conversationId: number, beforeId?: number) {
  id.parse(merchantId); id.parse(conversationId); if (beforeId !== undefined) id.parse(beforeId);
  const pool = await getPool(); if (!pool) throw new Error('Storage unavailable');
  const [conversations] = await pool.execute<any[]>('SELECT id FROM conversations WHERE id=? AND merchantId=?', [conversationId,merchantId]);
  if (!conversations.length) throw new Error('Conversation unavailable');
  const [rows] = await pool.execute<any[]>(`${relaySql} WHERE r.merchant_id=? AND e.conversation_id=? AND r.id<? ORDER BY r.id DESC LIMIT 11`,
    [merchantId,conversationId,beforeId ?? Number.MAX_SAFE_INTEGER]);
  const items = [];
  for (const r of rows.slice(0,10)) {
    const [deliveries] = await pool.execute<any[]>('SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=?', [merchantId,key(r)]);
    const [reviews] = await pool.execute<any[]>('SELECT actor_user_id,note,outcome,created_at FROM sales_escalation_reviews WHERE merchant_id=? AND relay_id=? ORDER BY revision DESC LIMIT 1', [merchantId,r.id]);
    const proof = inspect(r,deliveries[0]);
    items.push({ id: r.id as number, revision: r.review_revision as number, evidence: proof.evidence, state: proof.state, outcome: proof.outcome,
      projected: r.status === 'accepted', sourceMessageId: r.source_message_id as number, question: r.question as string, reply: r.reply_text as string,
      authorPhone: r.author_phone as string, createdAt: new Date(r.created_at).toISOString(),
      receipt: proof.receipt, lastReview: reviews[0] ? { actorUserId: reviews[0].actor_user_id as number, note: reviews[0].note as string,
        outcome: reviews[0].outcome as Outcome, at: new Date(reviews[0].created_at).toISOString() } : null });
  }
  return { items, nextCursor: rows.length > 10 ? rows[9].id as number : null };
}

/** Bounded, cross-worker claim; a crash only delays rechecking. This worker never sends messages. */
export async function runEscalationReconciliationBatch() {
  const jobs = await checkoutTransaction(async c => {
    const [rows] = await c.execute<any[]>(`SELECT id,merchant_id FROM sales_escalation_relays WHERE next_reconcile_at<=UTC_TIMESTAMP()
      AND created_at<TIMESTAMPADD(MINUTE,-2,UTC_TIMESTAMP()) ORDER BY next_reconcile_at,id LIMIT 20 FOR UPDATE SKIP LOCKED`);
    for (const r of rows) await c.execute('UPDATE sales_escalation_relays SET next_reconcile_at=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP()) WHERE id=?', [r.id]);
    return rows;
  });
  for (const job of jobs) {
    try { await reconcileEscalationRelay(job.merchant_id,job.id); }
    catch {
      const pool = await getPool();
      await pool?.execute("UPDATE sales_escalation_relays SET last_reconcile_error='projection_unavailable' WHERE id=? AND merchant_id=?", [job.id,job.merchant_id]).catch(() => {});
    }
  }
  return jobs.length;
}

export async function startEscalationReconciliationWorker() {
  let active: Promise<unknown> | undefined, stopped = false;
  const tick = () => {
    if (stopped || active) return;
    active = runEscalationReconciliationBatch().catch(() => console.error('[Escalation] Reconciliation deferred'))
      .finally(() => { active = undefined; });
  };
  const timer = setInterval(tick,60_000); timer.unref(); tick();
  return async () => { stopped=true; clearInterval(timer); await active; };
}
