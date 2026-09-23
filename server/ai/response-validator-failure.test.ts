import { beforeEach, describe, expect, it, vi } from 'vitest';
const llm = vi.hoisted(() => vi.fn());
vi.mock('./openai', () => ({ callGPT4: llm }));
import { validateResponse } from './response-validator';
beforeEach(() => { llm.mockReset(); });
describe('validator failure handling', () => {
  it('does not return an unverified action when the correction provider fails', async () => {
    llm.mockRejectedValue(new Error('unavailable'));
    const result = await validateResponse({ response: 'تم إنشاء طلبك وتأكيد حجزك.', customerMessage: 'هل تم الطلب؟', intent: 'inquiring' });
    expect(result.passed).toBe(false); expect(result.correctedResponse).toContain('لم يتم تنفيذ');
  });
  it.each(['not json', '{invalid}', '{"wrong": []}', '{"violations": null}'])('does not treat invalid review output as a pass: %s', async output => {
    llm.mockResolvedValue(output);
    const result = await validateResponse({ response: 'هذه تفاصيل الخدمة المقترحة لتلبية احتياجك في التدريب.', customerMessage: 'ما تفاصيل الخدمة؟', intent: 'inquiring' });
    expect(result.passed).toBe(false); expect(result.correctedResponse).toContain('أتحقق');
  });
  it('rechecks a rewrite that repeats the forbidden action claim', async () => {
    llm.mockResolvedValue('تم إنشاء طلبك من جديد.');
    const result = await validateResponse({ response: 'تم إنشاء طلبك.', customerMessage: 'هل تم الطلب؟', intent: 'inquiring' });
    expect(result.correctedResponse).toContain('أتحقق');
  });
});
