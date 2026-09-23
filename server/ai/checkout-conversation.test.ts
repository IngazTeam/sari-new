import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), llm: vi.fn(), prepare: vi.fn(), coupon: vi.fn(), accept: vi.fn() }));
vi.mock('../db/connection', () => ({ getPool: async () => ({ execute: mocks.query }) }));
vi.mock('./openai', () => ({ callGPT4: mocks.llm }));
vi.mock('./checkout-agreements', async original => ({ ...await original<typeof import('./checkout-agreements')>(), prepareCheckoutQuote: mocks.prepare, prepareCheckoutCouponQuote:mocks.coupon, acceptCheckoutQuote: mocks.accept }));
import { handleLocalCheckout } from './checkout-conversation';
const input = { merchantId: 1, conversationId: 3, incomingMessageId: 5, customerPhone: 'synthetic', message: 'أريد شراء 3 سماعات' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockImplementation(async (sql: string) => [sql.includes('FROM products') ? [{ id: 7, name: 'سماعة' }] : []]);
  mocks.prepare.mockResolvedValue({ kind: 'quote', text: 'saved quote' });
  mocks.accept.mockResolvedValue({ kind: 'order', text: 'recorded order' });
  mocks.coupon.mockResolvedValue({kind:'quote',text:'new discounted offer requires consent'});
});
describe('local checkout routing', () => {
  it.each(['طبق الكود LOCAL10','أزل الخصم','apply code REWARDS10'])('routes %s without model extraction or automatic acceptance',async message=>{
    expect(await handleLocalCheckout({...input,message})).toBe('new discounted offer requires consent');expect(mocks.coupon).toHaveBeenCalledWith({...input,message});
    expect(mocks.llm).not.toHaveBeenCalled();expect(mocks.accept).not.toHaveBeenCalled();
  });
  it('does not drop a coupon mentioned in a combined purchase instruction',async()=>{
    expect(await handleLocalCheckout({...input,message:'أريد شراء 3 سماعات بكود LOCAL10'})).toContain('بعد ملخصها');expect(mocks.llm).not.toHaveBeenCalled();expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('does not claim application or blindly retry after coupon storage failure',async()=>{
    mocks.coupon.mockRejectedValueOnce(Error('lost acknowledgement'));const text=await handleLocalCheckout({...input,message:'طبق الكود LOCAL10'});
    expect(text).toContain('تعذر تجهيز');expect(mocks.coupon).toHaveBeenCalledTimes(1);expect(mocks.accept).not.toHaveBeenCalled();expect(mocks.llm).not.toHaveBeenCalled();
  });
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
