import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { databaseTimeEpoch } from '../db/time';
import { policyArtifactDigest as digest } from '../ai/learning-policy-evaluation-bundle';
import { authorizeCheckoutReviewer, checkoutEvidenceTransaction, withVerifiedCheckoutEvidence } from './salla-checkout-evidence';
import { sallaCheckoutAuditInput, sallaCheckoutAuditItem, sallaCheckoutAuditListInput, sallaCheckoutAuditPage } from '../../shared/salla-checkout-audit';

const id = z.number().int().positive().max(2147483647);
const request = sallaCheckoutAuditInput.extend({ merchantId: id, reviewerUserId: id }).strict();
const snapshot = z.object({ version: z.literal('salla-checkout-audit.v1'), request, item: sallaCheckoutAuditItem.omit({ id: true }) }).strict();
const unavailable = (): never => { throw Error('Salla checkout audit unavailable'); };
const iso = (value: string | Date) => new Date(databaseTimeEpoch(value)).toISOString();
export async function assertSallaCheckoutAuditSchema() {
  await assertRuntimeSchema('Salla checkout reviews', [{ table: 'salla_checkout_reviews',
    columns: ['merchant_id', 'reviewer_user_id', 'review_id', 'request_digest', 'snapshot', 'snapshot_digest', 'created_at'],
    uniqueIndexes: [{ name: 'salla_checkout_review_once', columns: ['merchant_id', 'review_id'] }],
  }], { cacheSuccess: false });
}
function readAudit(row: any) {
  const raw = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
  const value = snapshot.parse(raw), r = value.request, item = value.item, evidence = item.evidence;
  if (digest(raw) !== row.snapshot_digest || digest(value) !== row.snapshot_digest || digest(r) !== row.request_digest
    || r.merchantId !== row.merchant_id || item.merchantId !== row.merchant_id
    || r.reviewerUserId !== row.reviewer_user_id || item.reviewerUserId !== row.reviewer_user_id
    || r.reviewId !== row.review_id || item.reviewId !== row.review_id || item.savedAt !== iso(row.created_at)
    || r.evidence.requestId !== evidence.requestId || r.evidence.orderId !== evidence.order.orderId
    || r.evidence.transactionId !== (evidence.transaction?.transactionId ?? undefined)) return unavailable();
  return value;
}
async function prior(c: PoolConnection, r: z.infer<typeof request>) {
  const [rows] = await c.execute<any[]>('SELECT * FROM salla_checkout_reviews WHERE merchant_id=? AND review_id=? FOR SHARE', [r.merchantId, r.reviewId]);
  if (!rows.length) return null;
  const value = readAudit(rows[0]);
  if (digest(value.request) !== digest(r)) return unavailable();
  return sallaCheckoutAuditItem.parse({ ...value.item, id: rows[0].id });
}
/** Idempotent save of a new provider reading; never accepts evidence from the
 * browser. Replay reads the original observation even if its source disappeared. */
export async function saveSallaCheckoutAudit(merchant: number, reviewer: number, raw: z.infer<typeof sallaCheckoutAuditInput>) {
  try {
    const r = request.parse({ ...sallaCheckoutAuditInput.parse(raw), merchantId: id.parse(merchant), reviewerUserId: id.parse(reviewer) });
    await assertSallaCheckoutAuditSchema();
    const existing = await checkoutEvidenceTransaction(async c => { await authorizeCheckoutReviewer(c, merchant, reviewer); return prior(c, r); });
    if (existing) return existing;
    return await withVerifiedCheckoutEvidence(merchant, reviewer, r.evidence, async (c, evidence) => {
      const [[clock]] = await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
      const value = snapshot.parse({ version: 'salla-checkout-audit.v1', request: r,
        item: { merchantId: merchant, reviewerUserId: reviewer, reviewId: r.reviewId, savedAt: iso(clock.now), evidence } });
      // Concurrent identical requests may both perform safe GETs. The unique key
      // chooses one observation; a competing request cannot overwrite it.
      await c.execute(`INSERT INTO salla_checkout_reviews (merchant_id,reviewer_user_id,review_id,request_digest,snapshot,snapshot_digest,created_at)
        VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id`,
        [merchant, reviewer, r.reviewId, digest(r), JSON.stringify(value), digest(value), value.item.savedAt.slice(0, 23).replace('T', ' ')]);
      const saved = await prior(c, r); if (!saved) return unavailable(); return saved;
    });
  } catch { return unavailable(); }
}
export async function listSallaCheckoutAudits(merchant: number, reviewer: number, raw: z.infer<typeof sallaCheckoutAuditListInput>) {
  try {
    id.parse(merchant); id.parse(reviewer); const input = sallaCheckoutAuditListInput.parse(raw);
    await assertSallaCheckoutAuditSchema();
    return await checkoutEvidenceTransaction(async c => {
      await authorizeCheckoutReviewer(c, merchant, reviewer);
      const [rows] = await c.execute<any[]>(`SELECT * FROM salla_checkout_reviews WHERE merchant_id=?${input.beforeId ? ' AND id<?' : ''} ORDER BY id DESC LIMIT 21 FOR SHARE`, [merchant, ...(input.beforeId ? [input.beforeId] : [])]);
      const items = rows.slice(0, 20).map(row => sallaCheckoutAuditItem.parse({ ...readAudit(row).item, id: row.id }));
      return sallaCheckoutAuditPage.parse({ merchantId: merchant, items, nextCursor: rows.length > 20 ? items.at(-1)!.id : null });
    });
  } catch { return unavailable(); }
}
