import { afterEach, describe, expect, it } from 'vitest';
import { scheduledDefinitionFields, scheduledWeeklySlot, scheduledMessagePreview, type ScheduledDefinition } from '../shared/scheduled-message-policy';
const definition: ScheduledDefinition = { title: 'Weekly update', message: 'Hello', dayOfWeek: 6, time: '12:00', timezone: 'Asia/Riyadh' };
const slot = (date: string, kind: 'next' | 'due' = 'next', patch: Partial<ScheduledDefinition> = {}) => scheduledWeeklySlot({ ...definition, ...patch }, new Date(date), kind);
const originalTZ = process.env.TZ;
afterEach(() => { if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ; });
describe('weekly scheduled wall clock policy', () => {
  it('resolves merchant local time with explicit admission and delivery windows', () => {
    expect(slot('2026-10-03T08:59:59.999Z')).toEqual({ status: 'ready', dueAt: '2026-10-03T09:00:00.000Z', expiresAt: '2026-10-04T09:00:00.000Z' });
    expect(slot('2026-10-03T09:00:00.000Z')).toMatchObject({ dueAt: '2026-10-10T09:00:00.000Z' });
    expect(slot('2026-10-03T09:00:00.001Z')).toMatchObject({ dueAt: '2026-10-10T09:00:00.000Z' });
    expect(slot('2026-10-03T09:00:00Z', 'due')).toMatchObject({ dueAt: '2026-10-03T09:00:00.000Z' });
    expect(slot('2026-10-03T09:14:59.999Z', 'due').status).toBe('ready');
    expect(slot('2026-10-03T09:15:00Z', 'due')).toEqual({ status: 'not_due' });
    expect(slot('2026-10-03T08:59:59Z', 'due')).toEqual({ status: 'not_due' });
  });
  it('crosses week, day and year boundaries without local process dates', () => {
    expect(slot('2026-10-03T21:00:00Z', 'due', { dayOfWeek: 0, time: '00:00' })).toMatchObject({ dueAt: '2026-10-03T21:00:00.000Z' });
    expect(slot('2026-12-31T23:59:00Z', 'next', { dayOfWeek: 0, time: '00:00', timezone: 'UTC' })).toMatchObject({ dueAt: '2027-01-03T00:00:00.000Z' });
    for (const zone of ['UTC', 'America/Los_Angeles', 'Pacific/Auckland']) {
      process.env.TZ = zone; expect(slot('2026-10-03T09:01:00Z', 'due')).toMatchObject({ dueAt: '2026-10-03T09:00:00.000Z' });
    }
  });
  it('handles non-hour offsets', () => {
    expect(slot('2026-10-03T00:00:00Z', 'next', { timezone: 'Asia/Kathmandu' })).toMatchObject({ dueAt: '2026-10-03T06:15:00.000Z' });
  });
  it('never silently selects nonexistent or repeated DST minutes', () => {
    expect(slot('2026-03-07T12:00:00Z', 'next', { dayOfWeek: 0, time: '02:30', timezone: 'America/New_York' })).toEqual({ status: 'invalid', reason: 'nonexistent' });
    expect(slot('2026-10-31T12:00:00Z', 'next', { dayOfWeek: 0, time: '01:30', timezone: 'America/New_York' })).toEqual({ status: 'invalid', reason: 'ambiguous' });
    for (const at of ['2026-11-01T05:31:00Z', '2026-11-01T06:31:00Z']) expect(slot(at, 'due', { dayOfWeek: 0, time: '01:30', timezone: 'America/New_York' })).toEqual({ status: 'invalid', reason: 'ambiguous' });
  });
  it.each([{ dayOfWeek: 1.2 }, { dayOfWeek: 7 }, { time: '99:99' }, { time: '12:60' }, { time: '1:00' }, { timezone: 'not/a-zone' }, { title: '  ' }, { message: '' }, { message: 'a'.repeat(3801) }])('rejects malformed definitions %#', patch => {
    expect(scheduledDefinitionFields.safeParse({ ...definition, ...patch }).success).toBe(false);
    expect(slot('2026-10-03T09:00:00Z', 'due', patch)).toEqual({ status: 'invalid', reason: 'definition' });
  });
  it('rejects invalid dates and occurrences whose delivery window exceeds storage range', () => {
    expect(slot('invalid')).toEqual({ status: 'invalid', reason: 'definition' });
    expect(slot('2038-01-18T00:00:00Z', 'next', { dayOfWeek: 2, timezone: 'UTC', time: '00:00' })).toEqual({ status: 'invalid', reason: 'out_of_range' });
  });
  it('shows exactly the outgoing opt-out text while normalizing only outer whitespace', () => {
    const normalized = scheduledDefinitionFields.parse({ ...definition, title: ' Weekly ', message: ' Hello\nfriend ' });
    expect(normalized.title).toBe('Weekly'); expect(normalized.message).toBe('Hello\nfriend');
    expect(scheduledMessagePreview(normalized)).toContain('Hello\nfriend'); expect(scheduledMessagePreview(normalized).length).toBeGreaterThan(normalized.message.length);
  });
});
