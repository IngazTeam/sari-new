import { describe, expect, it } from 'vitest';
import { setupCatalogDraft, setupProductSchema, setupServiceSchema } from '../shared/setup-catalog';

const product = (price: unknown) => ({ name: 'منتج', price });
describe('setup catalog approval boundary', () => {
  it.each(['', ' ', '-1', 'abc', '1e3', '1.001', '1,000', Infinity, NaN, null, undefined, 1_000_000.01])('rejects an ambiguous price %s rather than making it free', price => {
    for (const kind of ['products', 'services']) {
      const parsed = setupCatalogDraft.safeParse({ [kind]: [product(price)] });
      expect(parsed.success).toBe(false);
      if (!parsed.success) expect(parsed.error.issues[0].path).toEqual([kind, 0, 'price']);
    }
  });
  it('converts exact decimals once, including explicitly free items and the ceiling', () => {
    const parsed = setupCatalogDraft.parse({ products: [product('0'), product('12.34'), product('1.2300'), product(1_000_000)], services: [product('19.99')] });
    expect(parsed.products.map(row => row.priceMinor)).toEqual([0, 1234, 123, 100_000_000]);
    expect(parsed.services[0].priceMinor).toBe(1999);
    expect(parsed.products.every(row => setupProductSchema.safeParse(row).success)).toBe(true);
    expect(setupServiceSchema.safeParse(parsed.services[0]).success).toBe(true);
  });
  it('omits only wholly empty placeholders and preserves original error indices', () => {
    const empty = { id: 'blank', name: ' ', description: '', price: '' };
    expect(setupCatalogDraft.parse({ products: [empty] }).products).toEqual([]);
    const result = setupCatalogDraft.safeParse({ products: [empty, { name: '', price: '3' }, product('')] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map(issue => issue.path)).toEqual([['products', 1, 'name'], ['products', 2, 'price']]);
  });
  it.each([null, {}, 'bad', [null], [7], [{ name: 12, price: '0' }]])('fails safely on malformed draft structure %j', products => {
    expect(setupCatalogDraft.safeParse({ products }).success).toBe(false);
  });
  it('enforces length, price, URL and currency constraints at both boundaries', () => {
    for (const patch of [{ name: 'a'.repeat(256) }, { description: 'a'.repeat(5001) }, { category: 'a'.repeat(101) }, { currency: 'EUR' }, { imageUrl: 'javascript:alert(1)' }, { productUrl: 'https://user:pass@example.com' }]) {
      expect(setupCatalogDraft.safeParse({ products: [{ ...product('1'), ...patch }] }).success).toBe(false);
      expect(setupProductSchema.safeParse({ name: 'Test', priceMinor: 100, ...patch }).success).toBe(false);
    }
    expect(setupCatalogDraft.safeParse({ products: Array.from({ length: 101 }, () => product('0')) }).success).toBe(false);
    for (const priceMinor of [-1, 0.5, 100_000_001, '100']) expect(setupServiceSchema.safeParse({ name: 'Test', priceMinor }).success).toBe(false);
  });
  it('leaves raw drafts unchanged and retains all supported product fields', () => {
    const input = { products: [{ id: 'local', name: ' Test ', price: '12.34', description: ' Details ', currency: 'USD', category: 'Category', imageUrl: 'https://example.com/a.jpg', productUrl: 'https://example.com/product' }] };
    const before = structuredClone(input);
    expect(setupCatalogDraft.parse(input).products[0]).toEqual({ name: 'Test', priceMinor: 1234, description: 'Details', currency: 'USD', category: 'Category', imageUrl: 'https://example.com/a.jpg', productUrl: 'https://example.com/product' });
    expect(input).toEqual(before);
  });
});
