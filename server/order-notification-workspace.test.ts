import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ pool: vi.fn() }));
vi.mock('./db/connection', () => ({ getPool: m.pool }));
import { projectOrderNotice, projectNoticeTemplate, withOrderNoticeRead, readOrderNoticeWorkspace } from './order-notification-workspace';
import { orderNoticeSelection, orderNoticeRow, orderNoticeStats } from '../shared/order-notification-workspace';
const raw = (patch: object = {}) => ({ id: 1, merchant_id: 2, order_id: 3, linked_order_id: 3, order_number: 'ORDER', is_linked: 1,
  event_key: 'a'.repeat(64), status: 'paid', source_state: 'sent', customer_phone: '+966500000000', message: '<b>Literal</b>'.repeat(1000),
  attempts: 1, created_at: '2026-10-01 10:00:00', updated_at: '2026-10-01 10:00:01', available_at: '2026-10-01 10:00:00',
  claimed_at: null, sent_at: null, reviewed_at: null, reviewed_by_user_id: null,
  receipt_id: null, receipt_provider: null, receipt_message_id: null, receipt_at: null, evidence: 'unverified', ...patch });
it('keeps full literal message, UTC and unverified evidence despite the sent flag', () => {
  const r = projectOrderNotice(raw(),7,2); expect(r).toMatchObject({ state: 'sent', evidence: 'unverified', salesVerification: 'not_verified', createdAt: '2026-10-01T10:00:00.000Z', issues: ['missing_receipt'] }); expect(r.message).toHaveLength(14000);
});
it('redacts foreign order content and never projects its provider evidence', () => {
  const r = projectOrderNotice(raw({ is_linked: 0, evidence: 'read', receipt_id: 4, receipt_message_id: 'PRIVATE', receipt_provider: 'green_api', reviewed_by_user_id: 80 }),7,2);
  expect(r).toMatchObject({ integrity: 'unlinked', evidence: 'unverified', order: null, customerPhone: null, message: null, providerMessageId: null, reviewedByUserId: null });
  expect(JSON.stringify(r)).not.toMatch(/Literal|966500|PRIVATE|ORDER/); expect(orderNoticeRow.safeParse({ ...r, message: 'leak' }).success).toBe(false);
});
it('keeps malformed legacy metadata explicit', () => {
  const r = projectOrderNotice(raw({ status: 'confirmed', source_state: 'unknown', attempts: -1, event_key: null, created_at: 'bad', receipt_id: 4 }),7,2);
  expect(r).toMatchObject({ status: null, attempts: null, hasEvent: false, createdAt: null, issues: expect.arrayContaining(['status','state','attempts','event','timestamp','receipt']) });
});
it('ties revisions to both actor and selected tenant and raw source changes', () => {
  const r = projectOrderNotice(raw(),7,2); for (const [actor,merchant,patch] of [[8,2,{}],[7,3,{}],[7,2,{ attempts: 2 }]] as const) expect(projectOrderNotice(raw(patch),actor,merchant).revision).not.toBe(r.revision);
});
it('uses suggestions only for absent templates and preserves invalid stored values', () => {
  expect(projectNoticeTemplate(undefined,'paid',7,2)).toMatchObject({ stored: false, id: null, enabled: false, issues: [], canonicalStatus: 'paid' });
  expect(projectNoticeTemplate({ id: 1, template: '', enabled: 3, updated_at: null },'confirmed',7,2)).toMatchObject({ stored: true, template: '', enabled: null, canonicalStatus: null, issues: ['status','template','enabled','updatedAt'] });
});
it.each([{ merchantId: 1 },{ actorId: 7 },{ query: 'x'.repeat(101) },{ status: 'confirmed' },{ state: 'delivered' },{ evidence: 'sent' },{ page: 0 },{ page: 1000001 },{ sort: 'id;DROP' }])('rejects invalid selection %j', selection => expect(orderNoticeSelection.safeParse(selection).success).toBe(false));
it('rejects unsupported proof and inconsistent totals at the client boundary', () => {
  const r = projectOrderNotice(raw(),7,2);
  expect(orderNoticeRow.safeParse({ ...r,evidence: 'delivered' }).success).toBe(false);
  expect(orderNoticeRow.safeParse({ ...r,evidence: 'read', provider: 'mock', providerMessageId: 'm',evidenceAt:'2026-10-01T10:00:00.000Z' }).success).toBe(false);
  const stats = { total: 0, linked: 0, unlinked: 0, states: { pending:0,processing:0,sent:0,failed:0,manual_review:0,suppressed:0,unknown:0 }, evidence: { unverified:0,accepted:0,delivered:0,read:0,failed:0,simulated:0 } };
  expect(orderNoticeStats.safeParse(stats).success).toBe(true); expect(orderNoticeStats.safeParse({ ...stats,total:1 }).success).toBe(false);
});
const transaction = () => {
  const tx = { query:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),destroy:vi.fn(),execute:vi.fn() };
  tx.execute.mockResolvedValueOnce([[{ id:2,userId:7,status:'active' }]]).mockResolvedValueOnce([[{ id:7,account_status:'active' }]]).mockResolvedValueOnce([[]]);
  m.pool.mockResolvedValue({ getConnection:vi.fn().mockResolvedValue(tx) }); return tx;
};
beforeEach(() => vi.resetAllMocks());
it('uses one repeatable snapshot and releases or destroys its connection correctly', async () => {
  const good = transaction(); expect(await withOrderNoticeRead(7,2,async (_,canManage) => canManage)).toBe(true); expect(good.query).toHaveBeenCalledWith('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); expect(good.release).toHaveBeenCalledOnce();
  const bad = transaction(); bad.commit.mockRejectedValue(new Error('private')); await expect(withOrderNoticeRead(7,2,async () => 1)).rejects.toMatchObject({ reason:'unavailable' }); expect(bad.destroy).toHaveBeenCalledOnce(); expect(bad.release).not.toHaveBeenCalled();
});
it('does not return empty success on a failed query or leak a database error', async () => {
  const tx = transaction(); tx.execute.mockRejectedValue(new Error('private SQL')); await expect(readOrderNoticeWorkspace(7,2,{})).rejects.toThrow('order_notice:unavailable'); expect(tx.rollback).toHaveBeenCalledOnce();
});
it.each([0,-1,1.5,2147483648,NaN])('rejects invalid direct identity %s', async actor => {
  await expect(withOrderNoticeRead(actor,2,async () => 1)).rejects.toMatchObject({ reason:'forbidden' }); expect(m.pool).not.toHaveBeenCalled();
});
