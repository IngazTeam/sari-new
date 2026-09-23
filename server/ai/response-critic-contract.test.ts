import { beforeEach, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ gpt: vi.fn() }));
vi.mock('./openai', () => ({ callGPT4: calls.gpt }));
import { critiqueResponse, recordCritique, getCritiqueStats } from './response-critic';
const input = { merchantId: 90201, customerMessage: 'هل يمكن توضيح تفاصيل الضمان لهذا المنتج؟',
  response: 'الضمان سنتان للأجزاء الأصلية وفق السياسة المرفقة.', conversationHistory: [], productNames: ['جهاز: 200 ريال'] };
beforeEach(() => { calls.gpt.mockReset(); });
it.each(['not json', '{}', '{"passed":true,"score":99,"suggestions":"","failures":[]}',
  '{"passed":"true","score":8,"suggestions":"","failures":[]}', '{"passed":true,"score":8,"suggestions":"","failures":["wrong price"]}'])('never marks invalid assessment %s as passed', async raw => {
  calls.gpt.mockResolvedValueOnce(raw);
  expect(await critiqueResponse(input)).toMatchObject({ assessed: false, passed: false });
});
it('marks provider failure and deliberate skip as unassessed, with no fictitious quality score counted', async () => {
  calls.gpt.mockRejectedValueOnce(new Error('unavailable'));
  const result = await critiqueResponse(input), before = getCritiqueStats();
  recordCritique(result, false);
  expect(getCritiqueStats()).toMatchObject({ total: before.total, passed: before.passed, notAssessed: before.notAssessed + 1 });
  expect(await critiqueResponse({ ...input, customerMessage: 'شكرا' })).toMatchObject({ assessed: false, passed: false });
  expect(calls.gpt).toHaveBeenCalledOnce();
});
it('accepts a valid assessment and gives the reviewer current reference prices', async () => {
  calls.gpt.mockResolvedValueOnce('{"passed":false,"score":2,"suggestions":"Correct the price","failures":["wrong price"]}');
  expect(await critiqueResponse(input)).toMatchObject({ assessed: true, passed: false, score: 2 });
  expect(calls.gpt.mock.calls[0][0][1].content).toContain('جهاز: 200 ريال');
});
