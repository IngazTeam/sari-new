import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { getPool } from '../db/connection';
import { checkoutTransaction } from './checkout-agreements';
import { ordinaryReplyDigest, ordinaryReplyText } from './reply-reservation';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { assertReplyUsageSchema, lockReplyUsageCapacity, replyUsageTime as time,
  replyUsageSqlTime as sqlTime, replyUsageUnavailable as unavailable } from './reply-usage-quota';
import type { ReplyPlan } from '../messaging/reply-plan';
import type { SendMerchantWhatsAppInput } from '../channels/whatsapp/types';

const id = z.number().int().positive().safe();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const parsed = (value: any) => typeof value === 'string' ? JSON.parse(value) : value;
function planFor(row: any): ReplyPlan {
  const plan: ReplyPlan = parsed(row.reply_plan);
  if (row.reply_origin !== 'ordinary' || !plan?.effects?.length || ordinaryReplyDigest(plan) !== row.reply_digest
      || ordinaryReplyText(plan) !== row.reply_text || plan.conversationId !== Number(row.conversation_id)
      || plan.incomingMessageId !== Number(row.incoming_message_id)
      || plan.effects.some(e => e.merchantId !== Number(row.merchant_id) || e.replyGuard || e.salesReplyGuard || e.retryFailed)
      || new Set(plan.effects.map(e => e.idempotencyKey)).size !== plan.effects.length) return unavailable();
  return plan;
}
function proof(row: any) {
  return { version: 'ordinary-reply-usage.v1', merchantId: id.parse(Number(row.merchant_id)), interactionId: id.parse(Number(row.id)),
    replyDigest: digest.parse(row.reply_digest), subscriptionId: id.parse(Number(row.usage_subscription_id)), periodStart: time(row.usage_period_start),
    units: z.literal(2).parse(Number(row.usage_units)), reservedAt: time(row.usage_reserved_at), outboxId: id.parse(Number(row.usage_outbox_id)),
    provider: z.enum(['green_api','meta_cloud','mock']).parse(row.usage_provider), requestDigest: digest.parse(row.usage_request_digest) };
}
function verify(row: any) {
  const p = proof(row);
  if (policyArtifactDigest(p) !== row.usage_digest) return unavailable();
  return p;
}
const requestBody = (effect: SendMerchantWhatsAppInput) => ({ to: effect.to, kind: effect.kind, text: effect.text,
  mediaUrl: effect.mediaUrl, fileName: effect.fileName, template: effect.template });

/** Nonlocking channel reads avoid the outbox INSERT -> merchant FK lock inversion. */
async function receipt(c: PoolConnection, row: any, effect: SendMerchantWhatsAppInput) {
  const [rows] = await c.execute<any[]>(`SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=?`,
    [row.merchant_id,effect.idempotencyKey]);
  const r = rows[0], request = parsed(r?.request_json);
  if (rows.length !== 1 || r.direction !== 'outgoing' || Number(r.instance_id) !== effect.instanceRecordId || !request
      || policyArtifactDigest(requestBody(request)) !== policyArtifactDigest(requestBody(effect))
      || request.replyGuard?.conversationId !== Number(row.conversation_id) || request.replyGuard?.incomingMessageId !== Number(row.incoming_message_id)
      || request.replyGuard?.version !== parsed(row.reply_plan).ownershipVersion
      || request.replyGuard?.reservationDigest && request.replyGuard.reservationDigest !== row.reply_digest
      || request.salesReplyGuard || request.salesOfferGuard || request.escalationGuard || request.bookingNoticeGuard || request.appointmentReminderGuard)
    return unavailable();
  return { ...r, requestDigest: policyArtifactDigest(request) };
}
function accepted(r: any) {
  return typeof r.provider_message_id === 'string' && !!r.provider_message_id.trim() && ['sent','delivered','read','failed'].includes(r.status);
}
function rejected(r: any) {
  // Only definitive provider rejections free capacity. A crash or transport ambiguity keeps it held.
  return r.status === 'failed' && !r.provider_message_id && (/^http_4\d\d$/.test(r.error_code || '') && r.error_code !== 'http_408'
    || ['conversation_superseded','sales_reply_suppressed','followup_suppressed','escalation_suppressed',
      'appointment_reminder_suppressed','booking_notice_suppressed','sales_offer_suppressed',
      'invalid_request','configuration_missing','unsupported_template','mock_disabled'].includes(r.error_code));
}

