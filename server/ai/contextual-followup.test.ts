import { describe, expect, it, vi } from 'vitest';
vi.mock('./openai', () => ({ callGPT4: vi.fn() }));
import { validateUnderstanding, type UnderstandingInput } from './conversation-understanding';
import { resolveContextualFollowup } from './contextual-followup';
import { defaultFollowupPolicy as policy } from '../../shared/followup-policy';
import { followupUnderstandingFixture as fixture } from '../tests/helpers/followup-understanding-fixture';

const source = new Date('2026-09-23T09:00:00.000Z');
const input: UnderstandingInput = { currentMessageId: 3, catalog: [], targets: [],
  messages: [{ id: 1, role: 'user', content: 'دوامي اليوم طويل' }, { id: 2, role: 'assistant', content: 'أتابع معك الخميس 24 سبتمبر الساعة 17:00 بتوقيت الرياض؟' },
    { id: 3, role: 'user', content: 'تمام، هذا الوقت مناسب' }], followupClock: { sourceCreatedAt: source.toISOString(), timeZone: 'Asia/Riyadh' } };
const resolve = (value = fixture(input), now = source) => resolveContextualFollowup(value, source, policy, now);

describe('contextual follow-up calendar and consent contract (synthetic model outputs)', () => {
  it('resolves consent to the previous assistant proposal with no reminder keyword', () => {
    const result = validateUnderstanding(JSON.stringify(fixture(input, { evidence: [
      { messageId: 2, excerpt: input.messages[1].content }, { messageId: 3, excerpt: input.messages[2].content }] })), input);
    expect(resolve(result)).toEqual({ kind: 'requested', at: new Date('2026-09-24T14:00:00Z') });
  });
  it('never falls back to keywords if the model says none or the old analysis has no field', () => {
    const old = fixture(input); delete old.followup;
    expect(resolve(old)).toBeNull(); expect(resolveContextualFollowup(undefined, source, policy, source)).toBeNull();
    expect(resolve(fixture(input, { status: 'none' }))).toBeNull();
  });
  it.each([{ confidence: 0.84 }, { conditional: true }, { ambiguous: true }, { intent: 'declined' as const }, { action: 'request_purchase' as const }, { action: 'request_human' as const }, { nextStep: 'handoff' as const }, { nextStep: 'respect_decline' as const }])
    ('does not schedule with unsafe interpretation %j', change => expect(resolve(fixture(input, {}, change))).toEqual({ kind: 'clarify' }));
  it.each([{ localDate: null }, { localTime: null }, { localDate: '2026-09-31' }, { localTime: '25:00' }, { localDate: '2026-09-22' },
    { localDate: '2027-01-01' }, { localTime: '23:00' }, { timeZone: 'Asia/Dubai' }, { sourceCreatedAt: '2026-09-22T09:00:00.000Z' }, { status: 'clarify' as const }])
    ('asks for clarification for unusable time %j', change => expect(resolve(fixture(input, change))).toEqual({ kind: 'clarify' }));
  it('never shifts an expired requested date to another day on retry', () => {
    expect(resolve(fixture(input), new Date('2026-09-25T09:00Z'))).toEqual({ kind: 'clarify' });
    expect(resolveContextualFollowup(fixture(input), source, { ...policy, enabled: false }, source)).toEqual({ kind: 'clarify' });
  });
  it.each(['2026-03-08', '2026-11-01'])('rejects the missing/repeated DST hour on %s', date => {
    const reference = new Date(date === '2026-03-08' ? '2026-03-07T12:00Z' : '2026-10-31T12:00Z');
    const analysis = fixture(input, { localDate: date, localTime: date === '2026-03-08' ? '02:30' : '01:30', timeZone: 'America/New_York', sourceCreatedAt: reference.toISOString() });
    expect(resolveContextualFollowup(analysis, reference, { ...policy, timeZone: 'America/New_York', startHour: 0, endHour: 24 }, reference)).toEqual({ kind: 'clarify' });
  });
  it.each([{ sourceCreatedAt: '2026-09-22T09:00:00.000Z' }, { timeZone: 'UTC' }, { localDate: null }, { localTime: null },
    { evidence: [{ messageId: 2, excerpt: input.messages[1].content }] }, { evidence: [{ messageId: 3, excerpt: 'ذكرني' }] },
    { evidence: [{ messageId: 3, excerpt: input.messages[2].content }, { messageId: 99, excerpt: 'موافقة حساب آخر' }] }])
    ('rejects ungrounded model timing/authority %j before storing it', change => {
      expect(() => validateUnderstanding(JSON.stringify(fixture(input, change)), input)).toThrow();
    });
  it('does not grant scheduling authority to preview history without a trusted clock', () => {
    expect(() => validateUnderstanding(JSON.stringify(fixture(input)), { ...input, mode: 'preview', followupClock: undefined })).toThrow();
  });
  it('does not combine a follow-up request with an implicit staff handoff', () => {
    expect(() => validateUnderstanding(JSON.stringify(fixture(input, {}, { nextStep: 'handoff' })), input)).toThrow();
  });
});
