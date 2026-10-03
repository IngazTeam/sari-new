import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { createReviewFixture, reviewQuery as q } from './tests/helpers/review-fixture';
import { readReviewWorkspace } from './review-workspace';
import { readOverviewWorkspace } from './overview-workspace';
import { readPerformanceWorkspace } from './performance-workspace';

describe.skipIf(!process.env.DATABASE_URL)('review aggregates share the scoped source in MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  const now = new Date('2026-10-03T12:00:00Z');
  beforeEach(async () => { owner = await createDisposableMerchant('review-metric'); other = await createDisposableMerchant('review-metric-other'); });
  afterEach(() => cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))); afterAll(closeDb);
  const create = async (rating: number, merchant = owner.merchantId, date = '2026-10-03 10:00:00') => {
    const f = await createReviewFixture('order', merchant, 'Synthetic aggregate', rating);
    await q('UPDATE customer_reviews SET createdAt=? WHERE id=?', [date, f.id]); return f;
  };
  const overview = () => readOverviewWorkspace(owner.merchantId, { period: '7d' }, now);
  const performance = () => readPerformanceWorkspace(owner.merchantId, { startDate: '2026-10-03', endDate: '2026-10-03' }, now);
  it('excludes foreign/missing products and foreign orders from both metrics without losing their count', async () => {
    const valid = await create(5), optional = await create(1), bad = await create(9), foreign = await create(5, other.merchantId);
    const foreignProduct = await create(5), missingProduct = await create(5), foreignOrder = await create(4);
    await q('UPDATE customer_reviews SET productId=NULL WHERE id=?', [optional.id]);
    await q('UPDATE customer_reviews SET productId=? WHERE id=?', [foreign.productId, foreignProduct.id]);
    await q('UPDATE customer_reviews SET productId=2147483647 WHERE id=?', [missingProduct.id]);
    await q('UPDATE customer_reviews SET orderId=? WHERE id=?', [foreign.recordId, foreignOrder.id]);
    const w = await readReviewWorkspace(owner.userId, owner.merchantId, 'order', {});
    const o = await overview(), p = await performance();
    expect(w.stats).toMatchObject({ linked: 3, unlinked: 3, rated: 2, invalidRatings: 1, average: 3 });
    expect(o.reviews).toMatchObject({ total: 3, unlinked: 3, valid: 2, invalid: 1, average: 3 });
    expect(p.current.reviews).toMatchObject({ total: 3, unlinked: 3, valid: 2, invalid: 1, average: 3, positive: 1, positiveShare: 50 });
    expect(Object.values(w.stats.distribution)).toEqual(o.reviews.distribution.slice().reverse().map(r => r.count));
    expect(o.salesProficiency).toBeNull(); expect(p.unmeasured.salesProficiency).toBeNull();
    await q('UPDATE customer_reviews SET productId=? WHERE id=?', [valid.productId, foreignProduct.id]);
    expect((await overview()).reviews).toMatchObject({ total: 4, unlinked: 2, valid: 3, average: 11 / 3 });
    expect((await performance()).current.reviews.average).toBe(11 / 3);
    expect(bad.id).toBeGreaterThan(0);
  });
  it('keeps null averages for all-conflicted data and bounds conflict counts by the review date', async () => {
    const foreign = await create(5, other.merchantId);
    for (const date of ['2026-10-03 10:00:00', '2026-10-02 18:00:00', '2026-01-01 00:00:00', '2026-10-03 12:00:01']) {
      const f = await create(5, owner.merchantId, date);
      await q('UPDATE customer_reviews SET productId=? WHERE id=?', [foreign.productId, f.id]);
    }
    const o = await overview(), p = await performance();
    expect(o.reviews).toMatchObject({ total: 0, unlinked: 2, valid: 0, invalid: 0, average: null });
    for (const period of [p.current, p.previous]) expect(period.reviews).toMatchObject({ total: 0, unlinked: 1, valid: 0, average: null, positiveShare: null });
  });
});
