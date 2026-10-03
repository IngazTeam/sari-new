import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ pool: vi.fn() }));
vi.mock('./db/connection', () => ({ getPool: mocks.pool }));
import { projectReview, readReviewWorkspace, reviewSource, withReviewRead } from './review-workspace';
import { reviewSelection, reviewRow, reviewStats } from '../shared/review-workspace';

const raw = (extra: object = {}) => ({ id: 1, merchant_id: 2, record_id: 3, product_id: null, service_id: null, staff_id: null,
  customer_name: '<script>literal</script>', customer_phone: '+966500000000', rating: 5, comment: 'FULL '.repeat(500), merchant_reply: 'Saved',
  is_public: 1, created_at: '2026-10-03 09:00:00', updated_at: '2026-10-03 09:01:00', replied_at: '2026-10-03 09:01:00',
  linked_record_id: 3, record_label: 'ORDER-1', linked_product_id: null, product_name: null, linked_service_id: null, service_name: null,
  linked_staff_id: null, staff_name: null, quality: null, professionalism: null, value: null, is_linked: 1, ...extra });
it('preserves full literal content and explicit UTC without claiming delivery or verified purchase', () => {
  const r = projectReview(raw(), 'order');
  expect(r).toMatchObject({ integrity: 'linked', customerName: '<script>literal</script>', replyState: 'replied', createdAt: '2026-10-03T09:00:00.000Z',
    replyDelivery: 'not_verified', purchaseVerification: 'not_verified', dimensions: null }); expect(r.comment?.length).toBe(2500);
});
it('redacts all contact, content, scores and references for a contradictory relationship', () => {
  const r = projectReview(raw({ is_linked: 0, record_label: 'FOREIGN_ORDER', quality: 4 }), 'booking');
  expect(r).toMatchObject({ integrity: 'unlinked', record: null, rating: null, replyState: 'unknown', dimensions: null, issues: ['reference'] });
  expect(JSON.stringify(r)).not.toMatch(/script|FOREIGN_ORDER|966500|FULL|Saved/);
  expect(reviewRow.safeParse({ ...r, customerPhone: 'leak' }).success).toBe(false);
});
it('keeps malformed metadata visible without converting it into a valid score', () => {
  const r = projectReview(raw({ rating: 7, is_public: 3, quality: 0, professionalism: 3.5, value: 4, created_at: 'invalid', merchant_reply: '\n  \t', replied_at: null }), 'booking');
  expect(r).toMatchObject({ rating: null, isPublic: null, createdAt: null, replyState: 'pending', dimensions: { quality: null, professionalism: null, value: 4 } });
  expect(r.issues).toEqual(expect.arrayContaining(['rating', 'visibility', 'quality', 'professionalism', 'createdAt']));
});
it('revision changes for invalid values and relationship changes as well as reply edits', () => {
  const r = projectReview(raw({ rating: 9 }), 'order');
  for (const extra of [{ rating: 10 }, { merchant_reply: 'Changed' }, { is_linked: 0 }, { record_label: 'Changed' }])
    expect(projectReview(raw({ rating: 9, ...extra }), 'order').revision).not.toBe(r.revision);
});
it.each([{ merchantId: 9 }, { actorId: 2 }, { rating: 0 }, { rating: 3.5 }, { page: 0 }, { page: 1000001 }, { query: 'a'.repeat(101) }, { sort: 'id;DROP' }])('rejects invalid selections %j', input => {
  expect(reviewSelection.safeParse(input).success).toBe(false);
});
it('does not accept zero as an empty review average or inconsistent totals', () => {
  const empty = { total: 0, linked: 0, unlinked: 0, rated: 0, invalidRatings: 0, average: null, pending: 0, replied: 0, public: 0, private: 0, unknownVisibility: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  expect(reviewStats.safeParse(empty).success).toBe(true);
  for (const extra of [{ average: 0 }, { total: 1 }, { pending: 1 }, { distribution: { ...empty.distribution, 5: 1 } }]) expect(reviewStats.safeParse({ ...empty, ...extra }).success).toBe(false);
});
it('rejects unknown source identifiers', () => { expect(() => reviewSource('user-controlled' as any)).toThrow(); });

function transaction() {
  const tx = { query: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), destroy: vi.fn(), execute: vi.fn() };
  tx.execute.mockResolvedValueOnce([[{ id: 2, userId: 7, status: 'active' }]])
    .mockResolvedValueOnce([[{ id: 7, account_status: 'active' }]]).mockResolvedValueOnce([[]]);
  mocks.pool.mockResolvedValue({ getConnection: vi.fn().mockResolvedValue(tx) }); return tx;
}
beforeEach(() => vi.resetAllMocks());
it('releases a healthy snapshot and destroys a connection after uncertain commit', async () => {
  const good = transaction(); expect(await withReviewRead(7, 2, async (_, canReply) => canReply)).toBe(true); expect(good.commit).toHaveBeenCalledOnce(); expect(good.release).toHaveBeenCalledOnce();
  const uncertain = transaction(); uncertain.commit.mockRejectedValue(new Error('connection secret'));
  await expect(withReviewRead(7, 2, async () => 1)).rejects.toMatchObject({ reason: 'unavailable' }); expect(uncertain.destroy).toHaveBeenCalledOnce(); expect(uncertain.release).not.toHaveBeenCalled();
});
it('rolls back query failures without returning successful zero statistics', async () => {
  const tx = transaction(); tx.execute.mockRejectedValue(new Error('SQL private'));
  await expect(readReviewWorkspace(7, 2, 'order', {})).rejects.toMatchObject({ message: 'review_workspace:unavailable' }); expect(tx.rollback).toHaveBeenCalledOnce();
  tx.rollback.mockRejectedValue(new Error('broken')); await expect(withReviewRead(7, 2, async () => 1)).rejects.toThrow(); expect(tx.destroy).toHaveBeenCalled();
});
it.each([0, -1, 1.5, 2147483648, NaN])('rejects invalid direct scope %s before connecting', async actor => {
  await expect(withReviewRead(actor, 2, async () => 1)).rejects.toMatchObject({ reason: 'forbidden' }); expect(mocks.pool).not.toHaveBeenCalled();
});
