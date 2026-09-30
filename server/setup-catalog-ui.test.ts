// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ar from '../client/src/locales/ar.json';
import en from '../client/src/locales/en.json';
const context = vi.hoisted(() => ({ language: 'ar' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values: Record<string, unknown> = {}) => {
  const locale = context.language === 'ar' ? ar : en;
  return String(key.split('.').reduce((value: any, part) => value?.[part], locale) || key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ''));
} }) }));
import ProductsServicesStep from '../client/src/pages/setup-wizard/ProductsServicesStep';
let root: Root, container: HTMLDivElement, latest: Record<string, any>;
const next = vi.fn(), skip = vi.fn(), updated = vi.fn();
function Harness({ initial }: { initial: Record<string, any> }) {
  const [data, setData] = useState(initial); latest = data;
  return React.createElement(ProductsServicesStep, { wizardData: data, updateWizardData: patch => { updated(patch); setData(previous => ({ ...previous, ...patch })); }, goToNextStep: next, skipStep: skip });
}
const button = (text: string) => Array.from(container.querySelectorAll('button')).find(node => node.textContent?.trim() === text)!;
const click = (text: string) => act(async () => button(text).click());
const render = (initial: Record<string, any>) => act(async () => root.render(React.createElement(Harness, { initial })));
const fill = (selector: string, value: string) => act(async () => {
  const node = container.querySelector(selector) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
  node.dispatchEvent(new Event('input', { bubbles: true }));
});
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks(); context.language = 'ar';
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
describe('setup catalog fields and draft preservation', () => {
  it('reviews template service duration and category and rejects invalid minutes', async () => {
    await render({ businessType: 'services', services: [{ name: 'موعد', price: '0', durationMinutes: 90, category: 'عناية' }] });
    expect((container.querySelector('#setup-services-0-durationMinutes') as HTMLInputElement).value).toBe('90');
    expect((container.querySelector('#setup-services-0-category') as HTMLInputElement).value).toBe('عناية');
    await fill('#setup-services-0-durationMinutes', '0'); await click(ar.setupCatalogUx.next);
    expect(container.textContent).toContain(ar.setupCatalogUx.durationError); expect(next).not.toHaveBeenCalled();
    await fill('#setup-services-0-durationMinutes', '45'); await click(ar.setupCatalogUx.next);
    expect(next).toHaveBeenCalledOnce(); expect(latest.services[0]).toMatchObject({ durationMinutes: '45', category: 'عناية' });
  });
  it('shows field errors, preserves an unnamed priced row, then permits explicit correction', async () => {
    await render({ businessType: 'store', products: [{ name: '', price: '12.345' }] });
    await click(ar.setupCatalogUx.next);
    expect(next).not.toHaveBeenCalled(); expect(skip).not.toHaveBeenCalled();
    expect(updated).not.toHaveBeenCalled();
    expect(container.textContent).toContain(ar.setupCatalogUx.nameError);
    expect(container.textContent).toContain(ar.setupCatalogUx.priceError);
    expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(2);
    await fill('#setup-products-0-name', 'منتج'); await fill('#setup-products-0-price', '12.34');
    await click(ar.setupCatalogUx.next); expect(next).toHaveBeenCalledOnce();
    expect(latest.products).toEqual([{ name: 'منتج', price: '12.34' }]);
  });
  it('allows editing website products and preserves their extra fields', async () => {
    const product = Object.freeze({ id: 'duplicate', name: 'مستخرج', price: '', currency: 'USD', imageUrl: 'https://example.com/a.jpg', productUrl: 'https://example.com/product', category: 'أجهزة', description: 'تفاصيل', sourceNote: 'original' });
    await render({ businessType: 'store', products: Object.freeze([product, { ...product, name: 'آخر' }]) });
    await fill('#setup-products-0-price', '0');
    expect(latest.products[0]).toEqual({ ...product, price: '0' });
    expect(latest.products[1].price).toBe('');
    expect(container.querySelector('img')?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });
  it('shows retained services after a business type change and blocks their invalid price', async () => {
    await render({ businessType: 'store', services: [{ name: 'خدمة', price: '' }] });
    expect(container.textContent).toContain(ar.setupCatalogUx.retained);
    await click(ar.setupCatalogUx.next);
    expect(container.querySelector('#setup-services-0-price')?.getAttribute('aria-invalid')).toBe('true');
    expect(next).not.toHaveBeenCalled();
  });
  it.each([null, { old: 'data' }, [null]])('preserves malformed data until explicit removal and supports undo: %j', async products => {
    await render({ businessType: 'store', products });
    expect(updated).not.toHaveBeenCalled();
    await click(Array.isArray(products) ? ar.setupCatalogUx.removeInvalid : ar.setupCatalogUx.clearInvalid);
    expect(latest.products).toEqual([]);
    await click(ar.setupCatalogUx.undo);
    expect(latest.products).toEqual(products);
    await click(ar.setupCatalogUx.next); expect(next).not.toHaveBeenCalled(); expect(skip).not.toHaveBeenCalled();
  });
  it('undoes one removal without changing the original array or overwriting other edits', async () => {
    const initial = Object.freeze([{ name: 'أ', price: '1' }, { name: 'ب', price: '2' }]);
    await render({ businessType: 'store', products: initial });
    await act(async () => (container.querySelector('.ms-catalog-item button') as HTMLButtonElement).click());
    await fill('#setup-products-0-price', '3');
    await click(ar.setupCatalogUx.undo);
    expect(latest.products).toEqual([{ name: 'أ', price: '1' }, { name: 'ب', price: '3' }]);
    expect(initial[1].price).toBe('2');
  });
  it('limits additions and opens optional fields containing approval errors', async () => {
    await render({ businessType: 'store', products: Array.from({ length: 100 }, (_, i) => ({ name: String(i), price: '1', productUrl: i ? '' : 'javascript:alert(1)' })) });
    expect(button(ar.setupCatalogUx.addProduct).disabled).toBe(true);
    await click(ar.setupCatalogUx.next);
    expect((container.querySelector('.ms-catalog-item details') as HTMLDetailsElement).open).toBe(true);
    expect(container.textContent).toContain(ar.setupCatalogUx.urlError);
    expect(container.querySelector('img')).toBeNull();
  });
  it('renders English controls and allows an empty optional catalog without writes', async () => {
    context.language = 'en';
    await render({ businessType: 'both', products: [], services: [] });
    expect(container.textContent).toContain(en.setupCatalogUx.addService);
    expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);
    await click(en.setupCatalogUx.later);
    expect(skip).toHaveBeenCalledOnce(); expect(updated).not.toHaveBeenCalled();
  });
});
