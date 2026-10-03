import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from './db/connection';
import { databaseTimeEpoch } from './db/time';
import { ALL_ROLES, hasPermission, type MerchantRole } from './_core/permissions';
import { reviewKind, reviewSelection, reviewDetailInput, reviewRow, reviewWorkspace, reviewDetail, type ReviewKind, type ReviewRow } from '../shared/review-workspace';

export class ReviewWorkspaceError extends Error {
  constructor(readonly reason: 'forbidden' | 'missing' | 'unavailable') { super('review_workspace:' + reason); }
}
export const reviewRows = async (tx: PoolConnection, sql: string, args: any[] = []) => {
  const [result] = await tx.execute(sql, args);
  if (!Array.isArray(result)) throw new ReviewWorkspaceError('unavailable');
  return result as any[];
};

/** Tenant authority is rechecked in the same transaction as the full data snapshot. */
export async function withReviewRead<T>(actorId: number, merchantId: number,
  operation: (tx: PoolConnection, canReply: boolean) => Promise<T>): Promise<T> {
  let tx: PoolConnection | undefined, committing = false, reusable = true;
  try {
    if (![actorId, merchantId].every(n => Number.isInteger(n) && n > 0 && n <= 2147483647)) throw new ReviewWorkspaceError('forbidden');
    const pool = await getPool(); if (!pool) throw new ReviewWorkspaceError('unavailable');
    tx = await pool.getConnection(); await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); await tx.beginTransaction();
    const [merchant] = await reviewRows(tx, 'SELECT id,userId,status FROM merchants WHERE id=? FOR SHARE', [merchantId]);
    const users = await reviewRows(tx, 'SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE', [actorId, merchant?.userId || actorId]);
    const members = await reviewRows(tx, 'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE', [merchantId, actorId]);
    const role = members.length === 1 && members[0].is_active === 1 ? members[0].role : !members.length && merchant?.userId === actorId ? 'owner' : null;
    if (!merchant || !['active', 'pending'].includes(merchant.status) || users.find(u => u.id === actorId)?.account_status !== 'active'
      || users.find(u => u.id === merchant.userId)?.account_status !== 'active' || !ALL_ROLES.includes(role)
      || !hasPermission(role as MerchantRole, 'analytics.read')) throw new ReviewWorkspaceError('forbidden');
    const result = await operation(tx, merchant.status === 'active' && hasPermission(role as MerchantRole, 'conversations.reply'));
    committing = true; await tx.commit(); return result;
  } catch (error) {
    if (committing) reusable = false; else if (tx) try { await tx.rollback(); } catch { reusable = false; }
    if (error instanceof ReviewWorkspaceError) throw error;
    throw new ReviewWorkspaceError('unavailable');
  } finally { if (tx) { if (reusable) tx.release(); else tx.destroy(); } }
}

// These are fixed SQL identifiers, never supplied by the caller. Optional catalog references
// need the same tenant. A booking review must also reference its booking's service/staff.
export function reviewSource(kind: ReviewKind) {
  const order = reviewKind.parse(kind) === 'order';
  return order ? {
    from: `customer_reviews r LEFT JOIN orders b ON b.id=r.orderId AND b.merchantId=r.merchantId
      LEFT JOIN products p ON p.id=r.productId AND p.merchantId=r.merchantId`,
    tenant: 'r.merchantId', rating: 'r.rating', reply: 'r.merchantReply', visibility: 'r.isPublic', created: 'r.createdAt',
    linked: '(b.id IS NOT NULL AND (r.productId IS NULL OR p.id IS NOT NULL))',
    search: ['r.customerName', 'r.customerPhone', 'r.comment', 'r.merchantReply', 'b.orderNumber', 'p.name'],
    select: `r.id,r.merchantId AS merchant_id,r.orderId AS record_id,r.productId AS product_id,NULL AS service_id,NULL AS staff_id,
      r.customerName AS customer_name,r.customerPhone AS customer_phone,r.rating,r.comment,r.merchantReply AS merchant_reply,
      r.isPublic AS is_public,r.createdAt AS created_at,r.updatedAt AS updated_at,r.repliedAt AS replied_at,
      b.id AS linked_record_id,b.orderNumber AS record_label,p.id AS linked_product_id,p.name AS product_name,
      NULL AS linked_service_id,NULL AS service_name,NULL AS linked_staff_id,NULL AS staff_name,
      NULL AS quality,NULL AS professionalism,NULL AS value`,
  } : {
    from: `booking_reviews r LEFT JOIN bookings b ON b.id=r.booking_id AND b.merchant_id=r.merchant_id
      AND b.service_id=r.service_id AND (b.staff_id <=> r.staff_id)
      LEFT JOIN services s ON s.id=r.service_id AND s.merchant_id=r.merchant_id
      LEFT JOIN staff_members t ON t.id=r.staff_id AND t.merchant_id=r.merchant_id`,
    tenant: 'r.merchant_id', rating: 'r.overall_rating', reply: 'r.merchant_reply', visibility: 'r.is_public', created: 'r.created_at',
    linked: '(b.id IS NOT NULL AND s.id IS NOT NULL AND (r.staff_id IS NULL OR t.id IS NOT NULL))',
    search: ['r.customer_name', 'r.customer_phone', 'r.comment', 'r.merchant_reply', 's.name', 't.name'],
    select: `r.id,r.merchant_id,r.booking_id AS record_id,NULL AS product_id,r.service_id,r.staff_id,
      r.customer_name,r.customer_phone,r.overall_rating AS rating,r.comment,r.merchant_reply,r.is_public,r.created_at,r.updated_at,r.replied_at,
      b.id AS linked_record_id,NULL AS record_label,NULL AS linked_product_id,NULL AS product_name,
      s.id AS linked_service_id,s.name AS service_name,t.id AS linked_staff_id,t.name AS staff_name,
      r.service_quality AS quality,r.professionalism,r.value_for_money AS value`,
  };
}

