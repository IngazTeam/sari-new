import { beforeEach, describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ critic: vi.fn(), fix: vi.fn(), validator: vi.fn(), metric: vi.fn() }));
vi.mock('./response-critic', () => ({ critiqueResponse: calls.critic, fixResponse: calls.fix, recordCritique: calls.metric }));
vi.mock('./response-validator', async original => ({ ...await original<typeof import('./response-validator')>(),
  validateResponse: calls.validator, recordValidation: vi.fn() }));
import { reviewSalesResponse } from './review-sales-response';
const input = { merchantId: 1, customerMessage: 'أحتاج تفاصيل السماعة', response: 'هذا الرد الأصلي عن السماعة.',
  intent: 'inquiring' as const, productNames: ['سماعة (230 ريال)'], conversationHistory: [] };
beforeEach(() => {
  vi.clearAllMocks();
  calls.critic.mockResolvedValue({ passed: true, failures: [], suggestions: '', score: 8 });
  calls.validator.mockResolvedValue({ passed: true, violations: [], validationTimeMs: 0 });
});
describe('shared fast and full sales quality gate', () => {
  it('returns the correction with fresh catalog context, not the unreviewed original', async () => {
    calls.critic.mockResolvedValue({ passed: false, failures: ['1: incomplete'], suggestions: 'Use catalog', score: 2 });
    calls.fix.mockResolvedValue('السماعة سعرها 230 ريال، مع التفاصيل المعتمدة.');
    expect(await reviewSalesResponse(input)).toBe('السماعة سعرها 230 ريال، مع التفاصيل المعتمدة.');
    expect(calls.fix).toHaveBeenCalledWith(expect.objectContaining({ productNames: input.productNames, merchantId: 1 }));
    expect(calls.validator).toHaveBeenCalledWith(expect.objectContaining({ response: 'السماعة سعرها 230 ريال، مع التفاصيل المعتمدة.' }));
    expect(calls.metric.mock.calls[0][1]).toBe(true);
  });
  it('does not preserve a critical original if a product guard rejects the correction', async () => {
    calls.validator.mockResolvedValue({ passed: false, violations: [{ rule: 'hallucinated_product', severity: 'critical' }],
      correctedResponse: 'تصحيح مرفوض' });
    const result = await reviewSalesResponse({ ...input, rejectCorrection: () => true });
    expect(result).not.toBe(input.response); expect(result).toContain('أتحقق');
  });
  it('returns an unconfirmed-details reply when the validator throws', async () => {
    calls.validator.mockRejectedValue(new Error('timeout'));
    expect(await reviewSalesResponse(input)).toContain('أتحقق');
  });
  it('rejects a claimed action even when both model reviewers accept it', async () => {
    expect(await reviewSalesResponse({ ...input, response: 'تم إنشاء طلبك الآن' })).toContain('لم يتم تنفيذ');
  });
  it('honors a refusal without calling a reviewer or suggesting another sale', async () => {
    expect(await reviewSalesResponse({ ...input, customerMessage: 'لا أريد الشراء' })).toContain('لن أكمل');
    expect(calls.critic).not.toHaveBeenCalled(); expect(calls.validator).not.toHaveBeenCalled();
  });
  it('runs the validator even if the critic is unavailable', async () => {
    calls.critic.mockRejectedValue(new Error('critic unavailable'));
    expect(await reviewSalesResponse(input)).toBe(input.response); expect(calls.validator).toHaveBeenCalledOnce();
  });
  it('does not rewrite from an unassessed score or bypass the independent validator', async () => {
    calls.critic.mockResolvedValue({ assessed: false, passed: false, score: 0, failures: [], suggestions: '' });
    expect(await reviewSalesResponse(input)).toBe(input.response);
    expect(calls.fix).not.toHaveBeenCalled(); expect(calls.validator).toHaveBeenCalledOnce();
  });
  it('does not rewrite a minor critic concern but still independently validates the reply', async () => {
    calls.critic.mockResolvedValue({ passed: false, failures: ['style'], suggestions: 'shorten', score: 7 });
    expect(await reviewSalesResponse(input)).toBe(input.response);
    expect(calls.fix).not.toHaveBeenCalled(); expect(calls.validator).toHaveBeenCalledOnce();
    expect(calls.metric).toHaveBeenCalledWith(expect.anything(), false);
  });
  it('keeps an accurate product response when a critic correction wrongly denies the catalog', async () => {
    calls.critic.mockResolvedValue({ passed: false, failures: ['style'], suggestions: 'rewrite', score: 2 });
    calls.fix.mockResolvedValue('لا يوجد هذا المنتج');
    const reject = vi.fn().mockReturnValue(true);
    expect(await reviewSalesResponse({ ...input, rejectCorrection: reject })).toBe(input.response);
    expect(reject).toHaveBeenCalledWith('لا يوجد هذا المنتج', input.response);
    expect(calls.validator).toHaveBeenCalledWith(expect.objectContaining({ response: input.response }));
  });
});
