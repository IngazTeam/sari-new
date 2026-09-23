import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), llm: vi.fn(), prepare: vi.fn(), accept: vi.fn() }));
vi.mock('../db/connection', () => ({ getPool: async () => ({ execute: mocks.query }) }));
vi.mock('./openai', () => ({ callGPT4: mocks.llm }));
vi.mock('./checkout-agreements', async original => ({ ...await original<typeof import('./checkout-agreements')>(), prepareCheckoutQuote: mocks.prepare, acceptCheckoutQuote: mocks.accept }));
import { handleLocalCheckout } from './checkout-conversation';
const input = { merchantId: 1, conversationId: 3, incomingMessageId: 5, customerPhone: 'synthetic', message: 'أريد شراء 3 سماعات' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockImplementation(async (sql: string) => [sql.includes('FROM products') ? [{ id: 7, name: 'سماعة' }] : []]);
  mocks.prepare.mockResolvedValue({ kind: 'quote', text: 'saved quote' });
  mocks.accept.mockResolvedValue({ kind: 'order', text: 'recorded order' });
});
describe('local checkout routing', () => {
  it('extracts structured quantities and returns a saved offer without claiming an order', async () => {
    mocks.llm.mockResolvedValue('[{"productId":7,"variantId":null,"quantity":3}]');
    expect(await handleLocalCheckout(input)).toBe('saved quote');
    expect(mocks.prepare).toHaveBeenCalledWith(input, [{ productId: 7, variantId: null, quantity: 3 }]);
    expect(mocks.accept).not.toHaveBeenCalled();
  });
  it.each(['[]', 'not json', '[{"productId":7,"quantity":1.5,"variantId":null}]', '[{"productId":7,"quantity":1,"variantId":null,"price":1}]'])('requires clarification for invalid extraction: %s', async raw => {
    mocks.llm.mockResolvedValue(raw); expect(await handleLocalCheckout(input)).toBeTruthy();
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.accept).not.toHaveBeenCalled();
  });
  it('does not call the model to reinterpret assent to a saved offer', async () => {
    mocks.query.mockResolvedValue([[{ id: 8, source_message_id: 4 }]]);
    expect(await handleLocalCheckout({ ...input, message: 'نعم' })).toBe('recorded order');
    expect(mocks.accept).toHaveBeenCalled(); expect(mocks.llm).not.toHaveBeenCalled();
  });
  it('does not retry creation or claim no order after losing a database acknowledgement', async () => {
    mocks.query.mockResolvedValue([[{ id: 8 }]]); mocks.accept.mockRejectedValue(new Error('unknown commit'));
    const response = await handleLocalCheckout({ ...input, message: 'نعم' });
    expect(response).toContain('مراجعة حالته'); expect(response).not.toContain('لم يُنشأ');
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.llm).not.toHaveBeenCalled();
  });
  it('leaves information questions to the reply engine', async () => {
    expect(await handleLocalCheckout({ ...input, message: 'كيف أطلب؟' })).toBeNull(); expect(mocks.llm).not.toHaveBeenCalled();
  });
});
