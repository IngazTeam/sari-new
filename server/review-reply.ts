import type { PoolConnection } from 'mysql2/promise';
import { getPool } from './db/connection';
import { ALL_ROLES, hasPermission, type MerchantRole } from './_core/permissions';
import { projectReview, reviewRows, reviewSource } from './review-workspace';
import type { ReviewKind } from '../shared/review-workspace';
import { reviewReplyInput, reviewReplyResult } from '../shared/review-reply';

export class ReviewReplyError extends Error {
  constructor(readonly reason: 'forbidden' | 'missing' | 'reference' | 'stale' | 'unavailable' | 'unknown') { super('review_reply:' + reason); }
}
/** A reply is a local field update only. An identical retry is a no-op; no transport is called. */
export async function saveReviewReply(actorId: number, merchantId: number, kind: ReviewKind, input: unknown) {
  const value = reviewReplyInput.parse(input), source = reviewSource(kind);
  let tx: PoolConnection | undefined, committing = false, reusable = true;
  try {
    if (![actorId, merchantId].every(n => Number.isInteger(n) && n > 0 && n <= 2147483647)) throw new ReviewReplyError('forbidden');
    const pool = await getPool(); if (!pool) throw new ReviewReplyError('unavailable');
    tx = await pool.getConnection(); await tx.beginTransaction();
    const [merchant] = await reviewRows(tx, 'SELECT id,userId,status FROM merchants WHERE id=? FOR UPDATE', [merchantId]);
    const users = await reviewRows(tx, 'SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE', [actorId, merchant?.userId || actorId]);
    const members = await reviewRows(tx, 'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE', [merchantId, actorId]);
    const role = members.length === 1 && members[0].is_active === 1 ? members[0].role : !members.length && merchant?.userId === actorId ? 'owner' : null;
    if (merchant?.status !== 'active' || users.find(u => u.id === actorId)?.account_status !== 'active'
      || users.find(u => u.id === merchant.userId)?.account_status !== 'active' || !ALL_ROLES.includes(role)
      || !hasPermission(role as MerchantRole, 'conversations.reply')) throw new ReviewReplyError('forbidden');
    // Lock both the review and every joined reference until commit. Legacy FK links alone do not establish scope.
    const select = `SELECT ${source.select},${source.linked} AS is_linked FROM ${source.from} WHERE ${source.tenant}=? AND r.id=? FOR UPDATE`;
    const [raw] = await reviewRows(tx, select, [merchantId, value.id]);
    if (!raw) throw new ReviewReplyError('missing');
    let row = projectReview(raw, kind);
    if (row.integrity !== 'linked') throw new ReviewReplyError('reference');
    // Equal content means the desired state is already present, not proof of which request wrote it.
    const effect = row.merchantReply === value.reply ? 'already_current' : 'saved';
    if (effect === 'saved') {
      if (row.revision !== value.revision) throw new ReviewReplyError('stale');
      const table = kind === 'order' ? 'customer_reviews' : 'booking_reviews';
      const repliedAt = kind === 'order' ? 'repliedAt' : 'replied_at', updatedAt = kind === 'order' ? 'updatedAt' : 'updated_at';
      const [saved] = await tx.execute<any>(`UPDATE ${table} r SET ${source.reply}=?,${repliedAt}=UTC_TIMESTAMP(),${updatedAt}=UTC_TIMESTAMP()
        WHERE ${source.tenant}=? AND r.id=?`, [value.reply, merchantId, value.id]);
      if (saved.affectedRows !== 1) throw new ReviewReplyError('unavailable');
      const [after] = await reviewRows(tx, select, [merchantId, value.id]); row = projectReview(after, kind);
      if (row.integrity !== 'linked' || row.merchantReply !== value.reply) throw new ReviewReplyError('unavailable');
    }
    const result = reviewReplyResult.parse({ actorId, merchantId, kind, checkedAt: new Date().toISOString(), canReply: true, row, effect, sendsMessage: false });
    committing = true; await tx.commit(); return result;
  } catch (e) {
    if (committing) reusable = false; else if (tx) try { await tx.rollback(); } catch { reusable = false; }
    if (committing) throw new ReviewReplyError('unknown'); if (e instanceof ReviewReplyError) throw e; throw new ReviewReplyError('unavailable');
  } finally { if (tx) { if (reusable) tx.release(); else tx.destroy(); } }
}