export function projectReview(raw: any, kind: ReviewKind): ReviewRow {
  const issues: ReviewRow['issues'] = [];
  const linked = Number(raw.is_linked) === 1;
  const date = (key: string, issue: 'createdAt' | 'updatedAt' | 'repliedAt', optional = false) => {
    if (optional && raw[key] === null) return null;
    const epoch = databaseTimeEpoch(raw[key]);
    if (!Number.isFinite(epoch)) { issues.push(issue); return null; } return new Date(epoch).toISOString();
  };
  const score = (key: string, issue: 'rating' | 'quality' | 'professionalism' | 'value', optional = false) => {
    if (optional && raw[key] === null) return null;
    if (Number.isInteger(raw[key]) && raw[key] >= 1 && raw[key] <= 5) return raw[key];
    issues.push(issue); return null;
  };
  const revision = createHash('sha256').update(JSON.stringify([kind, raw])).digest('hex');
  const createdAt = date('created_at', 'createdAt'), updatedAt = date('updated_at', 'updatedAt');
  if (!linked) return reviewRow.parse({ id: raw.id, kind, revision, integrity: 'unlinked', customerName: null, customerPhone: null,
    rating: null, comment: null, merchantReply: null, replyState: 'unknown', isPublic: null, createdAt, updatedAt, repliedAt: null,
    record: null, product: null, service: null, staff: null, dimensions: null, issues: ['reference', ...issues],
    replyDelivery: 'not_verified', purchaseVerification: 'not_verified' });
  const rating = score('rating', 'rating'), isPublic = raw.is_public === 1 ? true : raw.is_public === 0 ? false : null;
  if (isPublic === null) issues.push('visibility');
  const repliedAt = date('replied_at', 'repliedAt', true);
  const dimensions = kind === 'booking' ? { quality: score('quality', 'quality', true), professionalism: score('professionalism', 'professionalism', true), value: score('value', 'value', true) } : null;
  return reviewRow.parse({ id: raw.id, kind, revision, integrity: 'linked', customerName: raw.customer_name, customerPhone: raw.customer_phone,
    rating, comment: raw.comment, merchantReply: raw.merchant_reply, replyState: raw.merchant_reply?.trim() ? 'replied' : 'pending',
    isPublic, createdAt, updatedAt, repliedAt, record: { id: raw.linked_record_id, label: raw.record_label },
    product: raw.linked_product_id ? { id: raw.linked_product_id, name: raw.product_name } : null,
    service: raw.linked_service_id ? { id: raw.linked_service_id, name: raw.service_name } : null,
    staff: raw.linked_staff_id ? { id: raw.linked_staff_id, name: raw.staff_name } : null,
    dimensions, issues, replyDelivery: 'not_verified', purchaseVerification: 'not_verified' });
}

