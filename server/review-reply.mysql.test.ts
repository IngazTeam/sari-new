import { beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest';
import { closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { createReviewFixture, reviewQuery as q } from './tests/helpers/review-fixture';
import { readReviewDetail } from './review-workspace';
import { saveReviewReply } from './review-reply';

for (const kind of ['order', 'booking'] as const) describe.skipIf(!process.env.DATABASE_URL)(`${kind} review reply atomic writes`, () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, fixture: Awaited<ReturnType<typeof createReviewFixture>>;
  const read = () => readReviewDetail(owner.userId, owner.merchantId, kind, { id: fixture.id });
  const save = (revision: string, reply = 'A thoughtful response', actor = owner.userId, merchant = owner.merchantId, id = fixture.id) => saveReviewReply(actor, merchant, kind, { id, revision, reply });
  beforeEach(async () => { owner = await createDisposableMerchant('reviews-reply'); other = await createDisposableMerchant('reviews-other'); fixture = await createReviewFixture(kind, owner.merchantId); });
  afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId])); afterAll(closeDb);
  it('saves the reply and UTC timestamp, then makes an identical retry a no-op', async () => {
    const prior = await read(), saved = await save(prior.row.revision, '  First reply  ');
    expect(saved).toMatchObject({ effect: 'saved', sendsMessage: false, row: { merchantReply: 'First reply', replyState: 'replied', replyDelivery: 'not_verified' } });
    expect(saved.row.repliedAt).toMatch(/^\d{4}-/); expect(saved.row.revision).not.toBe(prior.row.revision);
    const again = await save(prior.row.revision, 'First reply'); expect(again.effect).toBe('already_current'); expect(again.row).toEqual(saved.row);
    expect((await read()).row).toEqual(saved.row);
  });
  it('rejects stale overwrites but permits an explicit edit of the current revision', async () => {
    const prior = await read(), first = await save(prior.row.revision, 'First');
    await expect(save(prior.row.revision, 'Another')).rejects.toMatchObject({ reason: 'stale' });
    expect((await read()).row.merchantReply).toBe('First');
    expect((await save(first.row.revision, 'Updated')).row.merchantReply).toBe('Updated');
  });
  it('serializes competing replies and preserves exactly one winning response', async () => {
    const before = await read(); const results = await Promise.allSettled([save(before.row.revision, 'One'), save(before.row.revision, 'Two')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { reason: 'stale' } });
    expect(['One', 'Two']).toContain((await read()).row.merchantReply);
  });
  it('rejects cross-tenant review IDs and changed references without any write', async () => {
    const before = await read(), foreign = await createReviewFixture(kind, other.merchantId);
    await expect(save(before.row.revision, 'Foreign', owner.userId, owner.merchantId, foreign.id)).rejects.toMatchObject({ reason: 'missing' });
    await q(kind === 'order' ? 'UPDATE customer_reviews SET orderId=? WHERE id=?' : 'UPDATE booking_reviews SET booking_id=? WHERE id=?', [foreign.recordId, fixture.id]);
    await expect(save(before.row.revision)).rejects.toMatchObject({ reason: 'reference' });
    const stored = await q(kind === 'order' ? 'SELECT merchantReply AS reply FROM customer_reviews WHERE id=?' : 'SELECT merchant_reply AS reply FROM booking_reviews WHERE id=?', [fixture.id]);
    expect(stored[0].reply).toBeNull();
  });
  it('requires current reply permission, active tenant and both active accounts', async () => {
    const before = await read();
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)", [owner.merchantId, other.userId]);
    await expect(save(before.row.revision, 'Viewer', other.userId)).rejects.toMatchObject({ reason: 'forbidden' });
    await q("UPDATE merchant_members SET role='sales_supervisor' WHERE merchant_id=? AND user_id=?", [owner.merchantId, other.userId]);
    const saved = await save(before.row.revision, 'Supervisor', other.userId); expect(saved.effect).toBe('saved');
    await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [owner.userId]);
    await expect(save(saved.row.revision, 'Disabled owner', other.userId)).rejects.toMatchObject({ reason: 'forbidden' });
    await q("UPDATE users SET account_status='active' WHERE id=?", [owner.userId]);
    await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [owner.merchantId, other.userId]);
    await expect(save(saved.row.revision, 'Revoked', other.userId)).rejects.toMatchObject({ reason: 'forbidden' });
    await q("UPDATE merchants SET status='pending' WHERE id=?", [owner.merchantId]);
    await expect(save(saved.row.revision)).rejects.toMatchObject({ reason: 'forbidden' });
  });
  it('rejects changes to a reviewed record even when stored text is unchanged', async () => {
    const before = await read();
    await q(kind === 'order' ? 'UPDATE customer_reviews SET comment=? WHERE id=?' : 'UPDATE booking_reviews SET comment=? WHERE id=?', ['Changed customer comment', fixture.id]);
    await expect(save(before.row.revision)).rejects.toMatchObject({ reason: 'stale' });
    expect((await read()).row.merchantReply).toBeNull();
  });
});
