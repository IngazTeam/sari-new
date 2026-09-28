import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants, assertDisposableDatabase } from './tests/helpers/disposable-merchant';
import { reserveIntake, finishIntake, getIntakeReceipt } from './knowledge/intake-receipt-store';
import { listKnowledgeDocuments, readKnowledgeDocument } from './knowledge/document-library';
import { removeKnowledgeSource, resetKnowledgeSources } from './knowledge/source-lifecycle';
import { getActiveKnowledgeDoc, getKnowledgeDocByMerchantId } from './db';
import { buildDocumentContext } from './ai/rag-engine';

describe.skipIf(!process.env.DATABASE_URL)('durable knowledge receipts (local MySQL)', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  const outcome = { success: true, evolveResult: { added: 1, evolved: 0, conflicts: 2, unchanged: 0 }, embeddingsReady: false };
  const input = (type: 'document' | 'products' | 'custom' = 'document') => ({ requestId: randomUUID(), content: 'ع'.repeat(29_990) + 'END_MARKER', contentType: type, fileName: 'Receipt test.txt' });
  beforeAll(async () => {
    assertDisposableDatabase(); const pool = (await getPool())!;
    const [columns] = await pool.query<any[]>("SHOW COLUMNS FROM merchant_knowledge_docs LIKE 'intake_request_id'");
    if (!columns.length) for (const statement of readFileSync('drizzle/0152_knowledge_intake_receipts.sql', 'utf8').split('--> statement-breakpoint')) await pool.query(statement);
  });
  beforeEach(async () => { owner = await createDisposableMerchant('intake-receipt'); other = await createDisposableMerchant('intake-other'); });
  afterEach(async () => { await cleanupDisposableMerchants([owner.userId, other.userId]); });
  afterAll(closeDb);
  it('serializes simultaneous same-key attempts into one document and one worker reservation', async () => {
    const source = input(); let limits = 0;
    const results = await Promise.all(Array.from({ length: 4 }, () => reserveIntake(owner.merchantId, source, () => limits++)));
    expect(results.filter(r => r.created)).toHaveLength(1); expect(limits).toBe(1);
    expect(new Set(results.map(r => r.receipt.documentId)).size).toBe(1);
    expect((await listKnowledgeDocuments(owner.merchantId, undefined)).total).toBe(1);
    const page = await readKnowledgeDocument(owner.merchantId, { id: results[0].receipt.documentId!, page: 8 });
    expect(page.text).toBe(source.content.slice(28_000)); expect(page.receipt?.state).toBe('processing');
  });
  it('rejects reuse with different content and competing new requests; permits the same UUID in another tenant', async () => {
    const source = input(); await reserveIntake(owner.merchantId, source);
    await expect(reserveIntake(owner.merchantId, { ...source, content: 'Different content' })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(reserveIntake(owner.merchantId, input())).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await getIntakeReceipt(other.merchantId, source.requestId)).toBeNull();
    expect((await reserveIntake(other.merchantId, source)).created).toBe(true);
  });
  it.each(['document', 'products', 'custom'] as const)('archives each %s addition even when an earlier file exists, without making archives raw reply context', async type => {
    const first = input(); await reserveIntake(owner.merchantId, first); await finishIntake(owner.merchantId, first.requestId, 'completed', outcome);
    const second = input(type); const reserved = await reserveIntake(owner.merchantId, second);
    expect((await listKnowledgeDocuments(owner.merchantId, undefined)).total).toBe(2);
    expect((await readKnowledgeDocument(owner.merchantId, { id: reserved.receipt.documentId! })).receipt?.requestId).toBe(second.requestId);
    expect(await getKnowledgeDocByMerchantId(owner.merchantId)).toBeUndefined();
    expect(await getActiveKnowledgeDoc(owner.merchantId)).toBeUndefined();
    expect(await buildDocumentContext(owner.merchantId, 'END_MARKER')).toBe('');
  });
  it('replays a saved partial result after reload and does not overwrite a final receipt', async () => {
    const source = input(); await reserveIntake(owner.merchantId, source);
    await finishIntake(owner.merchantId, source.requestId, 'completed', outcome);
    await finishIntake(owner.merchantId, source.requestId, 'uncertain', null);
    expect(await getIntakeReceipt(owner.merchantId, source.requestId)).toMatchObject({ state: 'completed', outcome });
    expect(await reserveIntake(owner.merchantId, source)).toMatchObject({ created: false, receipt: { state: 'completed', outcome } });
  });
  it('blocks deletion/reset while writes can still be running and retains a tombstone after deletion', async () => {
    const source = input(); await reserveIntake(owner.merchantId, source);
    await expect(removeKnowledgeSource(owner.merchantId, 'document')).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(resetKnowledgeSources(owner.merchantId)).rejects.toMatchObject({ code: 'CONFLICT' });
    await finishIntake(owner.merchantId, source.requestId, 'uncertain', null);
    await removeKnowledgeSource(owner.merchantId, 'document');
    expect(await reserveIntake(owner.merchantId, source)).toMatchObject({ created: false, receipt: { state: 'removed', documentId: null, outcome: null } });
    expect((await listKnowledgeDocuments(owner.merchantId, undefined)).total).toBe(0);
  });
  it('rolls back reservation and archive when rate limiting rejects a new attempt', async () => {
    const source = input(); await expect(reserveIntake(owner.merchantId, source, () => { throw Error('limited'); })).rejects.toThrow('limited');
    expect(await getIntakeReceipt(owner.merchantId, source.requestId)).toBeNull();
    expect((await listKnowledgeDocuments(owner.merchantId, undefined)).total).toBe(0);
  });
});