export async function readReviewWorkspace(actorId: number, merchantId: number, kind: ReviewKind, input: unknown) {
  const selection = reviewSelection.parse(input), s = reviewSource(kind);
  return withReviewRead(actorId, merchantId, async (tx, canReply) => {
    const rated = `(${s.linked} AND ${s.rating} BETWEEN 1 AND 5)`;
    const replied = `COALESCE(${s.reply} REGEXP '[^[:space:]]',0)`;
    const sum = (condition: string) => `COALESCE(SUM(${condition}),0)`;
    const [stats] = await reviewRows(tx, `SELECT COUNT(*) AS total,${sum(s.linked)} AS linked,${sum(rated)} AS rated,
      AVG(CASE WHEN ${rated} THEN ${s.rating} ELSE NULL END) AS average,
      ${sum(`${s.linked} AND ${replied}`)} AS replied,${sum(`${s.linked} AND ${s.visibility}=1`)} AS public_count,
      ${sum(`${s.linked} AND ${s.visibility}=0`)} AS private_count,
      ${[1, 2, 3, 4, 5].map(n => `${sum(`${rated} AND ${s.rating}=${n}`)} AS star${n}`).join(',')}
      FROM ${s.from} WHERE ${s.tenant}=?`, [merchantId]);
    const predicates = [`${s.tenant}=?`], args: Array<string | number> = [merchantId];
    if (selection.integrity !== 'all') predicates.push(selection.integrity === 'linked' ? s.linked : `NOT ${s.linked}`);
    if (selection.rating !== null) { predicates.push(`${s.linked} AND ${s.rating}=?`); args.push(selection.rating); }
    if (selection.reply !== 'all') predicates.push(`${s.linked} AND ${selection.reply === 'replied' ? replied : `NOT ${replied}`}`);
    if (selection.visibility !== 'all') predicates.push(`${s.linked} AND ${selection.visibility === 'unknown' ? `${s.visibility} NOT IN (0,1)` : `${s.visibility}=${selection.visibility === 'public' ? 1 : 0}`}`);
    if (selection.query) {
      predicates.push(`(CAST(r.id AS CHAR)=? OR (${s.linked} AND (${s.search.map(c => `INSTR(LOWER(${c}),LOWER(?))>0`).join(' OR ')})))`);
      args.push(selection.query, ...s.search.map(() => selection.query));
    }
    const where = predicates.join(' AND '), [matching] = await reviewRows(tx, `SELECT COUNT(*) AS total FROM ${s.from} WHERE ${where}`, args);
    const matched = Number(matching.total), pages = Math.ceil(matched / 25), currentPage = Math.min(selection.page, Math.max(1, pages));
    const score = `CASE WHEN ${rated} THEN ${s.rating} ELSE NULL END`;
    const order = { newest: `${s.created} DESC,r.id DESC`, oldest: `${s.created} ASC,r.id ASC`,
      highest: `${score} IS NULL ASC,${score} DESC,r.id DESC`, lowest: `${score} IS NULL ASC,${score} ASC,r.id DESC` }[selection.sort];
    const source = await reviewRows(tx, `SELECT ${s.select},${s.linked} AS is_linked FROM ${s.from} WHERE ${where} ORDER BY ${order} LIMIT 25 OFFSET ${(currentPage - 1) * 25}`, args);
    const total = Number(stats.total), linked = Number(stats.linked), valid = Number(stats.rated), answered = Number(stats.replied), visible = Number(stats.public_count), hidden = Number(stats.private_count);
    return reviewWorkspace.parse({ actorId, merchantId, kind, checkedAt: new Date().toISOString(), canReply, selection,
      stats: { total, linked, unlinked: total - linked, rated: valid, invalidRatings: linked - valid, average: valid ? Number(stats.average) : null,
        pending: linked - answered, replied: answered, public: visible, private: hidden, unknownVisibility: linked - visible - hidden,
        distribution: Object.fromEntries([1, 2, 3, 4, 5].map(n => [String(n), Number(stats['star' + n])])) },
      matched, pages, currentPage, pageSize: 25, rows: source.map(raw => projectReview(raw, kind)), evidence: 'recorded_reviews', salesAttribution: 'not_verified' });
  });
}

export async function readReviewDetail(actorId: number, merchantId: number, kind: ReviewKind, input: unknown) {
  const { id } = reviewDetailInput.parse(input), s = reviewSource(kind);
  return withReviewRead(actorId, merchantId, async (tx, canReply) => {
    const [raw] = await reviewRows(tx, `SELECT ${s.select},${s.linked} AS is_linked FROM ${s.from} WHERE ${s.tenant}=? AND r.id=?`, [merchantId, id]);
    if (!raw) throw new ReviewWorkspaceError('missing');
    return reviewDetail.parse({ actorId, merchantId, kind, checkedAt: new Date().toISOString(), canReply, row: projectReview(raw, kind) });
  });
}
