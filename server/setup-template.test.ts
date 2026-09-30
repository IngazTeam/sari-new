import { describe, expect, it } from 'vitest';
import { setupTemplatePreview, setupTemplatePatch } from '../shared/setup-template';
import { setupCatalogDraft } from '../shared/setup-catalog';
const template = (patch = {}) => ({ id: 7, is_active: 1, template_name: 'قالب', description: '', products: JSON.stringify([{ name: 'منتج', price: '12.34' }]), services: JSON.stringify([{ name: 'خدمة', price: 0, durationMinutes: 60, category: 'عناية' }]), working_hours: JSON.stringify({ sunday: { open: '09:00', close: '18:00', isOpen: true } }), bot_personality: JSON.stringify({ tone: 'friendly', language: 'ar', welcomeMessage: 'أهلاً' }), ...patch });
describe('setup template read-only proposal and choices', () => {
  it('normalizes display and translated assistant fields without changing the source', () => {
    const source = template({ templateName: 'Translated', botPersonality: JSON.stringify({ tone: 'professional', language: 'en', welcomeMessage: 'Hello' }) });
    const original = structuredClone(source); const preview = setupTemplatePreview(source);
    expect(preview.title).toBe('Translated'); expect(preview.assistant).toMatchObject({ welcomeMessage: 'Hello', language: 'en' });
    expect(preview.products[0]).toMatchObject({ price: '12.34', currency: 'SAR' });
    expect(preview.services[0]).toMatchObject({ price: '0.00', durationMinutes: 60, category: 'عناية' });
    expect(source).toEqual(original);
  });
  it.each([{ is_active: 0 }, { products: '{' }, { products: '{}' }, { services: JSON.stringify([{ name: 'Missing price' }]) }, { products: JSON.stringify(Array.from({ length: 101 }, () => ({ name: 'A', price: 1 }))) }, { working_hours: JSON.stringify({ sunday: { open: '25:00', close: '18:00', isOpen: true } }) }, { bot_personality: JSON.stringify({ autoReply: true }) }])('rejects invalid template data before producing a draft: %j', patch => {
    expect(() => setupTemplatePreview(template(patch))).toThrow();
  });
  it('merges into the existing draft without overwriting unrelated fields or applying optional settings', () => {
    const preview = setupTemplatePreview(template());
    const draft = { businessName: 'Owner name', botTone: 'casual', workingHours: { old: true }, products: [{ id: 'manual', name: '', price: '3' }] };
    const original = structuredClone(draft);
    const patch = setupTemplatePatch(draft, preview, { catalog: 'merge', assistant: false, workingHours: false });
    expect(patch).not.toHaveProperty('businessName'); expect(patch).not.toHaveProperty('botTone'); expect(patch).not.toHaveProperty('workingHours');
    expect((patch.products as unknown[])[0]).toEqual(draft.products[0]); expect(draft).toEqual(original);
    expect(setupTemplatePatch({ ...draft, ...patch }, preview, { catalog: 'merge', assistant: false, workingHours: false })).toEqual(patch);
  });
  it('requires explicit replacement and explicit assistant/hours choices', () => {
    const preview = setupTemplatePreview(template());
    const patch = setupTemplatePatch({ products: null, botTone: 'casual' }, preview, { catalog: 'replace', assistant: true, workingHours: true });
    expect(patch.products).toEqual(preview.products); expect(patch).toMatchObject({ botTone: 'friendly', botLanguage: 'ar', welcomeMessage: 'أهلاً', workingHoursType: 'custom', workingHours: preview.workingHours });
    expect(setupCatalogDraft.parse(patch).services[0]).toMatchObject({ priceMinor: 0, durationMinutes: 60, category: 'عناية' });
  });
  it('blocks invalid merge structure and over-limit combinations without dropping old rows', () => {
    const preview = setupTemplatePreview(template());
    expect(() => setupTemplatePatch({ products: null }, preview, { catalog: 'merge', assistant: false, workingHours: false })).toThrow('SETUP_TEMPLATE_DRAFT_INVALID');
    expect(() => setupTemplatePatch({ products: Array.from({ length: 100 }, () => ({ name: 'old' })) }, preview, { catalog: 'merge', assistant: false, workingHours: false })).toThrow('SETUP_TEMPLATE_LIMIT');
  });
  it('can keep existing catalog entirely and applies no arbitrary template settings', () => {
    const preview = setupTemplatePreview(template({ settings: '{"autoReply":true}' }));
    const patch = setupTemplatePatch({ products: null }, preview, { catalog: 'skip', assistant: false, workingHours: false });
    expect(patch).toEqual({ templateId: 7 });
  });
  it.each(['', '0', '-1', '1.5', '1441', '1e2'])('rejects invalid service duration %s instead of defaulting it', durationMinutes => {
    expect(setupCatalogDraft.safeParse({ services: [{ name: 'Service', price: '1', durationMinutes }] }).success).toBe(false);
  });
});
