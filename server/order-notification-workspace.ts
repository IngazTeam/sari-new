import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from './db/connection';
import { databaseTimeEpoch } from './db/time';
import { ALL_ROLES, hasPermission, type MerchantRole } from './_core/permissions';
import { orderNoticeSelection, orderNoticeDetailInput, orderNoticeWorkspace, orderNoticeDetail, orderNoticeTemplate,
  orderNoticeRow, orderNoticeStatus, orderNoticeState, orderNoticeEvidence, type OrderNoticeRow } from '../shared/order-notification-workspace';
import { defaultTemplates, ORDER_NOTIFICATION_STATUSES } from './notifications/order-notifications';

export class OrderNoticeError extends Error {
  constructor(readonly reason: 'forbidden' | 'missing' | 'unavailable') { super('order_notice:' + reason); }
}
export async function noticeRows(tx: PoolConnection, sql: string, args: any[] = []) {
  const [r] = await tx.execute(sql, args); if (!Array.isArray(r)) throw new OrderNoticeError('unavailable'); return r as any[];
}
export async function withOrderNoticeRead<T>(actorId: number, merchantId: number, operation: (tx: PoolConnection, canManage: boolean) => Promise<T>) {
  let tx: PoolConnection | undefined, committing = false, reusable = true;
  try {
    if (![actorId, merchantId].every(n => Number.isInteger(n) && n > 0 && n <= 2147483647)) throw new OrderNoticeError('forbidden');
    const pool = await getPool(); if (!pool) throw new OrderNoticeError('unavailable');
    tx = await pool.getConnection(); await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); await tx.beginTransaction();
    const [merchant] = await noticeRows(tx, 'SELECT id,userId,status FROM merchants WHERE id=? FOR SHARE', [merchantId]);
    const users = await noticeRows(tx, 'SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE', [actorId, merchant?.userId || actorId]);
    const members = await noticeRows(tx, 'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE', [merchantId, actorId]);
    const role = members.length === 1 && members[0].is_active === 1 ? members[0].role : !members.length && merchant?.userId === actorId ? 'owner' : null;
    if (!merchant || !['active', 'pending'].includes(merchant.status) || users.find(u => u.id === actorId)?.account_status !== 'active'
      || users.find(u => u.id === merchant.userId)?.account_status !== 'active' || !ALL_ROLES.includes(role)
      || !hasPermission(role as MerchantRole, 'analytics.read')) throw new OrderNoticeError('forbidden');
    const result = await operation(tx, merchant.status === 'active' && hasPermission(role as MerchantRole, 'whatsapp.manage'));
    committing = true; await tx.commit(); return result;
  } catch (e) {
    if (committing) reusable = false; else if (tx) try { await tx.rollback(); } catch { reusable = false; }
    if (e instanceof OrderNoticeError) throw e; throw new OrderNoticeError('unavailable');
  } finally { if (tx) { if (reusable) tx.release(); else tx.destroy(); } }
}
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function projectNoticeTemplate(raw: any, status: string, actorId: number, merchantId: number) {
  const issues: Array<'status' | 'template' | 'enabled' | 'updatedAt'> = [];
  const canonical = orderNoticeStatus.safeParse(status), text = raw ? raw.template : defaultTemplates[canonical.success ? canonical.data : 'pending'];
  if (!canonical.success) issues.push('status');
  if (typeof text !== 'string' || !text.trim() || text.trim().length > 3500 || text.includes('\0')) issues.push('template');
  const enabled = raw ? raw.enabled === 1 ? true : raw.enabled === 0 ? false : null : false;
  if (enabled === null) issues.push('enabled');
  const epoch = raw ? databaseTimeEpoch(raw.updated_at) : NaN;
  if (raw && !Number.isFinite(epoch)) issues.push('updatedAt');
  return orderNoticeTemplate.parse({ id: raw?.id ?? null, status, canonicalStatus: canonical.success ? canonical.data : null, stored: !!raw,
    template: text, enabled, updatedAt: Number.isFinite(epoch) ? new Date(epoch).toISOString() : null, issues,
    revision: hash([actorId, merchantId, status, raw ?? null]) });
}

// One evidence expression is used for list, counts, filters and detail. The worker's `sent`
// flag is never evidence. Exact byte comparisons avoid case-insensitive SQL collation matches.
export const NOTICE_FROM = `order_notifications n LEFT JOIN orders o ON o.id=n.order_id AND o.merchantId=n.merchant_id
  LEFT JOIN whatsapp_message_deliveries d ON d.merchant_id=n.merchant_id AND d.idempotency_key=CONCAT('order-status:',n.merchant_id,':',n.event_key)
  LEFT JOIN whatsapp_instances i ON i.id=d.instance_id AND i.merchant_id=n.merchant_id AND i.provider=d.provider`;
