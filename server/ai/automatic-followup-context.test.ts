import { describe, expect, it, vi } from 'vitest';
vi.mock('./openai', () => ({ callGPT4: vi.fn() }));
import { validateUnderstanding, type UnderstandingInput } from './conversation-understanding';
import { resolveAutomaticFollowup } from './automatic-followup-context';
import { automaticFollowupFixture as fixture } from '../tests/helpers/automatic-followup-fixture';
const clock = new Date('2026-09-29T09:00:00.000Z');
const input: UnderstandingInput = { currentMessageId: 3, catalog: [], targets: [], automaticFollowupAllowed: true,
  followupClock: { sourceCreatedAt: clock.toISOString(), timeZone: 'Asia/Riyadh' }, messages: [
    { id: 1, role: 'user', content: 'أقارن دورة مناسبة لميزانيتي' },
    { id: 2, role: 'assistant', content: 'هذه فروق الخيارات المتاحة.' },
    { id: 3, role: 'user', content: 'وضحت الصورة، بأراجع الخيارات مع شريكي' }] };
describe('automatic follow-up interpretation contract (synthetic output)', () => {
  it('resolves the next contact purpose and delay from centrally interpreted conversation', () => {
    const result = validateUnderstanding(JSON.stringify(fixture(input)), input);
    expect(resolveAutomaticFollowup(result, clock)).toMatchObject({ purpose: 'price', due: new Date('2026-09-29T10:00:00.000Z') });
  });
  it.each(['consideration', 'options', 'price', 'trust', 'comparison', 'delivery', 'question'] as const)('uses a grounded %s question with opt-out, without financial assertions', purpose => {
    const value = fixture(input); value.automaticFollowup!.purpose = purpose;
    const result = resolveAutomaticFollowup(value, clock)!;
    expect(result.text).toContain('إلغاء الاشتراك');
    expect(result.text).not.toMatch(/الدفع ما اكتمل|رابط دفع جديد|سلة متروكة|خصم حصري/);
  });
  it.each(['no consent', 'preview', 'refusal', 'conditional', 'ambiguous', 'low confidence', 'post purchase', 'handoff', 'purchase', 'requested date', 'reminder', 'foreign evidence', 'assistant evidence', 'no delay', 'unsupported purpose'])('rejects %s', attack => {
    const value = fixture(input); const context = { ...input };
    if (attack === 'no consent') context.automaticFollowupAllowed = false;
    if (attack === 'preview') context.mode = 'preview';
    if (attack === 'refusal') value.intent = 'declined';
    if (attack === 'conditional') value.conditional = true;
    if (attack === 'ambiguous') value.ambiguous = true;
    if (attack === 'low confidence') value.confidence = .4;
    if (attack === 'post purchase') value.intent = 'post_purchase';
    if (attack === 'handoff') value.nextStep = 'handoff';
    if (attack === 'purchase') value.action = 'request_purchase';
    if (attack === 'requested date') value.followup = { status: 'clarify', localDate: null, localTime: null, timeZone: null, sourceCreatedAt: null, evidence: value.evidence };
    if (attack === 'reminder') value.appointmentReminder = { status: 'clarify', appointmentId: null, hoursBefore: null, evidence: value.evidence };
    if (attack === 'foreign evidence') value.automaticFollowup!.evidence = [{ messageId: 9999, excerpt: 'نعم' }];
    if (attack === 'assistant evidence') value.automaticFollowup!.evidence = [{ messageId: 2, excerpt: input.messages[1].content }];
    if (attack === 'no delay') value.automaticFollowup!.delayHours = null;
    if (attack === 'unsupported purpose') (value.automaticFollowup as any).purpose = 'recovery_payment';
    expect(() => validateUnderstanding(JSON.stringify(value), context)).toThrow();
  });
  it('never invents a recommendation for old, missing or none analysis', () => {
    const result = fixture(input); delete result.automaticFollowup;
    expect(resolveAutomaticFollowup(result, clock)).toBeNull();
    expect(resolveAutomaticFollowup(undefined, clock)).toBeNull();
    result.automaticFollowup = { status: 'none', purpose: null, delayHours: null, evidence: [] };
    expect(resolveAutomaticFollowup(result, clock)).toBeNull();
  });
});
