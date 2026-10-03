import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ pool: vi.fn() }));
vi.mock('./db/connection', () => ({ getPool: mocks.pool }));
import { saveReviewReply } from './review-reply';
import { projectReview } from './review-workspace';
import { reviewReplyInput } from '../shared/review-reply';

const record = { id: 1, merchant_id: 2, record_id: 3, product_id: null, service_id: null, staff_id: null,
  customer_name: 'Customer', customer_phone: '+966500000000', rating: 5, comment: null, merchant_reply: null,
  is_public: 1, created_at: '2026-10-03 09:00:00', updated_at: '2026-10-03 09:00:00', replied_at: null,
  linked_record_id: 3, record_label: 'ORDER-1', linked_product_id: null, product_name: null, linked_service_id: null, service_name: null,
  linked_staff_id: null, staff_name: null, quality: null, professionalism: null, value: null, is_linked: 1 };
const input = { id: 1, revision: projectReview(record, 'order').revision, reply: 'Thoughtful answer' };
function connection() {
  const tx = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), destroy: vi.fn(), execute: vi.fn() };
  tx.execute.mockResolvedValueOnce([[{ id: 2, userId: 7, status: 'active' }]])
    .mockResolvedValueOnce([[{ id: 7, account_status: 'active' }]]).mockResolvedValueOnce([[]])
    .mockResolvedValueOnce([[record]]).mockResolvedValueOnce([{ affectedRows: 1 }])
    .mockResolvedValueOnce([[{ ...record, merchant_reply: input.reply, replied_at: '2026-10-03 09:01:00', updated_at: '2026-10-03 09:01:00' }]]);
  mocks.pool.mockResolvedValue({ getConnection: vi.fn().mockResolvedValue(tx) }); return tx;
}
beforeEach(() => vi.resetAllMocks());
it('treats lost commit acknowledgement as unknown and destroys the connection', async () => {
  const tx = connection(); tx.commit.mockRejectedValue(new Error('connection secret'));
  await expect(saveReviewReply(7, 2, 'order', input)).rejects.toMatchObject({ reason: 'unknown', message: 'review_reply:unknown' });
  expect(tx.destroy).toHaveBeenCalledOnce(); expect(tx.release).not.toHaveBeenCalled(); expect(tx.rollback).not.toHaveBeenCalled();
});
it('rolls back an incomplete write or inconsistent readback without exposing SQL', async () => {
  const tx = connection(); tx.execute.mockReset().mockResolvedValueOnce([[{ id: 2, userId: 7, status: 'active' }]])
    .mockResolvedValueOnce([[{ id: 7, account_status: 'active' }]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[record]])
    .mockRejectedValueOnce(new Error('SQL password private'));
  await expect(saveReviewReply(7, 2, 'order', input)).rejects.toMatchObject({ message: 'review_reply:unavailable' });
  expect(tx.rollback).toHaveBeenCalledOnce(); expect(tx.commit).not.toHaveBeenCalled();
});
it.each([{ id: 0 }, { id: 1.2 }, { reply: '' }, { reply: ' \n\t ' }, { reply: 'x'.repeat(1001) }, { merchantId: 4 }, { sendsMessage: true }, { revision: '' }])('validates bounded text and strict fields %j', extra => {
  expect(reviewReplyInput.safeParse({ ...input, ...extra }).success).toBe(false);
});
it('permits exactly 1000 trimmed characters', () => { expect(reviewReplyInput.parse({ ...input, reply: ' '+ 'x'.repeat(1000) + ' ' }).reply.length).toBe(1000); });
it.each([0, 1.5, 2147483648])('rejects invalid direct authority before connecting %s', async actor => {
  await expect(saveReviewReply(actor, 2, 'order', input)).rejects.toMatchObject({ reason: 'forbidden' }); expect(mocks.pool).not.toHaveBeenCalled();
});
