import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { getKnowledgeDocumentSummary, listKnowledgeDocuments, readKnowledgeDocument } from './knowledge/document-library';

describe.skipIf(!process.env.DATABASE_URL)('knowledge file library (MySQL)', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  let ids: number[] = [];
  const text = 'ع'.repeat(3999) + '😀' + 'NEXT_PAGE' + 'ن'.repeat(25);
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/sari_pages_test') throw Error('Local disposable test database required');
    owner = await createDisposableMerchant('knowledge-library'); other = await createDisposableMerchant('knowledge-library-other');
    const pool = (await getPool())!;
    for (let i = 0; i < 14; i++) {
      const [row] = await pool.execute<any>(`INSERT INTO merchant_knowledge_docs (merchant_id, file_name, file_type, file_url, file_size, extracted_text, extraction_status, uploaded_at) VALUES (?, ?, 'text', 'private-storage-url', ?, ?, ?, '2026-09-28 10:00:00')`, [owner.merchantId, i === 0 ? 'literal%_file.txt' : `Policy-${i}.txt`, Buffer.byteLength(text), i === 13 ? null : text, i === 13 ? 'failed' : 'completed']); ids.push(row.insertId);
    }
    await pool.execute(`INSERT INTO merchant_knowledge_docs (merchant_id, file_name, file_type, file_size, extracted_text, extraction_status) VALUES (?, 'Private other tenant', 'text', 6, 'secret', 'completed')`, [other.merchantId]);
  });
  afterAll(async () => { await cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean)); await closeDb(); });
  it('lists every registered record with deterministic pagination and metadata only', async () => {
    const first = await listKnowledgeDocuments(owner.merchantId, undefined);
    expect(first).toMatchObject({ total: 14, page: 1, totalPages: 2 }); expect(first.items).toHaveLength(12);
    expect(first.items[0].id).toBe(ids[13]);
    for (const row of first.items) { expect(row).not.toHaveProperty('text'); expect(row).not.toHaveProperty('extractedText'); expect(row).not.toHaveProperty('fileUrl'); }
    const last = await listKnowledgeDocuments(owner.merchantId, { page: 999 });
    expect(last.page).toBe(2); expect(last.items.map(row => row.id)).toEqual([ids[1], ids[0]]);
    expect(new Set([...first.items, ...last.items].map(row => row.id)).size).toBe(14);
  });
  it('treats wildcard and SQL-looking search as literal input and filters extraction status', async () => {
    expect((await listKnowledgeDocuments(owner.merchantId, { search: '%_' })).items.map(row => row.id)).toEqual([ids[0]]);
    expect((await listKnowledgeDocuments(owner.merchantId, { search: "' OR 1=1 --" })).total).toBe(0);
    expect((await listKnowledgeDocuments(owner.merchantId, { status: 'failed' })).items.map(row => row.id)).toEqual([ids[13]]);
  });
  it('reads full text in bounded Unicode pages without leaking another merchant', async () => {
    const first = await readKnowledgeDocument(owner.merchantId, { id: ids[0] });
    const second = await readKnowledgeDocument(owner.merchantId, { id: ids[0], page: 2, revision: first.revision });
    expect(Array.from(first.text)).toHaveLength(4000); expect(first.text.endsWith('😀')).toBe(true);
    expect(first.text + second.text).toBe(text);
    await expect(readKnowledgeDocument(other.merchantId, { id: ids[0] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('does not present missing extraction as complete text and rejects invalid text pages', async () => {
    expect(await readKnowledgeDocument(owner.merchantId, { id: ids[13] })).toMatchObject({ text: '', characterCount: 0, totalPages: 1, extractionStatus: 'failed' });
    await expect(readKnowledgeDocument(owner.merchantId, { id: ids[0], page: 3 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('summarizes all file records without claiming they are active knowledge', async () => {
    expect(await getKnowledgeDocumentSummary(owner.merchantId)).toMatchObject({ id: ids[13], documentCount: 14, contentLength: Array.from(text).length * 13 });
  });
  it('detects changed text even at the same length and in the same timestamp second', async () => {
    const prior = await readKnowledgeDocument(owner.merchantId, { id: ids[1] });
    await (await getPool())!.execute('UPDATE merchant_knowledge_docs SET extracted_text = ? WHERE id = ? AND merchant_id = ?', [text.replace('NEXT_PAGE', 'DIFF_PAGE'), ids[1], owner.merchantId]);
    await expect(readKnowledgeDocument(owner.merchantId, { id: ids[1], page: 2, revision: prior.revision })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
