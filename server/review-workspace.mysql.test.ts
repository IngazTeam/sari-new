import { beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest';
import { closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { createReviewFixture, reviewQuery as q } from './tests/helpers/review-fixture';
import { readReviewWorkspace, readReviewDetail } from './review-workspace';

for (const kind of ['order', 'booking'] as const) describe.skipIf(!process.env.DATABASE_URL)(`${kind} review complete selected-tenant source`, () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  const table = kind === 'order' ? 'customer_reviews' : 'booking_reviews';
  const fields = kind === 'order' ? { record: 'orderId', rating: 'rating', reply: 'merchantReply', public: 'isPublic', date: 'createdAt' }
    : { record: 'booking_id', rating: 'overall_rating', reply: 'merchant_reply', public: 'is_public', date: 'created_at' };
  const read = (input: object = {}, actor = owner.userId, merchant = owner.merchantId) => readReviewWorkspace(actor, merchant, kind, input);
  const create = (name = 'Synthetic customer', rating = 5, merchant = owner.merchantId) => createReviewFixture(kind, merchant, name, rating);
  beforeEach(async () => { owner = await createDisposableMerchant('reviews-source'); other = await createDisposableMerchant('reviews-other'); });
  afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId])); afterAll(closeDb);
  it('covers 105 reviews through five stable pages with full unfiltered statistics', async () => {
    const first = await create('oldest_%_target', 1);
    for (let i = 0; i < 104; i++) await create('Review ' + i, 5);
    await create('FOREIGN_PRIVATE', 4, other.merchantId);
    const pages = []; for (let page = 1; page <= 5; page++) pages.push(await read({ page }));
    expect(pages[0]).toMatchObject({ matched: 105, pages: 5, stats: { total: 105, linked: 105, rated: 105, distribution: { 1: 1, 5: 104 } } });
    expect(new Set(pages.flatMap(p => p.rows.map(r => r.id))).size).toBe(105); expect(pages[4].rows).toHaveLength(5); expect(pages[4].rows[4].id).toBe(first.id);
    expect((await read({ page: 900 })).currentPage).toBe(5); expect(JSON.stringify(pages)).not.toContain('FOREIGN_PRIVATE');
    const one = await read({ rating: 1 }); expect(one.matched).toBe(1); expect(one.stats.total).toBe(105);
    expect((await read({ query: '%' })).rows.map(r => r.id)).toEqual([first.id]);
  });
  it('filters the exact star, full reply/comment and literal search, independent of page statistics', async () => {
    const a = await create('Alpha', 2), b = await create('Beta', 3), c = await create('Gamma', 5);
    await q(`UPDATE ${table} SET ${fields.reply}='Reply_%_needle',${fields.public}=0 WHERE id=?`, [b.id]);
    await q(`UPDATE ${table} SET ${fields.reply}=' \n\t',comment='Comment needle',${fields.public}=3 WHERE id=?`, [a.id]);
    expect((await read({ rating: 3 })).rows.map(r => r.id)).toEqual([b.id]);
    expect((await read({ query: 'Reply_%_', reply: 'replied', visibility: 'private' })).rows.map(r => r.id)).toEqual([b.id]);
    expect((await read({ query: 'Comment needle', reply: 'pending', visibility: 'unknown' })).rows.map(r => r.id)).toEqual([a.id]);
    expect((await read({ query: String(c.id) })).rows.map(r => r.id)).toEqual([c.id]);
    expect((await read({ sort: 'highest' })).rows.map(r => r.id)).toEqual([c.id, b.id, a.id]);
    expect((await read({ sort: 'lowest' })).rows.map(r => r.id)).toEqual([a.id, b.id, c.id]);
    expect((await read({ sort: 'oldest' })).rows.map(r => r.id)).toEqual([a.id, b.id, c.id]);
  });
  it('excludes contradictory references from statistics, content, search and detailed relationships', async () => {
    const local = await create('CROSS_LINK_PRIVATE', 1), foreign = await create('FOREIGN_PRIVATE', 5, other.merchantId);
    await q(`UPDATE ${table} SET ${fields.record}=? WHERE id=?`, [foreign.recordId, local.id]);
    const w = await read(); expect(w).toMatchObject({ stats: { total: 1, unlinked: 1, rated: 0, average: null, replied: 0, pending: 0 } });
    expect(w.rows[0]).toMatchObject({ integrity: 'unlinked', customerName: null, record: null, rating: null });
    expect(JSON.stringify(w)).not.toContain('CROSS_LINK_PRIVATE'); expect((await read({ query: 'CROSS_LINK_PRIVATE' })).matched).toBe(0);
    expect((await read({ rating: 1 })).matched).toBe(0); expect((await read({ integrity: 'unlinked' })).matched).toBe(1);
    const detail = await readReviewDetail(owner.userId, owner.merchantId, kind, { id: local.id }); expect(detail.row.integrity).toBe('unlinked');
    await expect(readReviewDetail(owner.userId, owner.merchantId, kind, { id: foreign.id })).rejects.toMatchObject({ reason: 'missing' });
  });
  it('requires scoped optional product or matching booking service and staff references', async () => {
    const local = await create(), foreign = await create('Foreign', 5, other.merchantId);
    if (kind === 'order') {
      await q('UPDATE customer_reviews SET productId=? WHERE id=?', [foreign.productId, local.id]); expect((await read()).stats.unlinked).toBe(1);
      await q('UPDATE customer_reviews SET productId=2147483647 WHERE id=?', [local.id]); expect((await read()).stats.unlinked).toBe(1);
      await q('UPDATE customer_reviews SET productId=NULL WHERE id=?', [local.id]); expect((await read()).stats.linked).toBe(1);
    } else {
      await q('UPDATE booking_reviews SET service_id=? WHERE id=?', [foreign.serviceId, local.id]); expect((await read()).stats.unlinked).toBe(1);
      await q('UPDATE booking_reviews SET service_id=?,staff_id=? WHERE id=?', [local.serviceId, foreign.staffId, local.id]); expect((await read()).stats.unlinked).toBe(1);
      await q('UPDATE booking_reviews SET staff_id=NULL WHERE id=?', [local.id]); expect((await read()).stats.unlinked).toBe(1);
      await q('UPDATE booking_reviews SET staff_id=? WHERE id=?', [local.staffId, local.id]); expect((await read()).stats.linked).toBe(1);
    }
  });
  it('retains invalid scores and unknown visibility without skewing the mean or hiding rows', async () => {
    await create('Valid', 4); const bad = await create('Invalid', 8);
    await q(`UPDATE ${table} SET ${fields.public}=7 WHERE id=?`, [bad.id]);
    const w = await read(); expect(w).toMatchObject({ stats: { total: 2, rated: 1, invalidRatings: 1, average: 4, unknownVisibility: 1 } });
    const row = w.rows.find(r => r.id === bad.id)!; expect(row.rating).toBeNull(); expect(row.issues).toEqual(expect.arrayContaining(['rating', 'visibility']));
    expect((await read({ sort: 'lowest' })).rows.at(-1)?.id).toBe(bad.id);
  });
  it('returns absent mean for empty or unrated sets and clamps empty pages', async () => {
    expect(await read({ page: 50 })).toMatchObject({ currentPage: 1, pages: 0, rows: [], stats: { average: null, total: 0 } });
    await create('Invalid', 0); expect((await read()).stats.average).toBeNull();
  });
  it('retains full content, named records and dimensions without claiming verified sales or delivery', async () => {
    const f = await create(); const text = '<b>literal</b> '.repeat(1000);
    await q(`UPDATE ${table} SET comment=?,${fields.reply}='Saved only' WHERE id=?`, [text, f.id]);
    const d = await readReviewDetail(owner.userId, owner.merchantId, kind, { id: f.id });
    expect(d.row.comment).toBe(text); expect(d.row).toMatchObject({ replyState: 'replied', replyDelivery: 'not_verified', purchaseVerification: 'not_verified' });
    if (kind === 'booking') expect(d.row).toMatchObject({ service: { id: f.serviceId, name: 'Synthetic service' }, staff: { id: f.staffId }, dimensions: { quality: 4, professionalism: 3, value: 2 } });
    else expect(d.row).toMatchObject({ record: { id: f.recordId, label: 'TEST-ORDER' }, product: { id: f.productId, name: 'Synthetic product' } });
  });
  it('uses current membership and separates reply permission from reading', async () => {
    await expect(read({}, owner.userId, other.merchantId)).rejects.toMatchObject({ reason: 'forbidden' });
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)", [other.merchantId, owner.userId]);
    expect((await read({}, owner.userId, other.merchantId)).canReply).toBe(false);
    await q("UPDATE merchant_members SET role='sales_supervisor' WHERE merchant_id=? AND user_id=?", [other.merchantId, owner.userId]);
    expect((await read({}, owner.userId, other.merchantId)).canReply).toBe(true);
    await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [other.userId]);
    await expect(read({}, owner.userId, other.merchantId)).rejects.toMatchObject({ reason: 'forbidden' });
    await q("UPDATE users SET account_status='active' WHERE id=?", [other.userId]);
    await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [other.merchantId, owner.userId]);
    await expect(read({}, owner.userId, other.merchantId)).rejects.toMatchObject({ reason: 'forbidden' });
  });
  it('honors owner revocation, pending/suspended merchants and deleted actor accounts', async () => {
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)", [owner.merchantId, owner.userId]);
    await expect(read()).rejects.toMatchObject({ reason: 'forbidden' });
    await q('DELETE FROM merchant_members WHERE merchant_id=? AND user_id=?', [owner.merchantId, owner.userId]);
    await q("UPDATE merchants SET status='pending' WHERE id=?", [owner.merchantId]); expect((await read()).canReply).toBe(false);
    await q("UPDATE merchants SET status='suspended' WHERE id=?", [owner.merchantId]); await expect(read()).rejects.toMatchObject({ reason: 'forbidden' });
    await q("UPDATE merchants SET status='active' WHERE id=?", [owner.merchantId]);
    await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [owner.userId]); await expect(read()).rejects.toMatchObject({ reason: 'forbidden' });
  });
});
