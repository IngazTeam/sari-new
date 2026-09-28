import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { saveFixtureReview as saveKnowledgeReview } from './tests/helpers/knowledge-reviewed-input';
import { reserveIntake, finishIntake, getIntakeReceipt } from './knowledge/intake-receipt-store';
import { readKnowledgeDocument } from './knowledge/document-library';
import { removeKnowledgeSource } from './knowledge/source-lifecycle';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { ensureKnowledgeIntakeTestSchema } from './tests/helpers/knowledge-intake-schema';
import { fixtureKnowledgeAnalysis as analysis } from './tests/helpers/knowledge-reviewed-input';

describe.skipIf(!process.env.DATABASE_URL)('knowledge report consent binding (local MySQL)', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  const source = { content: 'Full source text for the reviewed knowledge.', contentType: 'document' as const, fileName: 'Synthetic reviewed source.txt' };
  const input = async (merchantId = owner.merchantId) => ({ ...source, requestId: randomUUID(), reviewId: (await saveKnowledgeReview(merchantId, source, analysis)).id, acknowledged: true as const });
  beforeAll(ensureKnowledgeIntakeTestSchema);
  beforeEach(async () => { owner = await createDisposableMerchant('knowledge-review'); other = await createDisposableMerchant('review-other'); });
  afterEach(async () => { await cleanupDisposableMerchants([owner.userId, other.userId]); });
  afterAll(closeDb);
  it('stores the exact reviewed report in the receipt and document before any processing outcome', async () => {
    const raw = await input(), result = await reserveIntake(owner.merchantId, raw);
    expect(result.receipt.review).toMatchObject({ id: raw.reviewId, analysis });
    expect(result.receipt.review?.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2} /);
    expect((await readKnowledgeDocument(owner.merchantId, { id: result.receipt.documentId! })).receipt?.review).toEqual(result.receipt.review);
    await finishIntake(owner.merchantId, raw.requestId, 'uncertain', null, result.execution!);
    expect((await reserveIntake(owner.merchantId, raw)).receipt.review).toEqual(result.receipt.review);
  });
  it.each([{ content: 'Different text after review' }, { contentType: 'custom' }, { fileName: 'Renamed source.txt' }])('rejects changed source %j before reservation', async change => {
    const raw = await input(); await expect(reserveIntake(owner.merchantId, { ...raw, ...change })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(await getIntakeReceipt(owner.merchantId, raw.requestId)).toBeNull();
  });
  it('requires consent and a valid review, and never borrows another tenant report', async () => {
    const raw = await input(); await expect(reserveIntake(owner.merchantId, { ...raw, acknowledged: false })).rejects.toThrow();
    await expect(reserveIntake(owner.merchantId, { ...raw, reviewId: randomUUID() })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(reserveIntake(other.merchantId, raw)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect((await reserveIntake(owner.merchantId, raw)).created).toBe(true);
  });
  it('rejects expired reviews without losing the source or treating the request as processed', async () => {
    const raw = await input(); await (await getPool())!.execute('UPDATE knowledge_intake_reviews SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE merchant_id=? AND review_id=?', [owner.merchantId, raw.reviewId]);
    await expect(reserveIntake(owner.merchantId, raw)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(await getIntakeReceipt(owner.merchantId, raw.requestId)).toBeNull();
  });
  it('consumes one review once across distinct concurrent request IDs, while replaying the original result', async () => {
    const raw = await input(), second = { ...raw, requestId: randomUUID() };
    const outcomes = await Promise.allSettled([reserveIntake(owner.merchantId, raw), reserveIntake(owner.merchantId, second)]);
    const ok = outcomes.filter(x => x.status === 'fulfilled'); expect(ok).toHaveLength(1);
    const saved = (ok[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof reserveIntake>>>).value;
    await finishIntake(owner.merchantId, saved.receipt.requestId, 'empty', null, saved.execution!);
    const rejected = saved.receipt.requestId === raw.requestId ? second : raw;
    await expect(reserveIntake(owner.merchantId, rejected)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect((await reserveIntake(owner.merchantId, { ...raw, requestId: saved.receipt.requestId })).created).toBe(false);
  });
  it('rolls back consumption on reservation failure and rejects changing the review of an existing request', async () => {
    const raw = await input(); await expect(reserveIntake(owner.merchantId, raw, () => { throw Error('preflight limit'); })).rejects.toThrow('preflight limit');
    expect((await reserveIntake(owner.merchantId, raw)).created).toBe(true);
    await expect(reserveIntake(owner.merchantId, { ...raw, reviewId: randomUUID() })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('clears report text on file-group deletion while retaining the receipt tombstone and isolating other tenants', async () => {
    const raw = await input(), result = await reserveIntake(owner.merchantId, raw); await finishIntake(owner.merchantId, raw.requestId, 'uncertain', null, result.execution!);
    const unused = await input(), foreign = await input(other.merchantId); await removeKnowledgeSource(owner.merchantId, 'document');
    expect(await getIntakeReceipt(owner.merchantId, raw.requestId)).toMatchObject({ state: 'removed', review: null });
    const [rows] = await (await getPool())!.execute<any[]>('SELECT review_snapshot FROM knowledge_intake_receipts WHERE merchant_id=? AND request_id=?', [owner.merchantId, raw.requestId]); expect(rows[0].review_snapshot).toBeNull();
    await expect(reserveIntake(owner.merchantId, unused)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect((await reserveIntake(other.merchantId, foreign)).created).toBe(true);
  });
});