const linked = '(o.id IS NOT NULL)';
const state = `CASE WHEN n.delivery_status IN ('pending','processing','sent','failed','manual_review','suppressed') THEN n.delivery_status ELSE 'unknown' END`;
const evidence = `CASE WHEN ${linked} AND REGEXP_LIKE(n.event_key,'^[a-f0-9]{64}$','c') AND d.direction='outgoing' AND i.id IS NOT NULL
    AND d.message_id IS NULL AND NULLIF(TRIM(d.provider_message_id),'') IS NOT NULL
    AND d.created_at>=n.created_at AND d.status_updated_at>=d.created_at AND d.status_updated_at<=UTC_TIMESTAMP(3)
    AND d.status IN ('sent','delivered','read','failed')
    AND JSON_TYPE(JSON_EXTRACT(d.request_json,'$.kind'))='STRING' AND BINARY JSON_UNQUOTE(JSON_EXTRACT(d.request_json,'$.kind'))=BINARY 'text'
    AND JSON_TYPE(JSON_EXTRACT(d.request_json,'$.to'))='STRING' AND BINARY JSON_UNQUOTE(JSON_EXTRACT(d.request_json,'$.to'))=BINARY n.customer_phone
    AND JSON_TYPE(JSON_EXTRACT(d.request_json,'$.text'))='STRING' AND BINARY JSON_UNQUOTE(JSON_EXTRACT(d.request_json,'$.text'))=BINARY n.message
    AND (JSON_EXTRACT(d.request_json,'$.mediaUrl') IS NULL OR JSON_TYPE(JSON_EXTRACT(d.request_json,'$.mediaUrl'))='NULL')
    AND (JSON_EXTRACT(d.request_json,'$.template') IS NULL OR JSON_TYPE(JSON_EXTRACT(d.request_json,'$.template'))='NULL')
  THEN CASE WHEN d.provider='mock' THEN 'simulated' WHEN d.status='sent' THEN 'accepted' ELSE d.status END ELSE 'unverified' END`;
export const NOTICE_SELECT = `n.*,o.id AS linked_order_id,o.orderNumber AS order_number,${linked} AS is_linked,${state} AS source_state,
  d.id AS receipt_id,d.provider AS receipt_provider,d.provider_message_id AS receipt_message_id,d.status_updated_at AS receipt_at,${evidence} AS evidence`;

