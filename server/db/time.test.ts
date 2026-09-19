import { describe, expect, it } from 'vitest';
import { isFutureDatabaseTime } from './time';

describe('UTC security deadlines', () => {
  const now = Date.parse('2026-09-19T21:00:00Z');
  it('treats a SQL timestamp as UTC regardless of host timezone', () => {
    expect(isFutureDatabaseTime('2026-09-19 21:01:00', now)).toBe(true);
    expect(isFutureDatabaseTime('2026-09-19T21:01:00Z', now)).toBe(true);
    expect(isFutureDatabaseTime(new Date('2026-09-19T21:01:00Z'), now)).toBe(true);
  });
  it('expires at the exact boundary and rejects invalid timestamps', () => {
    expect(isFutureDatabaseTime('2026-09-19 21:00:00', now)).toBe(false);
    for (const value of [undefined, null, '', 'invalid', new Date(NaN)]) expect(isFutureDatabaseTime(value, now)).toBe(false);
  });
});
