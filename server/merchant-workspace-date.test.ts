import { describe, expect, it } from 'vitest';
import { merchantDateTimeInput, parseMerchantDate } from '../client/src/lib/merchant-date';

describe('merchant timestamp display and schedule editing', () => {
  it.each(['2027-01-01 12:30:00', '2027-01-01T12:30:00Z', '2027-01-01T15:30:00+03:00', new Date('2027-01-01T12:30:00Z')])('preserves the same absolute time for %s', value => {
    expect(parseMerchantDate(value).toISOString()).toBe('2027-01-01T12:30:00.000Z');
  });
  it('round trips a stored UTC schedule through a local datetime form without shifting it', () => {
    const formValue = merchantDateTimeInput('2027-01-01 12:30:00');
    expect(new Date(formValue).toISOString()).toBe('2027-01-01T12:30:00.000Z');
  });
  it('shows the next Riyadh calendar day for a late UTC knowledge timestamp', () => {
    expect(parseMerchantDate('2026-09-28 23:30:00').toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh' })).toBe('29/09/2026');
  });
  it('does not create a date for absent or invalid schedules', () => {
    expect(merchantDateTimeInput(null)).toBe('');
    expect(merchantDateTimeInput('invalid')).toBe('');
  });
});
