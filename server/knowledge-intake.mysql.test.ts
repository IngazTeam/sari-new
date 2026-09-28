import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createKnowledgeDoc, getKnowledgeDocByMerchantId } from './db';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { knowledgeIntakeInput } from '../shared/knowledge-intake';

describe.skipIf(!process.env.DATABASE_URL)('knowledge intake multibyte persistence (MySQL)', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/sari_pages_test') throw Error('Local disposable test database required');
    const migration = readFileSync('drizzle/0151_knowledge_intake_text_capacity.sql', 'utf8');
    await (await getPool())!.query(migration);
  });
  beforeEach(async () => { owner = await createDisposableMerchant('knowledge-text'); });
  afterEach(async () => { await cleanupDisposableMerchants([owner.userId]); });
  afterAll(closeDb);
  it.each(['知', 'ع'])('preserves all 30,000 accepted characters including %s at the tail', async character => {
    const content = character.repeat(29_990) + 'END_MARKER';
    expect(knowledgeIntakeInput.parse({ content, contentType: 'document' }).content).toHaveLength(30_000);
    await createKnowledgeDoc({ merchantId: owner.merchantId, fileName: 'Local multibyte test', fileType: 'text', fileSize: Buffer.byteLength(content), extractionStatus: 'completed', extractedText: content });
    expect((await getKnowledgeDocByMerchantId(owner.merchantId))?.extractedText).toBe(content);
  });
});