export function projectOrderNotice(raw: any, actorId: number, merchantId: number): OrderNoticeRow {
  const issues: OrderNoticeRow['issues'] = [], isLinked = raw.is_linked === 1;
  const stamp = (key: string, optional = false) => {
    if (optional && raw[key] === null) return null; const ms = databaseTimeEpoch(raw[key]);
    if (!Number.isFinite(ms)) { if (!issues.includes('timestamp')) issues.push('timestamp'); return null; } return new Date(ms).toISOString();
  };
  const status = orderNoticeStatus.safeParse(raw.status); if (!status.success) issues.push('status');
  const stateValue = orderNoticeState.parse(raw.source_state); if (stateValue === 'unknown') issues.push('state');
  const attempts = Number.isSafeInteger(raw.attempts) && raw.attempts >= 0 ? raw.attempts : null; if (attempts === null) issues.push('attempts');
  const hasEvent = typeof raw.event_key === 'string' && /^[a-f0-9]{64}$/.test(raw.event_key); if (!hasEvent) issues.push('event');
  const proof = isLinked ? orderNoticeEvidence.parse(raw.evidence) : 'unverified';
  if (!isLinked) issues.push('reference');
  else if (proof === 'unverified' && raw.receipt_id !== null) issues.push('receipt');
  else if (proof === 'unverified' && stateValue === 'sent') issues.push('missing_receipt');
  const result = { id: raw.id, revision: hash([actorId, merchantId, raw]), integrity: isLinked ? 'linked' : 'unlinked',
    status: status.success ? status.data : null, state: stateValue, attempts, hasEvent, evidence: proof,
    order: isLinked ? { id: raw.linked_order_id, number: raw.order_number } : null,
    customerPhone: isLinked ? raw.customer_phone : null, message: isLinked ? raw.message : null,
    provider: proof !== 'unverified' ? raw.receipt_provider : null, providerMessageId: proof !== 'unverified' ? raw.receipt_message_id : null,
    evidenceAt: proof !== 'unverified' ? stamp('receipt_at') : null,
    createdAt: stamp('created_at'), updatedAt: stamp('updated_at'), availableAt: stamp('available_at'), claimedAt: stamp('claimed_at', true),
    sentAt: stamp('sent_at', true), reviewedAt: stamp('reviewed_at', true), reviewedByUserId: isLinked ? raw.reviewed_by_user_id : null,
    issues, salesVerification: 'not_verified' };
  return orderNoticeRow.parse(result);
}
const count = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  if (!Number.isSafeInteger(n) || n < 0) throw new OrderNoticeError('unavailable'); return n;
};
export async function readOrderNoticeWorkspace(actorId: number, merchantId: number, input: unknown) {
  const selection = orderNoticeSelection.parse(input);
  return withOrderNoticeRead(actorId, merchantId, async (tx, canManage) => {
    const stored = await noticeRows(tx, 'SELECT id,status,template,enabled,created_at,updated_at FROM notification_templates WHERE merchant_id=? ORDER BY id', [merchantId]);
    const byStatus = new Map(stored.map(r => [r.status, r])); if (byStatus.size !== stored.length) throw new OrderNoticeError('unavailable');
    const templates = [...ORDER_NOTIFICATION_STATUSES.map(status => projectNoticeTemplate(byStatus.get(status), status, actorId, merchantId)),
      ...stored.filter(r => !orderNoticeStatus.safeParse(r.status).success).map(r => projectNoticeTemplate(r,r.status,actorId,merchantId))];
    const groups = await noticeRows(tx, `SELECT ${linked} AS linked,${state} AS state,${evidence} AS evidence,COUNT(*) AS total FROM ${NOTICE_FROM} WHERE n.merchant_id=? GROUP BY linked,state,evidence`, [merchantId]);
    const stats = { total: 0, linked: 0, unlinked: 0, states: Object.fromEntries(orderNoticeState.options.map(s => [s,0])), evidence: Object.fromEntries(orderNoticeEvidence.options.map(s => [s,0])) };
    for (const g of groups) {
      const n = count(g.total), s = orderNoticeState.parse(g.state), e = orderNoticeEvidence.parse(g.evidence);
      if (g.linked !== 0 && g.linked !== 1) throw new OrderNoticeError('unavailable');
      stats.total += n; stats[g.linked === 1 ? 'linked' : 'unlinked'] += n; stats.states[s] += n; stats.evidence[e] += n;
    }
    const predicates = ['n.merchant_id=?'], args: any[] = [merchantId];
    if (selection.integrity !== 'all') predicates.push(selection.integrity === 'linked' ? linked : `NOT ${linked}`);
    if (selection.status) { predicates.push('n.status=?'); args.push(selection.status); }
    if (selection.state) { predicates.push(`(${state})=?`); args.push(selection.state); }
    if (selection.evidence) { predicates.push(`(${evidence})=?`); args.push(selection.evidence); }
    if (selection.query) {
      predicates.push(`(CAST(n.id AS CHAR)=? OR (${linked} AND (INSTR(LOWER(n.message),LOWER(?))>0 OR INSTR(n.customer_phone,?)>0 OR INSTR(LOWER(o.orderNumber),LOWER(?))>0)))`);
      args.push(selection.query, selection.query, selection.query, selection.query);
    }
    const where = predicates.join(' AND '), [matched] = await noticeRows(tx, `SELECT COUNT(*) AS total FROM ${NOTICE_FROM} WHERE ${where}`, args);
    const total = count(matched?.total), pages = Math.ceil(total / 25), currentPage = Math.min(selection.page, Math.max(1, pages)), direction = selection.sort === 'oldest' ? 'ASC' : 'DESC';
    const source = await noticeRows(tx, `SELECT ${NOTICE_SELECT} FROM ${NOTICE_FROM} WHERE ${where} ORDER BY n.created_at ${direction},n.id ${direction} LIMIT 25 OFFSET ${(currentPage-1)*25}`, args);
    return orderNoticeWorkspace.parse({ actorId, merchantId, canManage, checkedAt: new Date().toISOString(), selection, templates, stats,
      rows: source.map(r => projectOrderNotice(r,actorId,merchantId)), matched: total, pages, currentPage, pageSize: 25, evidenceScope: 'matching_provider_receipts' });
  });
}
export async function readOrderNoticeDetail(actorId: number, merchantId: number, input: unknown) {
  const { id } = orderNoticeDetailInput.parse(input);
  return withOrderNoticeRead(actorId, merchantId, async (tx, canManage) => {
    const [r] = await noticeRows(tx, `SELECT ${NOTICE_SELECT} FROM ${NOTICE_FROM} WHERE n.merchant_id=? AND n.id=?`, [merchantId,id]);
    if (!r) throw new OrderNoticeError('missing');
    return orderNoticeDetail.parse({ actorId, merchantId, canManage, checkedAt: new Date().toISOString(), row: projectOrderNotice(r,actorId,merchantId) });
  });
}
