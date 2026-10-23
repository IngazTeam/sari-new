import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { readConversationCatalog } from './conversation-catalog';
import { getProductsByMerchantId } from '../db';
import { readReplyCatalog, searchRelevantProducts } from './sari-personality';
import { withConversationUnderstanding, type ConversationUnderstanding } from './conversation-understanding-context';

describe.skipIf(!process.env.DATABASE_URL)('catalogue retrieval across the complete tenant catalogue', () => {
  let merchant: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof merchant;
  const q = async (sql: string, args: unknown[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  beforeEach(async () => {
    merchant = await createDisposableMerchant('catalog-search'); other = await createDisposableMerchant('catalog-other');
    const values = Array.from({ length: 720 }, (_, i) => [merchant.merchantId, `Item ${i}`, 'ordinary inventory', 15000, 'minor', 4]);
    await (await getPool())!.query('INSERT INTO products (merchantId,name,description,price,price_unit,stock) VALUES ?', [values]);
  });
  afterEach(async () => cleanupDisposableMerchants([merchant.userId, other.userId]));
  afterAll(closeDb);
  async function catalog(message: string, previousProductIds: number[] = []) {
    const c = await (await getPool())!.getConnection();
    try { return await readConversationCatalog(c, { merchantId: merchant.merchantId, messages: [{ role: 'user', content: message }], previousProductIds }); }
    finally { c.release(); }
  }
  it('finds description matches beyond item 200 and exposes verified price and currency', async () => {
    const product = await q("INSERT INTO products (merchantId,name,descriptionAr,price,price_unit,currency,stock) VALUES (?,'Calm','للبشرة الحساسة',7500,'minor','SAR',5)", [merchant.merchantId]);
    const result = await catalog('أبغى كريم للبشرة الحساسة بأقل من 100 ريال');
    expect(result[0]).toMatchObject({ id: product.insertId, priceMinor: 7500, currency: 'SAR' });
    expect(result.length).toBeLessThanOrEqual(200);
  });
  it('keeps a referenced old item available to both interpretation and the final reply beyond the latest 500', async () => {
    const [old] = await q('SELECT id FROM products WHERE merchantId=? ORDER BY id LIMIT 1', [merchant.merchantId]);
    const result = await catalog('وهذا متوفر؟', [old.id]);
    expect(result[0].id).toBe(old.id);
    expect((await getProductsByMerchantId(merchant.merchantId, { ids: [old.id] })).map(p => p.id)).toEqual([old.id]);
    expect(await getProductsByMerchantId(other.merchantId, { ids: [old.id] })).toEqual([]);
    await withConversationUnderstanding({ merchantId: merchant.merchantId, conversationId: 1, incomingMessageId: 2,
      message: 'وهذا متوفر؟', analysis: { requestKind: 'ordinary', productIds: [old.id] } as ConversationUnderstanding }, async () => {
      const replyCatalog = await readReplyCatalog(merchant.merchantId);
      expect((await searchRelevantProducts('وهذا متوفر؟', replyCatalog)).map(p => p.id)).toEqual([old.id]);
      await q('UPDATE products SET stock=0 WHERE id=?', [old.id]);
      expect(await searchRelevantProducts('وهذا متوفر؟', await readReplyCatalog(merchant.merchantId))).toEqual([]);
      await expect(readReplyCatalog(other.merchantId)).rejects.toThrow('tenant mismatch');
    });
  });
  it('never admits another tenant, inactive, sold-out or unverified-price match, even when pinned', async () => {
    const invalid = [];
    for (const [tenant, active, stock, unit] of [[other.merchantId, 1, 5, 'minor'], [merchant.merchantId, 0, 5, 'minor'], [merchant.merchantId, 1, 0, 'minor'], [merchant.merchantId, 1, 5, 'unverified']]) {
      invalid.push((await q("INSERT INTO products (merchantId,name,price,price_unit,isActive,stock) VALUES (?,'sensitive skin',1000,?,?,?)", [tenant, unit, active, stock])).insertId);
    }
    const result = await catalog('sensitive skin', invalid);
    expect(result.some(p => invalid.includes(p.id))).toBe(false);
  });
});
