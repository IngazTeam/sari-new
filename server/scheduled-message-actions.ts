import type { PoolConnection } from 'mysql2/promise';
import { getPool } from './db/connection';
import { ALL_ROLES, hasPermission, type MerchantRole } from './_core/permissions';
import { policyArtifactDigest } from './ai/learning-policy-evaluation-bundle';
import { scheduledActionTarget, scheduledActionReview, scheduledActionApply, scheduledActionResult, scheduledReceiptInput, scheduledCancelledReceipt, type ScheduledActionTarget } from '../shared/scheduled-message-actions';
import { scheduledDefinitionFields, scheduledMessagePreview, scheduledWeeklySlot, scheduledAdmissionMinutes, scheduledDeliveryMinutes, type ScheduledDefinition } from '../shared/scheduled-message-policy';
import { ensureScheduledAuthoritySchema, buildScheduledAuthorization, writeScheduledAuthorization, revokeScheduledAuthorization } from './scheduled-message-authorization';
import { projectScheduledMessage } from './scheduled-message-workspace';

export class ScheduledActionError extends Error {
  constructor(readonly reason: 'forbidden' | 'missing' | 'invalid' | 'timezone' | 'channel' | 'schedule' | 'stale' | 'reused' | 'cancelled' | 'unavailable' | 'unknown') { super('scheduled_action:' + reason); }
}
const rows = async (tx: PoolConnection, sql: string, args: any[] = []) => { const [r] = await tx.execute(sql, args); if (!Array.isArray(r)) throw new ScheduledActionError('unavailable'); return r as any[]; };
const lifespan = 5 * 60000;
export function assertScheduledReviewTime(checkedAt: string) {
  const age = Date.now() - Date.parse(checkedAt); if (!Number.isFinite(age) || age < 0 || age > lifespan) throw new ScheduledActionError('stale');
}
async function transaction<T>(actorId: number, merchantId: number, manage: boolean, operation: (tx: PoolConnection, merchant: any) => Promise<T>): Promise<T> {
  let tx: PoolConnection | undefined, committing = false, reusable = true;
  try {
    if (![actorId, merchantId].every(v => Number.isInteger(v) && v > 0 && v <= 2147483647)) throw new ScheduledActionError('forbidden');
    await ensureScheduledAuthoritySchema(); const pool = await getPool(); if (!pool) throw new ScheduledActionError('unavailable');
    tx = await pool.getConnection(); await tx.beginTransaction();
    const merchants = await rows(tx, 'SELECT id,userId,status,timezone FROM merchants WHERE id=? FOR UPDATE', [merchantId]), m = merchants[0];
    if (!m || m.status === 'suspended' || manage && m.status !== 'active') throw new ScheduledActionError('forbidden');
    const users = await rows(tx, 'SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE', [actorId, m.userId]);
    const members = await rows(tx, 'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE', [merchantId, actorId]);
    const role = members.length === 1 && members[0].is_active === 1 ? members[0].role : members.length === 0 && m.userId === actorId ? 'owner' : null;
    if (!users.some(u => u.id === actorId && u.account_status === 'active') || !users.some(u => u.id === m.userId && u.account_status === 'active')
      || !ALL_ROLES.includes(role) || !hasPermission(role as MerchantRole, manage ? 'campaigns.manage' : 'analytics.read')) throw new ScheduledActionError('forbidden');
    const result = await operation(tx, m); committing = true; await tx.commit(); return result;
  } catch (e) {
    if (committing) reusable = false; else if (tx) try { await tx.rollback(); } catch { reusable = false; }
    if (committing) throw new ScheduledActionError('unknown'); if (e instanceof ScheduledActionError) throw e; throw new ScheduledActionError('unavailable');
  } finally { if (tx) { if (reusable) tx.release(); else tx.destroy(); } }
}
async function snapshot(tx: PoolConnection, actorId: number, merchant: any, target: ScheduledActionTarget, checkedAt: string) {
  assertScheduledReviewTime(checkedAt);
  const merchantId = merchant.id, id = target.action === 'create' ? null : target.id;
  const before = id === null ? null : (await rows(tx, 'SELECT * FROM scheduled_messages WHERE id=? AND merchant_id=? FOR UPDATE', [id, merchantId]))[0];
  if (id !== null && !before) throw new ScheduledActionError('missing');
  const prior = id === null ? [] : await rows(tx, 'SELECT id,active,contract_digest,revoked_at FROM scheduled_message_authorizations WHERE merchant_id=? AND scheduled_message_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE', [merchantId, id]);
  const enabling = target.action === 'toggle' && target.enabled;
  let proposed: ScheduledDefinition | null = null, nextDueAt: string | null = null, instanceId: number | null = null, channelPhone: string | null = null;
  if (target.action === 'create' || target.action === 'update') proposed = target.data;
  else if (enabling) {
    const parsed = scheduledDefinitionFields.safeParse({ title: before.title, message: before.message, dayOfWeek: before.day_of_week, time: before.time, timezone: merchant.timezone });
    if (!parsed.success || parsed.data.title !== before.title || parsed.data.message !== before.message) throw new ScheduledActionError('invalid'); proposed = parsed.data;
  }
  if (proposed && proposed.timezone !== merchant.timezone) throw new ScheduledActionError('timezone');
  if (enabling) {
    const slot = scheduledWeeklySlot(proposed!, new Date(checkedAt), 'next');
    if (slot.status !== 'ready') throw new ScheduledActionError('schedule');
    if (Date.parse(slot.dueAt) <= Date.now()) throw new ScheduledActionError('stale'); nextDueAt = slot.dueAt;
    const instances = await rows(tx, 'SELECT id,status,phone_number FROM whatsapp_instances WHERE merchant_id=? AND is_primary=1 FOR SHARE', [merchantId]);
    if (instances.length !== 1 || instances[0].status !== 'active') throw new ScheduledActionError('channel');
    instanceId = instances[0].id; channelPhone = instances[0].phone_number;
  }
  const effect = target.action === 'create' ? 'create_paused' : target.action === 'update' ? 'update_paused' : target.action === 'delete' ? 'delete' : target.enabled ? 'enable' : 'disable';
  const terms = { actorId, merchantId, target, checkedAt, expiresAt: new Date(Date.parse(checkedAt) + lifespan).toISOString(), effect, proposed, nextDueAt, instanceId, channelPhone,
    messagePreview: proposed ? scheduledMessagePreview(proposed) : null, repeat: 'weekly_until_paused', audience: 'current_consented_conversations', audienceLimit: 2000,
    admissionMinutes: scheduledAdmissionMinutes, deliveryMinutes: scheduledDeliveryMinutes, sendsImmediately: false, deliveryGuaranteed: false, salesVerified: false, retainsDeliveryHistory: true };
  // Preserve raw malformed values in the revision. Operational timestamps/counters cannot change the reviewed definition.
  const raw = before ? { id: before.id, merchantId, title: before.title, message: before.message, day: before.day_of_week, time: before.time, active: before.is_active } : null;
  const reviewRevision = policyArtifactDigest({ version: 1, ...terms, raw, prior });
  return scheduledActionReview.parse({ ...terms, before: before ? projectScheduledMessage(before) : null, reviewRevision });
}
export function reviewScheduledAction(actorId: number, merchantId: number, input: unknown) {
  const target = scheduledActionTarget.parse(input); return transaction(actorId, merchantId, true, (tx, merchant) => snapshot(tx, actorId, merchant, target, new Date().toISOString()));
}
function receiptOutcome(row: any, actorId: number, merchantId: number, requestKey: string) {
  if (row.actor_id !== actorId) throw new ScheduledActionError('reused');
  const raw = typeof row.result_json === 'string' ? JSON.parse(row.result_json) : row.result_json;
  const result = row.state === 'cancelled' ? scheduledCancelledReceipt.parse(raw) : row.state === 'saved' ? scheduledActionResult.parse(raw) : null;
  if (!result || result.actorId !== actorId || result.merchantId !== merchantId || result.requestKey !== requestKey
    || row.state === 'saved' && !/^[a-f0-9]{64}$/.test(row.request_digest) || row.state === 'cancelled' && row.request_digest !== null) throw new ScheduledActionError('unavailable');
  return row.state === 'saved' ? { state: 'saved' as const, result: scheduledActionResult.parse(result) } : { state: 'cancelled' as const, result: scheduledCancelledReceipt.parse(result) };
}
const getReceipt = async (tx: PoolConnection, merchantId: number, requestKey: string) => (await rows(tx, 'SELECT actor_id,request_digest,state,result_json FROM scheduled_message_action_receipts WHERE merchant_id=? AND request_key=? FOR UPDATE', [merchantId, requestKey]))[0];
export function readScheduledActionReceipt(actorId: number, merchantId: number, input: unknown) {
  const { requestKey } = scheduledReceiptInput.parse(input); return transaction(actorId, merchantId, false, async tx => {
    const saved = await getReceipt(tx, merchantId, requestKey); return saved ? receiptOutcome(saved, actorId, merchantId, requestKey) : { state: 'missing' as const, result: null };
  });
}
export function resolveScheduledActionReceipt(actorId: number, merchantId: number, input: unknown) {
  const { requestKey } = scheduledReceiptInput.parse(input); return transaction(actorId, merchantId, false, async tx => {
    const saved = await getReceipt(tx, merchantId, requestKey); if (saved) return receiptOutcome(saved, actorId, merchantId, requestKey);
    const result = scheduledCancelledReceipt.parse({ state: 'cancelled', requestKey, actorId, merchantId, cancelledAt: new Date().toISOString() });
    const [stored] = await tx.execute<any>("INSERT INTO scheduled_message_action_receipts (merchant_id,actor_id,request_key,request_digest,state,result_json) VALUES (?,?,?,NULL,'cancelled',?)", [merchantId, actorId, requestKey, JSON.stringify(result)]);
    if (stored.affectedRows !== 1) throw new ScheduledActionError('unavailable'); return { state: 'cancelled' as const, result };
  });
}
export function applyScheduledAction(actorId: number, merchantId: number, input: unknown) {
  const value = scheduledActionApply.parse(input), requestDigest = policyArtifactDigest(value);
  return transaction(actorId, merchantId, true, async (tx, merchant) => {
    const saved = await getReceipt(tx, merchantId, value.requestKey);
    if (saved) { const outcome = receiptOutcome(saved, actorId, merchantId, value.requestKey); if (outcome.state === 'cancelled') throw new ScheduledActionError('cancelled'); if (saved.request_digest !== requestDigest) throw new ScheduledActionError('reused'); return outcome.result; }
    const current = await snapshot(tx, actorId, merchant, value.target, value.checkedAt);
    if (current.reviewRevision !== value.reviewRevision) throw new ScheduledActionError('stale');
    const target = value.target; let id = target.action === 'create' ? 0 : target.id, authorizationId: number | null = null, enabled: boolean | null = false;
    if (id) await revokeScheduledAuthorization(tx, merchantId, id);
    if (target.action === 'create') {
      const d = target.data, [result] = await tx.execute<any>('INSERT INTO scheduled_messages (merchant_id,title,message,day_of_week,time,is_active) VALUES (?,?,?,?,?,0)', [merchantId, d.title, d.message, d.dayOfWeek, d.time]);
      id = result.insertId; if (result.affectedRows !== 1 || !Number.isInteger(id) || id <= 0) throw new ScheduledActionError('unavailable');
    } else if (target.action === 'delete') {
      const [result] = await tx.execute<any>('DELETE FROM scheduled_messages WHERE id=? AND merchant_id=?', [id, merchantId]); if (result.affectedRows !== 1) throw new ScheduledActionError('missing'); enabled = null;
    } else if (target.action === 'update') {
      const d = target.data, [result] = await tx.execute<any>('UPDATE scheduled_messages SET title=?,message=?,day_of_week=?,time=?,is_active=0,updated_at=UTC_TIMESTAMP() WHERE id=? AND merchant_id=?', [d.title, d.message, d.dayOfWeek, d.time, id, merchantId]); if (result.affectedRows !== 1) throw new ScheduledActionError('missing');
    } else {
      enabled = target.enabled;
      const [result] = await tx.execute<any>('UPDATE scheduled_messages SET is_active=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND merchant_id=?', [enabled ? 1 : 0, id, merchantId]); if (result.affectedRows !== 1) throw new ScheduledActionError('missing');
      if (enabled) authorizationId = await writeScheduledAuthorization(tx, buildScheduledAuthorization({ actorId, merchantId, scheduledMessageId: id, reviewRevision: value.reviewRevision, definition: current.proposed!, instanceId: current.instanceId! }, new Date(value.checkedAt)));
    }
    const result = scheduledActionResult.parse({ requestKey: value.requestKey, actorId, merchantId, id, action: target.action, enabled, authorizationId, nextDueAt: enabled ? current.nextDueAt : null, savedAt: new Date().toISOString() });
    const [recorded] = await tx.execute<any>("INSERT INTO scheduled_message_action_receipts (merchant_id,actor_id,request_key,request_digest,state,result_json) VALUES (?,?,?,?,'saved',?)", [merchantId, actorId, value.requestKey, requestDigest, JSON.stringify(result)]);
    if (recorded.affectedRows !== 1) throw new ScheduledActionError('unavailable'); assertScheduledReviewTime(value.checkedAt);
    if (result.nextDueAt && Date.parse(result.nextDueAt) <= Date.now()) throw new ScheduledActionError('stale'); return result;
  });
}
