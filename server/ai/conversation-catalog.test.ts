import { describe, expect, it, vi } from 'vitest';
import { catalogSearchTerms, readConversationCatalog } from './conversation-catalog';

describe('conversation catalogue retrieval', () => {
  it('bounds added description context while retaining candidate identities and prices', async () => {
    const rows = Array.from({ length: 200 }, (_, id) => ({ id: id + 1, name: 'item', description: 'a'.repeat(600), price: 2000, currency: 'SAR' }));
    const execute = vi.fn().mockResolvedValueOnce([rows]).mockResolvedValueOnce([[]]);
    const result = await readConversationCatalog({ execute } as any, { merchantId: 1, messages: [] });
    expect(result).toHaveLength(200);
    expect(result.reduce((n, item) => n + item.description!.length, 0)).toBe(24000);
    expect(result.at(-1)).toMatchObject({ id: 200, priceMinor: 2000, description: '' });
  });
  it('keeps useful Arabic and English description hints without SQL wildcard semantics', () => {
    expect(catalogSearchTerms('أبغى للبشرة الحساسة أقل من 100 ريال')).toContain('بشرة');
    expect(catalogSearchTerms('I want sensitive skin cream 100% _sale')).toContain('sensitive');
    expect(catalogSearchTerms('x '.repeat(1000)).length).toBeLessThanOrEqual(12);
    expect(catalogSearchTerms('منتج منتج منتج')).toEqual(['منتج']);
  });
  it('binds tenant and retrieval hints as parameters, excluding private pricing fields', async () => {
    const execute = vi.fn().mockResolvedValueOnce([[{ id: 42, name: 'كريم', description: 'بشرة حساسة', category: 'عناية', price: 7500, currency: 'SAR', sallaProductId: null }]])
      .mockResolvedValueOnce([[]]);
    const result = await readConversationCatalog({ execute } as any, { merchantId: 7, messages: [{ role: 'user', content: "sensitive%' OR 1=1" }], previousProductIds: [42] });
    expect(execute.mock.calls[0][1][0]).toBe(7);
    expect(execute.mock.calls[0][0]).not.toContain("sensitive%'");
    expect(result).toEqual([{ id: 42, name: 'كريم', description: 'بشرة حساسة', category: 'عناية', priceMinor: 7500, currency: 'SAR', provider: 'local' }]);
    expect(result[0]).not.toHaveProperty('costPrice');
  });
});