/** Final gate owns merchant -> conversation -> interaction. Reserve once for the complete reply turn. */
export async function reserveOrdinaryReplyUsage(c: PoolConnection, row: any, effect: SendMerchantWhatsAppInput) {
  const plan = planFor(row), ordinal = plan.effects.findIndex(e => policyArtifactDigest(e) === policyArtifactDigest(effect));
  if (ordinal < 0) return unavailable();
  if (ordinal > 0) {
    if (!['held','charged'].includes(row.usage_state)) return unavailable();
    const p = verify(row);
    for (const previous of plan.effects.slice(0, ordinal)) {
      const r = await receipt(c,row,previous);
      if (!['sent','delivered','read'].includes(r.status) || !accepted(r)) return unavailable();
      if (previous === plan.effects[0] && (Number(r.id) !== p.outboxId || r.provider !== p.provider || r.requestDigest !== p.requestDigest)) return unavailable();
    }
    // Remaining parts cannot use a reservation from an expired or replaced subscription period.
    const [current] = await c.execute<any[]>(`SELECT s.id FROM merchant_subscriptions s JOIN merchants m ON m.current_subscription_id=s.id AND m.id=s.merchant_id
      WHERE m.id=? AND s.id=? AND s.last_reset_at=? AND s.status IN ('active','trial') AND s.start_date<=UTC_TIMESTAMP(3)
        AND s.end_date>UTC_TIMESTAMP(3) AND (s.status<>'trial' OR s.trial_ends_at>UTC_TIMESTAMP(3)) FOR UPDATE`, [p.merchantId,p.subscriptionId,sqlTime(p.periodStart)]);
    if (current.length !== 1) return unavailable();
    return;
  }
  // Historical plans are never silently rebilled or upgraded to a fresh send authorization.
  if (row.usage_state !== 'pending') return unavailable();
  const r = await receipt(c,row,effect);
  if (r.status !== 'queued' || r.provider_message_id || r.error_code) return unavailable();
  const capacity = await lockReplyUsageCapacity(c, Number(row.merchant_id));
  const [[clock]] = await c.execute<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
  const reservation = { ...row, usage_subscription_id: capacity.subscriptionId, usage_period_start: capacity.periodStart, usage_units: 2,
    usage_reserved_at: clock.now, usage_outbox_id: r.id, usage_provider: r.provider, usage_request_digest: r.requestDigest };
  const p = proof(reservation);
  const [saved] = await c.execute<any>(`UPDATE ai_interaction_jobs SET usage_state='held',usage_subscription_id=?,usage_period_start=?,usage_units=2,
    usage_reserved_at=?,usage_outbox_id=?,usage_provider=?,usage_request_digest=?,usage_digest=?,usage_recovery_at=UTC_TIMESTAMP(3)
    WHERE id=? AND merchant_id=? AND state='waiting_delivery' AND usage_state='pending' AND reply_digest=?
      AND EXISTS (SELECT 1 FROM merchant_subscriptions WHERE id=? AND merchant_id=? AND last_reset_at=? AND status IN ('active','trial')
        AND start_date<=UTC_TIMESTAMP(3) AND end_date>UTC_TIMESTAMP(3) AND (status<>'trial' OR trial_ends_at>UTC_TIMESTAMP(3)))`,
    [p.subscriptionId,sqlTime(p.periodStart),sqlTime(p.reservedAt),p.outboxId,p.provider,p.requestDigest,policyArtifactDigest(p),
      row.id,p.merchantId,p.replyDigest,p.subscriptionId,p.merchantId,sqlTime(p.periodStart)]);
  if (Number(saved.affectedRows) !== 1) return unavailable();
}

