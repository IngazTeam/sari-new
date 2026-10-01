import { describe, expect, it } from 'vitest';
import { campaignScheduleField, resolveCampaignSchedule } from '../shared/campaign-schedule';
const now = new Date('2026-01-01T00:00:00Z');
describe('campaign wall clock scheduling in the merchant timezone', () => {
  it('preserves exact seconds and converts Riyadh independently of browser timezone', () => {
    expect(campaignScheduleField('2026-10-01T12:00:27Z', 'Asia/Riyadh')).toBe('2026-10-01T15:00:27');
    expect(resolveCampaignSchedule('2026-10-01T15:00:27', 'Asia/Riyadh', now)).toEqual({ status: 'valid', iso: '2026-10-01T12:00:27.000Z' });
  });
  it('supports minute fields and non-hour timezone offsets', () => {
    expect(resolveCampaignSchedule('2026-10-01T15:00', 'Asia/Kathmandu', now)).toEqual({ status: 'valid', iso: '2026-10-01T09:15:00.000Z' });
    expect(campaignScheduleField('2026-10-01T09:15:00Z', 'Asia/Kathmandu')).toBe('2026-10-01T15:00:00');
  });
  it.each([
    ['2026-03-08T02:30', 'America/New_York', 'nonexistent'],
    ['2026-11-01T01:30', 'America/New_York', 'ambiguous'],
    ['2026-04-05T01:45', 'Australia/Lord_Howe', 'ambiguous'],
    ['2026-10-04T02:15', 'Australia/Lord_Howe', 'nonexistent'],
  ])('rejects %s in %s as %s rather than silently shifting it', (value, zone, issue) => {
    expect(resolveCampaignSchedule(value, zone, now)).toEqual({ status: 'invalid', issue });
  });
  it.each(['2026-02-30T12:00', '2026-13-01T12:00', '2026-10-01T24:00', '2026-10-01T12:61', '2026-10-01', '2026-10-01T12:00Z', ' 2026-10-01T12:00', '2026-10-01T12:00:00.000'])('rejects malformed wall clock %s', value => {
    expect(resolveCampaignSchedule(value, 'UTC', now)).toEqual({ status: 'invalid', issue: 'invalid_schedule' });
  });
  it('allows removal of a schedule without requiring a timezone', () => {
    expect(resolveCampaignSchedule('', null, now)).toEqual({ status: 'empty' }); expect(campaignScheduleField(null, null)).toBe('');
  });
  it.each([null, 'Invalid/Zone'])('does not infer the browser timezone for %s', zone => {
    expect(resolveCampaignSchedule('2026-10-01T12:00', zone, now)).toEqual({ status: 'invalid', issue: 'invalid_timezone' });
    expect(campaignScheduleField('2026-10-01T12:00:00Z', zone)).toBeNull();
  });
  it('enforces the exact database maximum after converting the zone', () => {
    expect(resolveCampaignSchedule('2038-01-19T06:14:07', 'Asia/Riyadh', now)).toEqual({ status: 'valid', iso: '2038-01-19T03:14:07.000Z' });
    expect(resolveCampaignSchedule('2038-01-19T06:14:08', 'Asia/Riyadh', now)).toEqual({ status: 'invalid', issue: 'out_of_range' });
  });
  it.each(['2025-12-31T23:59:59', '2026-01-01T00:00:00'])('refuses elapsed or immediate schedule %s', value => {
    expect(resolveCampaignSchedule(value, 'UTC', now)).toEqual({ status: 'invalid', issue: 'past' });
  });
  it('does not invent a schedule from malformed source time or capture clock', () => {
    expect(campaignScheduleField('not-a-time', 'UTC')).toBeNull(); expect(campaignScheduleField('2026-10-01 12:00:00', 'UTC')).toBeNull();
    expect(resolveCampaignSchedule('2026-10-01T12:00', 'UTC', new Date(NaN))).toEqual({ status: 'invalid', issue: 'invalid_schedule' });
  });
});
