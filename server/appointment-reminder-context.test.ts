import { describe, expect, it, vi } from 'vitest';
vi.mock('./ai/openai', () => ({ callGPT4: vi.fn() }));
import { validateUnderstanding, type UnderstandingInput } from './ai/conversation-understanding';
import { contextualAppointmentReminderIntent } from './appointment-reminder-context';
import { reminderUnderstandingFixture as fixture } from './tests/helpers/reminder-understanding-fixture';
import type { ConversationUnderstanding } from './ai/conversation-understanding-context';

const input: UnderstandingInput = { currentMessageId: 3, catalog: [], targets: [], messages: [
  { id: 1, role: 'user', content: 'موعدي للتدريب غدًا' },
  { id: 2, role: 'assistant', content: 'موعدك A17 الساعة 10:00. أذكرك قبله بساعة؟' },
  { id: 3, role: 'user', content: 'هذا المناسب، اتفقنا' }],
  appointmentReminderTargets: [{ id: 17, service: 'تدريب', date: '2026-10-01', startTime: '10:00', canSchedule: true, hasPendingReminder: false, termsDigest: 'a'.repeat(64) }] };
const valid = () => validateUnderstanding(JSON.stringify(fixture(input, 17)), input);
describe('contextual appointment reminder contract (synthetic interpretation)', () => {
  it('resolves dialogue consent and attaches the current owned appointment digest on the server', () => {
    expect(fixture(input, 17).appointmentReminder).not.toHaveProperty('targetDigest');
    expect(valid().appointmentReminder?.targetDigest).toBe('a'.repeat(64));
    expect(contextualAppointmentReminderIntent(valid())).toEqual({ kind: 'schedule', appointmentId: 17, hours: 1 });
  });
  it('interprets cancelling a reminder independently of the appointment itself', () => {
    const value = validateUnderstanding(JSON.stringify(fixture(input, 17, 'cancel', null)), input);
    expect(contextualAppointmentReminderIntent(value)).toEqual({ kind: 'cancel', appointmentId: 17 });
  });
  it('does not use words as a fallback for none, old analysis or unavailable analysis', () => {
    const value = fixture(input, null, 'none', null);
    expect(contextualAppointmentReminderIntent(value)).toBeNull(); delete value.appointmentReminder;
    expect(contextualAppointmentReminderIntent(value)).toBeNull(); expect(contextualAppointmentReminderIntent()).toBeNull();
  });
  it.each([{ confidence: .5 }, { conditional: true }, { ambiguous: true }, { action: 'confirm_booking' }, { nextStep: 'handoff' }, { intent: 'declined' }])
    ('does not execute unsafe interpreted intent %j', change => {
      expect(contextualAppointmentReminderIntent({ ...valid(), ...change } as ConversationUnderstanding)).toEqual({ kind: 'clarify' });
    });
  it.each(['foreign target', 'unavailable target', 'fabricated evidence', 'assistant evidence only', 'wrong digest', 'missing hours', 'unsupported hours', 'preview', 'follow-up conflict', 'purchase conflict', 'conditional'])
    ('rejects %s before saving interpretation', attack => {
      const result = fixture(input, 17); const context = { ...input };
      if (attack === 'foreign target') result.appointmentReminder!.appointmentId = 99;
      if (attack === 'unavailable target') context.appointmentReminderTargets = [{ ...input.appointmentReminderTargets![0], canSchedule: false }];
      if (attack === 'fabricated evidence') result.appointmentReminder!.evidence[2].excerpt = 'ذكرني';
      if (attack === 'assistant evidence only') result.appointmentReminder!.evidence = [result.appointmentReminder!.evidence[1]];
      if (attack === 'wrong digest') result.appointmentReminder!.targetDigest = 'b'.repeat(64);
      if (attack === 'missing hours') result.appointmentReminder!.hoursBefore = null;
      if (attack === 'unsupported hours') (result.appointmentReminder as any).hoursBefore = 2;
      if (attack === 'preview') context.mode = 'preview';
      if (attack === 'follow-up conflict') result.followup = { status: 'clarify', localDate: null, localTime: null, timeZone: null, sourceCreatedAt: null, evidence: result.evidence };
      if (attack === 'purchase conflict') result.action = 'request_purchase';
      if (attack === 'conditional') result.conditional = true;
      expect(() => validateUnderstanding(JSON.stringify(result), context)).toThrow();
    });
  it('asks for clarification when only the appointment is known, without choosing a reminder interval', () => {
    const value = validateUnderstanding(JSON.stringify(fixture(input, 17, 'clarify', null)), input);
    expect(contextualAppointmentReminderIntent(value)).toEqual({ kind: 'clarify' });
  });
});