async function settle(c: PoolConnection, row: any) {
  if (['legacy','pending'].includes(row.usage_state)) return 'skipped' as const;
  const plan = planFor(row), p = verify(row);
  if (['charged','historical'].includes(row.usage_state)) return 'skipped' as const;
  const r = await receipt(c,row,plan.effects[0]);
  if (Number(r.id) !== p.outboxId || r.provider !== p.provider || r.requestDigest !== p.requestDigest) return unavailable();
  if (row.usage_state !== 'held') {
    if (!['charged','historical','released'].includes(row.usage_state) || row.usage_state === 'released' && accepted(r)) return unavailable();
    return 'skipped' as const;
  }
  if (!accepted(r) && !rejected(r)) return 'unknown' as const;
  let state = 'released';
  if (accepted(r)) {
    const [subscriptions] = await c.execute<any[]>('SELECT merchant_id,last_reset_at,messages_used FROM merchant_subscriptions WHERE id=? FOR UPDATE', [p.subscriptionId]);
    const s = subscriptions[0];
    if (s && Number(s.merchant_id) !== p.merchantId) return unavailable();
    state = 'historical';
    if (s && time(s.last_reset_at) === p.periodStart) {
      const [updated] = await c.execute<any>(`UPDATE merchant_subscriptions SET messages_used=messages_used+2
        WHERE id=? AND merchant_id=? AND last_reset_at=? AND messages_used>=0 AND messages_used<=2147483645`,
        [p.subscriptionId,p.merchantId,sqlTime(p.periodStart)]);
      if (Number(updated.affectedRows) !== 1) return unavailable();
      state = 'charged';
    }
  }
  const [updated] = await c.execute<any>(`UPDATE ai_interaction_jobs SET usage_state=?,usage_settled_at=UTC_TIMESTAMP(3),usage_recovery_at=NULL,usage_last_error=NULL
    WHERE id=? AND merchant_id=? AND usage_state='held' AND usage_digest=?`, [state,row.id,p.merchantId,row.usage_digest]);
  if (Number(updated.affectedRows) !== 1) return unavailable();
  return 'settled' as const;
}

/** Accounting only; never sends, reopens learning, or changes reply ownership. */
export async function reconcileOrdinaryReplyUsage(merchantId: number, incomingMessageId: number) {
  id.parse(merchantId); id.parse(incomingMessageId); await assertReplyUsageSchema();
  return checkoutTransaction(async c => {
    await c.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE', [merchantId]);
    const [rows] = await c.execute<any[]>('SELECT * FROM ai_interaction_jobs WHERE merchant_id=? AND incoming_message_id=? FOR UPDATE', [merchantId,incomingMessageId]);
    if (!rows.length || rows[0].reply_origin !== 'ordinary') return 'skipped' as const;
    return settle(c,rows[0]);
  });
}

export async function runOrdinaryReplyUsageRecoveryBatch() {
  await assertReplyUsageSchema(); const pool = await getPool(); if (!pool) return unavailable();
  const [rows] = await pool.execute<any[]>(`SELECT id,merchant_id,incoming_message_id,usage_digest FROM ai_interaction_jobs
    WHERE usage_state='held' AND usage_recovery_at<=UTC_TIMESTAMP(3) AND usage_attempts<8 ORDER BY usage_recovery_at,id LIMIT 10`);
  const result = { checked: rows.length, settled: 0, deferred: 0 };
  for (const row of rows) {
    let reason = 'transport_unknown';
    try { if (await reconcileOrdinaryReplyUsage(Number(row.merchant_id),Number(row.incoming_message_id)) !== 'unknown') { result.settled++; continue; } }
    catch { reason = 'evidence_unavailable'; }
    // Concurrent workers may inspect the same row; only one advances a due retry, and neither can resend.
    await pool.execute(`UPDATE ai_interaction_jobs SET usage_recovery_at=IF(usage_attempts>=7,NULL,
      TIMESTAMPADD(SECOND,LEAST(3600,30*POW(2,usage_attempts)),UTC_TIMESTAMP(3))),usage_attempts=usage_attempts+1,usage_last_error=?
      WHERE id=? AND merchant_id=? AND usage_state='held' AND usage_digest=? AND usage_recovery_at<=UTC_TIMESTAMP(3) AND usage_attempts<8`,
      [reason,row.id,row.merchant_id,row.usage_digest]);
    result.deferred++;
  }
  return result;
}

export async function startOrdinaryReplyUsageRecoveryWorker() {
  await assertReplyUsageSchema(); let stopped = false, active: Promise<unknown> | undefined;
  const tick = () => {
    if (stopped || active) return;
    active = runOrdinaryReplyUsageRecoveryBatch().catch(() => console.error('[ReplyUsageRecovery] Local accounting recovery deferred'))
      .finally(() => { active = undefined; });
  };
  const timer = setInterval(tick,60_000); timer.unref(); tick();
  return async () => { stopped = true; clearInterval(timer); await active; };
}
