import { describe, it, expect } from 'vitest';
import { setupWebsiteProduct } from '../client/src/lib/setup-website-product';
import { setupCatalogDraft } from '../shared/setup-catalog';
const normalize = (price: unknown, currency: unknown = 'SAR') => setupWebsiteProduct({ name: 'Imported', price, currency }, 'draft-1');
describe('website suggestions entering setup', () => {
  it.each([undefined, null, false, {}, '', ' ', 0, '0', '0.00'])('requires explicit price input for missing or ambiguous zero %s', price => {
    const row = normalize(price);
    expect(row.price).toBe('');
    expect(setupCatalogDraft.safeParse({ products: [row] }).success).toBe(false);
    expect(setupCatalogDraft.parse({ products: [{ ...row, price: '0' }] }).products[0].priceMinor).toBe(0);
  });
  it.each(['abc', -1, '1e3', '1.001', '1000001'])('retains an invalid suggestion %s for correction without clamping', price => {
    const row = normalize(price);
    expect(row.price).toBe(String(price));
    expect(setupCatalogDraft.safeParse({ products: [row] }).success).toBe(false);
  });
  it.each(['EUR', '', null])('does not convert an unsupported or missing currency %s into SAR', currency => {
    const row = normalize('12.34', currency);
    expect(row.currency).toBe(typeof currency === 'string' ? currency : '');
    expect(setupCatalogDraft.safeParse({ products: [row] }).success).toBe(false);
  });
  it('retains valid exact prices and long text for explicit review', () => {
    expect(setupCatalogDraft.parse({ products: [normalize('12.34', 'USD')] }).products[0]).toMatchObject({ priceMinor: 1234, currency: 'USD' });
    const row = setupWebsiteProduct({ name: 'a'.repeat(256), description: 'b'.repeat(5001), category: 'c'.repeat(101), price: 12, currency: 'SAR' }, 'x');
    expect(row.name.length).toBe(256); expect(row.description.length).toBe(5001); expect(row.category.length).toBe(101);
    expect(setupCatalogDraft.safeParse({ products: [row] }).success).toBe(false);
  });
  it('blocks executable and credential-bearing media links before rendering', () => {
    expect(setupWebsiteProduct({ imageUrl: 'javascript:alert(1)', productUrl: 'https://u:p@example.com' }, 'x')).toMatchObject({ imageUrl: '', productUrl: '' });
    expect(setupWebsiteProduct(null, 'x')).toMatchObject({ name: '', price: '', currency: '' });
  });
});
