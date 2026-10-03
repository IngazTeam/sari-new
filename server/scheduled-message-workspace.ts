import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from './db/connection';
import { databaseTimeEpoch } from './db/time';
import { ALL_ROLES, hasPermission, type MerchantRole } from './_core/permissions';
import { scheduledMessageSelection, scheduledMessageRow, scheduledMessageWorkspace, type ScheduledMessageSelection } from '../shared/scheduled-message-workspace';

export class ScheduledMessageWorkspaceError extends Error {
  constructor(readonly reason: 'forbidden' | 'unavailable') { super('scheduled_workspace:' + reason); }
}
const rows = async (tx: PoolConnection, sql: string, args: any[] = []) => {
  const [result] = await tx.execute(sql, args); if (!Array.isArray(result)) throw new ScheduledMessageWorkspaceError('unavailable'); return result as any[];
};
export function projectScheduledMessage(raw: any) {
  const issues: any[] = [];
  const text = (value: unknown, key: string, max: number) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) { issues.push(key); return null; } return value;
  };
  const title = text(raw.title, 'title', 255), message = text(raw.message, 'message', 65535);
  const dayOfWeek = Number.isInteger(raw.day_of_week) && raw.day_of_week >= 0 && raw.day_of_week <= 6 ? raw.day_of_week : null;
  const time = typeof raw.time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw.time) ? raw.time : null;
  const enabled = raw.is_active === 1 ? true : raw.is_active === 0 ? false : null;
  if (dayOfWeek === null) issues.push('day'); if (time === null) issues.push('time'); if (enabled === null) issues.push('active');
  const date = (key: string, optional = false) => {
    if (raw[key] === null && optional) return null;
    const epoch = databaseTimeEpoch(raw[key]); if (!Number.isFinite(epoch)) { issues.push(key); return null; } return new Date(epoch).toISOString();
  };
  const legacyLastSentAt = date('last_sent_at', true), createdAt = date('created_at'), updatedAt = date('updated_at');
  // Include the original values: an invalid value changing to another invalid value must still invalidate review.
  const revision = createHash('sha256').update(JSON.stringify([raw.id, raw.merchant_id, raw.title, raw.message, raw.day_of_week, raw.time,
    raw.is_active, raw.last_sent_at, raw.created_at, raw.updated_at])).digest('hex');
  return scheduledMessageRow.parse({ id: raw.id, revision, title, message, dayOfWeek, time, enabled,
    state: enabled === true ? 'enabled' : enabled === false ? 'disabled' : 'unknown', legacyLastSentAt, createdAt, updatedAt, issues });
}

/** A selected-tenant snapshot. Legacy timestamps are not delivery receipts or sales evidence. */
export async function readScheduledMessageWorkspace(actorId: number, merchantId: number, input: ScheduledMessageSelection) {
  const selection = scheduledMessageSelection.parse(input); let tx: PoolConnection | undefined, committing = false, reusable = true;
  try {
    if (![actorId, merchantId].every(n => Number.isInteger(n) && n > 0 && n <= 2147483647)) throw new ScheduledMessageWorkspaceError('forbidden');
    const pool = await getPool(); if (!pool) throw new ScheduledMessageWorkspaceError('unavailable');
    tx = await pool.getConnection(); await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); await tx.beginTransaction();
    const [merchant] = await rows(tx, 'SELECT userId,status FROM merchants WHERE id=? FOR SHARE', [merchantId]);
    const [user] = await rows(tx, 'SELECT account_status FROM users WHERE id=? FOR SHARE', [actorId]);
    const members = await rows(tx, 'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE', [merchantId, actorId]);
    const role = members.length === 1 && members[0].is_active === 1 ? members[0].role : !members.length && merchant?.userId === actorId ? 'owner' : null;
    if (!merchant || merchant.status === 'suspended' || user?.account_status !== 'active' || !ALL_ROLES.includes(role)
      || !hasPermission(role as MerchantRole, 'analytics.read')) throw new ScheduledMessageWorkspaceError('forbidden');
    const [stats] = await rows(tx, `SELECT COUNT(*) AS total,COALESCE(SUM(is_active=1),0) AS enabled,
      COALESCE(SUM(is_active=0),0) AS disabled,COALESCE(SUM(is_active NOT IN (0,1)),0) AS unknown,
      COALESCE(SUM(last_sent_at IS NOT NULL),0) AS stamped FROM scheduled_messages WHERE merchant_id=?`, [merchantId]);
    const predicates = ['merchant_id=?'], args: Array<string | number> = [merchantId];
    if (selection.state !== 'all') predicates.push(selection.state === 'enabled' ? 'is_active=1' : selection.state === 'disabled' ? 'is_active=0' : 'is_active NOT IN (0,1)');
    if (selection.day !== null) { predicates.push('day_of_week=?'); args.push(selection.day); }
    if (selection.query) { predicates.push('(INSTR(LOWER(title),LOWER(?))>0 OR INSTR(LOWER(message),LOWER(?))>0 OR CAST(id AS CHAR)=?)'); args.push(selection.query, selection.query, selection.query); }
    const where = predicates.join(' AND '), [matching] = await rows(tx, 'SELECT COUNT(*) AS total FROM scheduled_messages WHERE ' + where, args);
    const total = Number(stats.total), matched = Number(matching.total), pages = Math.ceil(matched / 25), currentPage = Math.min(selection.page, Math.max(1, pages));
    const order = { newest: 'created_at DESC,id DESC', oldest: 'created_at ASC,id ASC', title: 'title ASC,id ASC', schedule: 'day_of_week ASC,time ASC,id ASC' }[selection.sort];
    const source = await rows(tx, `SELECT * FROM scheduled_messages WHERE ${where} ORDER BY ${order} LIMIT 25 OFFSET ${(currentPage - 1) * 25}`, args);
    const result = scheduledMessageWorkspace.parse({ actorId, merchantId, checkedAt: new Date().toISOString(), canManage: merchant.status === 'active' && hasPermission(role as MerchantRole, 'campaigns.manage'),
      selection, pageSize: 25, currentPage, pages, total, matched, counts: { enabled: Number(stats.enabled), disabled: Number(stats.disabled), unknown: Number(stats.unknown) },
      definitionsWithRecordedTimestamp: Number(stats.stamped), timeBasis: 'legacy_server_local', timezone: null, deliveryEvidence: 'legacy_timestamp_only',
      audienceEvidence: 'not_recorded', channelEvidence: 'not_recorded', salesAttribution: 'not_verified', rows: source.map(projectScheduledMessage) });
    committing = true; await tx.commit(); return result;
  } catch (error) {
    if (committing) reusable = false; else if (tx) try { await tx.rollback(); } catch { reusable = false; }
    if (error instanceof ScheduledMessageWorkspaceError) throw error; throw new ScheduledMessageWorkspaceError('unavailable');
  } finally { if (tx) { if (reusable) tx.release(); else tx.destroy(); } }
}
