import { describe, expect, it } from 'vitest';
import { defaultFollowupPolicy as defaults, followupPolicySchema, isFollowupTimeAllowed, nextFollowupSendTime,
  resolveZonedWallTime } from '../../shared/followup-policy';
import { parseRequestedFollowupTime } from './requested-followup-time';

describe('follow-up policy clock and validation', () => {
  it.each([{ timeZone: 'Europe/Imaginary' }, { timeZone: '' }, { startHour: 18, endHour: 9 }, { startHour: 8, endHour: 8 },
    { startHour: -1 }, { endHour: 25 }, { weeklyLimit: 0 }, { weeklyLimit: 4 }, { weeklyLimit: 1.5 }, { merchantId: 7 }])
    ('rejects invalid or unexpected settings %j', patch => {
      expect(followupPolicySchema.safeParse({ ...defaults, ...patch }).success).toBe(false);
    });
  it.each([['2026-09-23T04:59:59Z', false], ['2026-09-23T05:00:00Z', true],
    ['2026-09-23T19:59:59Z', true], ['2026-09-23T20:00:00Z', false]])('uses an inclusive start and exclusive end at %s', (at, allowed) => {
    expect(isFollowupTimeAllowed(defaults, new Date(at))).toBe(allowed);
  });
  it('uses the configured timezone and supports fractional-hour UTC offsets', () => {
    const at = new Date('2026-09-23T05:00:00Z');
    expect(isFollowupTimeAllowed(defaults, at)).toBe(true);
    expect(isFollowupTimeAllowed({ ...defaults, timeZone: 'America/New_York' }, at)).toBe(false);
    expect(nextFollowupSendTime({ ...defaults, timeZone: 'Asia/Kathmandu' }, new Date('2026-09-23T00:00:00Z'))?.toISOString())
      .toBe('2026-09-23T02:15:00.000Z');
  });
  it('does not schedule disabled or invalid-clock follow-ups', () => {
    expect(nextFollowupSendTime({ ...defaults, enabled: false })).toBeNull();
    expect(nextFollowupSendTime(defaults, new Date('invalid'))).toBeNull();
    expect(isFollowupTimeAllowed(defaults, new Date('invalid'))).toBe(false);
  });
  it('resolves DST gaps and repeated local clock times without guessing', () => {
    expect(resolveZonedWallTime(new Date('2026-03-08T02:30:00Z'), 'America/New_York')).toEqual([]);
    expect(resolveZonedWallTime(new Date('2026-11-01T01:30:00Z'), 'America/New_York').map(at => at.toISOString()))
      .toEqual(['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']);
    expect(nextFollowupSendTime({ ...defaults, timeZone: 'America/New_York', startHour: 2, endHour: 4 }, new Date('2026-03-08T06:59:00Z'))?.toISOString())
      .toBe('2026-03-08T07:00:00.000Z');
  });
  it.each([['2026-03-07T12:00:00Z', 'remind me tomorrow at 02:30'], ['2026-10-31T12:00:00Z', 'remind me tomorrow at 01:30']])
    ('asks for clarification for a nonexistent or repeated appointment at %s', (now, text) => {
      expect(parseRequestedFollowupTime(text, new Date(now), new Date(now), { ...defaults, timeZone: 'America/New_York', startHour: 0, endHour: 24 }))
        .toEqual({ kind: 'clarify' });
    });
  it('anchors relative dates to the merchant clock and refuses to shift an exact requested time', () => {
    const source = new Date('2026-09-23T02:00:00Z'), policy = { ...defaults, timeZone: 'America/New_York' };
    expect(parseRequestedFollowupTime('remind me tomorrow at 10:00', source, source, policy))
      .toEqual({ kind: 'requested', at: new Date('2026-09-23T14:00:00Z') });
    expect(parseRequestedFollowupTime('remind me tomorrow at 07:00', source, source, policy)).toEqual({ kind: 'clarify' });
  });
});
