import { describe, expect, it, vi } from 'vitest';
import { matchZidSelection } from './zid-order-contract';
import { ZidClient } from '../integrations/zid/zidClient';
import { isZidOrderRequest, isOrderConfirmation } from './zid-order-from-chat';

const product = { zidProductId: 'z-1', zidSku: 'SKU1', nameAr: 'سماعة', nameEn: null, quantity: 5, isActive: 1, isPublished: 1, isInStock: 1 };
const selection = { products: [{ name: 'سماعة', quantity: 2 }] };
describe('Zid extraction and provider boundary penetration cases', () => {
  it.each(['', ' ', 'unknown', 'سما', "' OR 1=1 --"] )('does not match empty, partial or unknown names: %s', name => {
    expect(() => matchZidSelection({ products: [{ name, quantity: 1 }] }, [product])).toThrow();
  });
  it.each([0, -1, 1.5, Infinity, NaN, 10001, '1', null])('rejects malformed quantity %s before any tool execution', quantity => {
    expect(() => matchZidSelection({ products: [{ name: 'سماعة', quantity }] }, [product])).toThrow();
  });
  it('rejects forged prices, unknown fields, ambiguous names, overselling and duplicate lines', () => {
    expect(() => matchZidSelection({ products: [{ ...selection.products[0], price: 1 }] }, [product])).toThrow();
    expect(() => matchZidSelection(selection, [product, { ...product, zidProductId: 'z-2', zidSku: 'SKU2' }])).toThrow();
    expect(() => matchZidSelection({ products: [{ name: 'سماعة', quantity: 6 }] }, [product])).toThrow();
    expect(() => matchZidSelection({ products: [...selection.products, ...selection.products] }, [product])).toThrow();
  });
  it('resolves exact owned identity and rejects conflicts, unavailable and SKU-less products', () => {
    expect(matchZidSelection(selection, [product]).products[0]).toMatchObject({ sku: 'SKU1', zidProductId: 'z-1', quantity: 2 });
    expect(() => matchZidSelection({ products: [{ name: 'سماعة', quantity: 1, sku: 'SKU1', zidProductId: 'foreign' }] }, [product])).toThrow();
    for (const change of [{ isActive: 0 }, { isPublished: 0 }, { isInStock: 0 }, { zidSku: null }]) expect(() => matchZidSelection(selection, [{ ...product, ...change }])).toThrow();
  });
  it.each(['لا أريد شراء', 'كيف أطلب؟', 'طريقة الطلب', 'هدية', 'نعم؟', 'yes?'])('does not authorize a purchase from %s', async message => {
    expect(await isZidOrderRequest(message)).toBe(false);
    expect(isOrderConfirmation(message)).toBe(false);
  });
  it('sends expiry under payment_method and never retries a create call on a timeout', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ order: { id: 1 } }) });
    const client = new ZidClient({ accessToken: 'fixture', managerToken: 'fixture', clientId: '', clientSecret: '', redirectUri: '', fetchImpl });
    const data = { customerName: 'Fixture', customerPhone: '966500000001', address: { line1: 'Fixture Street', city: 'Riyadh', countryCode: 'SA' },
      products: [{ sku: 'SKU1', quantity: 2 }], shippingMethodId: 4, paymentMethodId: 5, isPaymentLink: true,
      checkoutReference: 'SARY-CHECKOUT:804b6513-4780-4fb4-9d90-7ac5f0fc846a' };
    await client.createOrderFromWhatsApp(data);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.payment_link_configs).toBeUndefined();
    expect(body.customer_comment).toBe(data.checkoutReference);
    expect(body.products).toEqual(data.products);
    expect(body.payment_method).toMatchObject({ id: 5, payment_link_configs: { expiryDateTime: expect.any(String) } });
    fetchImpl.mockRejectedValue(new Error('timeout'));
    await expect(client.createOrderFromWhatsApp(data)).rejects.toThrow('timeout');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    fetchImpl.mockResolvedValue({ ok: true, json: async () => ({ order: { id: 1 } }) });
    expect(await client.getOrderForReconciliation(1)).toEqual({ order: { id: 1 } });
    expect(fetchImpl.mock.calls[2][0]).toMatch(/\/managers\/store\/orders\/1\/view$/);
    expect(fetchImpl.mock.calls[2][1].body).toBeUndefined();
    expect(fetchImpl.mock.calls[2][1].method ?? 'GET').toBe('GET');
    for (const invalid of [-1, 1.1, Number.MAX_SAFE_INTEGER + 1]) await expect(client.getOrderForReconciliation(invalid)).rejects.toThrow('Invalid');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
