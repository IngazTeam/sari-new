// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import ar from '../client/src/locales/ar.json';
const api = vi.hoisted(() => ({ list: {} as any, preview: {} as any }));
vi.mock('@/lib/trpc', () => ({ trpc: { setupWizard: { getTemplates: { useQuery: () => api.list }, previewTemplate: { useQuery: () => api.preview } } } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'ar' }, t: (key: string, values: Record<string, unknown> = {}) => String(key.split('.').reduce((value: any, part) => value?.[part], ar) || key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? '')) }) }));
import TemplatesStep from '../client/src/pages/setup-wizard/TemplatesStep';
let root: Root, container: HTMLDivElement;
const update = vi.fn(), next = vi.fn(), skip = vi.fn();
const button = (text: string) => Array.from(container.querySelectorAll('button')).find(node => node.textContent?.trim() === text)!;
const click = (text: string) => act(async () => button(text).click());
const render = (data = {}) => act(async () => root.render(React.createElement(TemplatesStep, { wizardData: data, updateWizardData: update, goToNextStep: next, skipStep: skip })));
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  api.list = { data: [{ id: 7, template_name: 'قالب الاختبار', description: 'وصف' }], isLoading: false, isFetching: false, isError: false, refetch: vi.fn() };
  api.preview = { data: { id: 7, title: 'قالب الاختبار', description: '', products: [{ id: 'template-7-product-0', name: 'منتج القالب', price: '12.34', currency: 'SAR', description: '', category: '' }], services: [{ id: 'template-7-service-0', name: 'خدمة', price: '0.00', description: '', durationMinutes: 90, category: 'عام' }], assistant: { tone: 'professional', language: 'en', welcomeMessage: 'Welcome' }, workingHours: { sunday: { open: '10:00', close: '18:00', isOpen: true } } }, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it('previews all proposed values without modifying the draft until the explicit add action', async () => {
  await render({ products: [{ name: 'Current', price: '4' }], botTone: 'casual' });
  await click('قالب الاختباروصف');
  expect(update).not.toHaveBeenCalled(); expect(next).not.toHaveBeenCalled();
  expect(container.textContent).toContain('12.34 SAR'); expect(container.textContent).toContain('90'); expect(container.textContent).toContain('Welcome');
  await click(ar.setupTemplateUx.addDraft);
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ products: [expect.objectContaining({ name: 'Current' }), expect.objectContaining({ name: 'منتج القالب' })], services: [expect.objectContaining({ durationMinutes: 90, category: 'عام' })] }));
  expect(update.mock.calls[0][0]).not.toHaveProperty('botTone'); expect(update.mock.calls[0][0]).not.toHaveProperty('workingHours'); expect(next).toHaveBeenCalledOnce();
});
it('requires separate choices for assistant and working hours', async () => {
  await render(); await click('قالب الاختباروصف');
  await act(async () => Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).forEach(input => input.click()));
  await click(ar.setupTemplateUx.addDraft);
  expect(update.mock.calls[0][0]).toMatchObject({ botTone: 'professional', botLanguage: 'en', workingHoursType: 'custom', welcomeMessage: 'Welcome' });
});
it('keeps a failed query distinct from an empty list and disables cached preview approval', async () => {
  await render(); await click('قالب الاختباروصف');
  api.preview = { ...api.preview, isError: true }; await render();
  expect(container.textContent).toContain(ar.setupTemplateUx.previewFailed); expect(container.textContent).not.toContain('12.34'); expect(button(ar.setupTemplateUx.addDraft).disabled).toBe(true);
  api.list = { ...api.list, isError: true }; await render();
  expect(container.textContent).toContain(ar.setupTemplateUx.loadFailed); expect(container.textContent).not.toContain(ar.setupTemplateUx.empty);
});
it('does not overwrite a malformed draft through default merge, and back leaves it unchanged', async () => {
  await render({ products: null }); await click('قالب الاختباروصف'); await click(ar.setupTemplateUx.addDraft);
  expect(container.textContent).toContain(ar.setupTemplateUx.invalidDraft); expect(update).not.toHaveBeenCalled(); expect(next).not.toHaveBeenCalled();
  await click(ar.setupTemplateUx.back); expect(skip).toHaveBeenCalledOnce(); expect(update).not.toHaveBeenCalled();
});
