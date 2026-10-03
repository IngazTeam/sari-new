import { getPool } from './db/connection';
import { ensureScheduledAuthoritySchema } from './scheduled-message-authorization';
import { lockScheduledWorkerAuthority, lockCampaignScheduledAuthority, ScheduledMessageAuthorityDenied, scheduledCampaignDigest } from './scheduled-message-worker-authority';
import { scheduledWeeklySlot } from '../shared/scheduled-message-policy';

export class ScheduledPreparationUnknown extends Error { constructor() { super('scheduled_preparation_unknown'); } }
const sqlTime = (iso: string) => iso.replace('T', ' ').replace('Z', '');
/** Local preparation only. Recipient consent, capacity and provider acceptance belong to the durable campaign path. */
export async function prepareScheduledMessage(merchantId: number, definitionId: number, now: () => Date = () => new Date()): Promise<'prepared' | 'skipped'> {
  if (![merchantId, definitionId].every(v => Number.isInteger(v) && v > 0)) throw new ScheduledMessageAuthorityDenied();
  await ensureScheduledAuthoritySchema(); const pool = await getPool(); if (!pool) throw Error('Scheduled preparation unavailable');
  const tx = await pool.getConnection(); let committing = false, reusable = true;
  try {
    await tx.beginTransaction();
    const [merchants] = await tx.execute<any[]>('SELECT id,userId,status,timezone FROM merchants WHERE id=? FOR UPDATE', [merchantId]);
    const [definitions] = await tx.execute<any[]>('SELECT * FROM scheduled_messages WHERE id=? AND merchant_id=? FOR UPDATE', [definitionId, merchantId]);
    if (merchants.length !== 1 || definitions.length !== 1) throw new ScheduledMessageAuthorityDenied();
    const authority = await lockScheduledWorkerAuthority(tx, merchants[0], definitions[0], now);
    const slot = scheduledWeeklySlot(authority.contract.definition, now(), 'due');
    if (slot.status !== 'ready' || Date.parse(slot.dueAt) < Date.parse(authority.contract.firstDueAt)) { await tx.rollback(); return 'skipped'; }
    const [existing] = await tx.execute<any[]>('SELECT id FROM scheduled_message_occurrences WHERE scheduled_message_id=? AND due_at=? FOR UPDATE', [definitionId, sqlTime(slot.dueAt)]);
    if (existing.length) { await tx.rollback(); return 'skipped'; }
    const [saved] = await tx.execute<any>('INSERT INTO scheduled_message_occurrences (merchant_id,scheduled_message_id,authorization_id,due_at,expires_at) VALUES (?,?,?,?,?)', [merchantId, definitionId, authority.record.id, sqlTime(slot.dueAt), sqlTime(slot.expiresAt)]);
    if (saved.affectedRows !== 1 || !Number.isInteger(saved.insertId) || saved.insertId <= 0) throw Error('Occurrence not persisted');
    const d = authority.contract.definition, occurrenceId = saved.insertId;
    const [campaign] = await tx.execute<any>("INSERT INTO campaigns (merchantId,name,message,imageUrl,targetAudience,status,scheduledAt,scheduled_message_occurrence_id) VALUES (?,?,?,NULL,'{}','scheduled',?,?)", [merchantId, d.title, d.message, sqlTime(slot.dueAt), occurrenceId]);
    if (campaign.affectedRows !== 1 || !Number.isInteger(campaign.insertId) || campaign.insertId <= 0) throw Error('Campaign not persisted');
    const digest = scheduledCampaignDigest({ id: campaign.insertId, merchantId, name: d.title, message: d.message, imageUrl: null, targetAudience: '{}', scheduledAt: slot.dueAt, scheduled_message_occurrence_id: occurrenceId });
    const [bound] = await tx.execute<any>('UPDATE scheduled_message_occurrences SET campaign_id=?,campaign_digest=? WHERE id=? AND campaign_id IS NULL', [campaign.insertId, digest, occurrenceId]);
    if (bound.affectedRows !== 1) throw Error('Occurrence binding not persisted');
    const fresh = scheduledWeeklySlot(d, now(), 'due');
    if (fresh.status !== 'ready' || fresh.dueAt !== slot.dueAt) throw new ScheduledMessageAuthorityDenied();
    committing = true; await tx.commit(); return 'prepared';
  } catch (error) {
    if (committing) reusable = false; else try { await tx.rollback(); } catch { reusable = false; }
    if (committing) throw new ScheduledPreparationUnknown();
    if (error instanceof ScheduledMessageAuthorityDenied) return 'skipped'; throw error;
  } finally { if (reusable) tx.release(); else tx.destroy(); }
}

/** Retire an invalid generated campaign before it can indefinitely occupy the due queue. Ordinary campaigns pass through. */
export async function validateScheduledCampaignAdmission(merchantId: number, campaignId: number, now: () => Date = () => new Date()): Promise<boolean> {
  await ensureScheduledAuthoritySchema(); const pool = await getPool(); if (!pool) throw Error('Scheduled admission unavailable');
  const tx = await pool.getConnection(); let committing = false, reusable = true;
  try {
    await tx.beginTransaction();
    const [merchants] = await tx.execute<any[]>('SELECT id,userId,status,timezone FROM merchants WHERE id=? FOR UPDATE', [merchantId]);
    const [campaigns] = await tx.execute<any[]>('SELECT id,merchantId,name,message,imageUrl,targetAudience,scheduledAt,status,scheduled_message_occurrence_id FROM campaigns WHERE id=? AND merchantId=? FOR UPDATE', [campaignId, merchantId]);
    if (merchants.length !== 1 || campaigns.length !== 1 || campaigns[0].status !== 'scheduled') { await tx.rollback(); return false; }
    let allowed = true;
    try { await lockCampaignScheduledAuthority(tx, merchants[0], campaigns[0], 'admission', now); }
    catch (e) { if (!(e instanceof ScheduledMessageAuthorityDenied)) throw e; allowed = false; await tx.execute("UPDATE campaigns SET status='failed',updatedAt=UTC_TIMESTAMP() WHERE id=? AND merchantId=? AND status='scheduled'", [campaignId, merchantId]); }
    committing = true; await tx.commit(); return allowed;
  } catch (e) { if (committing) reusable = false; else try { await tx.rollback(); } catch { reusable = false; } throw e; }
  finally { if (reusable) tx.release(); else tx.destroy(); }
}
