import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatProductPrice, majorToMinor, normalizeProductMoneyWrite, requireMinor, verifiedProductMoney } from '../shared/product-money';
import { formatProductsForWhatsApp } from './ai/product-intelligence';

describe('catalogue monetary boundary', () => {
  it('keeps automated website extraction additive and protects reviewed catalogue entries', () => {
    const source=readFileSync('server/routers-website-analysis.ts','utf8');
    expect(source).not.toContain('deleteAllProductsByMerchantId');
    expect(source).toContain('mergeAnalyzedProducts(merchant.id, input.url, products)');
    const snapshot = readFileSync('server/catalog/analysis-snapshot.ts', 'utf8');
    expect(snapshot).toContain("mode === 'merge' && (previous || existingNames.has(identity(product.name)))");
  });
  it.each([[99.99, 9999], [0, 0], ['1.01', 101], ['0.10', 10], ['10.0000', 1000], ['21474836.47', 2147483647]])('converts %s exactly to %s minor units', (major, minor) => {
    expect(majorToMinor(major)).toBe(minor);
  });
  it.each([-1, NaN, Infinity, '1.005', '1e3', '1 SAR', '', '21474836.48'])('rejects invalid or lossy price %s', value => {
    expect(() => majorToMinor(value)).toThrow();
  });
  it('converts native values once and retains provider minor values unchanged', () => {
    expect(normalizeProductMoneyWrite({price: 99.99, costPrice: 20.01}, 'major')).toEqual({price: 9999, costPrice: 2001, priceUnit: 'minor'});
    expect(normalizeProductMoneyWrite({price: 9999}, 'minor')).toEqual({price: 9999, priceUnit: 'minor'});
    expect(normalizeProductMoneyWrite({})).not.toHaveProperty('priceUnit');
    expect(() => requireMinor(99.99)).toThrow();
  });
  it('never labels an unverified historical integer as a current quoted price', () => {
    const legacy = { price: 100, priceUnit: 'unverified', currency: 'SAR' };
    expect(() => verifiedProductMoney(legacy)).toThrow();
    expect(formatProductPrice(legacy)).toBe('السعر يحتاج مراجعة');
  });
  it('uses each product currency and keeps free products distinct from missing prices', () => {
    expect(formatProductPrice({price: 9999, priceUnit: 'minor', currency: 'USD'}, 'en-US')).toBe('$99.99');
    expect(formatProductPrice({price: 0, priceUnit: 'minor', currency: 'SAR'}, 'en-US')).toBe('0 SAR');
    expect(() => verifiedProductMoney({price: 100, priceUnit: 'minor', currency: 'EUR'})).toThrow();
  });
  it('quotes minor catalogue prices correctly in actual WhatsApp product rendering', () => {
    const quote = formatProductsForWhatsApp([{name: 'Sample', price: 9999, priceUnit: 'minor', currency: 'SAR'}]);
    expect(quote).toContain(formatProductPrice({price: 9999, priceUnit: 'minor', currency: 'SAR'}));
    expect(quote).not.toContain('9999');
  });
});
