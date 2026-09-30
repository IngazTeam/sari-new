// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
import ar from '../client/src/locales/ar.json';
const preview = vi.hoisted(() => vi.fn());
vi.mock('@/lib/trpc', () => ({ trpc: { analysis: { previewAnalysis: { useMutation: () => ({ mutateAsync: preview, isPending: false }) } } } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key.split('.').reduce((value: any, part) => value?.[part], ar) || key }) }));
import WebsiteStep from '../client/src/pages/setup-wizard/WebsiteStep';
it('keeps website unknown prices for correction and shows that they need review', async () => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
  const update = vi.fn();
  preview.mockResolvedValue({ success: true, products: [{ name: 'Missing', price: null, currency: 'SAR' }, { name: 'Ambiguous', price: 0, currency: 'SAR' }, { name: '', price: 10, currency: 'EUR' }, { name: 'Valid', price: 12.34, currency: 'USD' }], companyInfo: {}, contactInfo: {}, pages: [], faqs: [] });
  try {
    await act(async () => root.render(React.createElement(WebsiteStep, { wizardData: { websiteUrl: 'https://example.test' }, updateWizardData: update, goToNextStep: vi.fn(), skipStep: vi.fn() })));
    const analyze = Array.from(container.querySelectorAll('button')).find(node => node.textContent?.trim() === ar.websiteStep.auto_2)!;
    await act(async () => analyze.click());
    expect(preview).toHaveBeenCalledWith({ websiteUrl: 'https://example.test' });
    expect(update.mock.calls[0][0].products.map((row: any) => [row.name, row.price, row.currency])).toEqual([['Missing', '', 'SAR'], ['Ambiguous', '', 'SAR'], ['', '10', 'EUR'], ['Valid', '12.34', 'USD']]);
    expect(container.textContent?.split(ar.setupCatalogUx.extractedPriceReview)).toHaveLength(4);
    expect(container.textContent).toContain('12.34');
  } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
});
