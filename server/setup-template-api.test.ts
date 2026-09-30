import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ merchant: vi.fn(), template: vi.fn(), write: vi.fn() }));
vi.mock('./db', () => ({ getMerchantByUserId: m.merchant, getBusinessTemplateByIdWithTranslations: m.template, createProduct: m.write, createService: m.write, updateMerchant: m.write, updateBotSettings: m.write, incrementTemplateUsage: m.write }));
import { setupWizardRouter } from './routers-setup-wizard';
const caller = () => setupWizardRouter.createCaller({ user: { id: 4, role: 'user' }, req: { headers: { 'x-merchant-id': '21' } }, res: {} } as any);
beforeEach(() => { vi.clearAllMocks(); m.merchant.mockResolvedValue({ id: 21 }); m.template.mockResolvedValue({ id: 7, is_active: 1, template_name: 'Test', description: null, products: '[{"name":"Sample","price":1}]', services: '[]', working_hours: null, bot_personality: null }); });
it('reads a scoped template preview without writing any live catalog or settings', async () => {
  const result = await caller().previewTemplate({ templateId: 7, language: 'en' });
  expect(m.merchant).toHaveBeenCalledWith(4); expect(m.template).toHaveBeenCalledWith(7, 'en');
  expect(result.products[0]).toMatchObject({ name: 'Sample', price: '1.00' }); expect(m.write).not.toHaveBeenCalled();
});
it('rejects missing merchant, inactive template and invalid data before any write', async () => {
  m.merchant.mockResolvedValueOnce(null); await expect(caller().previewTemplate({ templateId: 7, language: 'ar' })).rejects.toMatchObject({ code: 'NOT_FOUND' }); expect(m.template).not.toHaveBeenCalled();
  m.template.mockResolvedValueOnce({ is_active: 0 }); await expect(caller().previewTemplate({ templateId: 7, language: 'ar' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  m.template.mockResolvedValueOnce({ id: 7, is_active: 1 }); await expect(caller().previewTemplate({ templateId: 7, language: 'ar' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: 'SETUP_TEMPLATE_INVALID' }); expect(m.write).not.toHaveBeenCalled();
});
it('retires the early write route and rejects client-provided catalog data', async () => {
  expect(setupWizardRouter._def.procedures).not.toHaveProperty('applyTemplate');
  await expect(caller().previewTemplate({ templateId: 7, language: 'ar', products: [] } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(m.write).not.toHaveBeenCalled();
});
