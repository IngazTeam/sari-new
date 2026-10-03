import { afterEach, expect, it, vi } from 'vitest';
import { scheduledActionTarget, scheduledActionApply, scheduledReceiptInput } from '../shared/scheduled-message-actions';
import { assertScheduledReviewTime } from './scheduled-message-actions';
const data = { title: 'Weekly', message: 'Hello', dayOfWeek: 2, time: '10:00', timezone: 'UTC' };
afterEach(() => vi.restoreAllMocks());
it.each([{ action: 'create', data: { ...data, isActive: true } }, { action: 'update', id: 0, data }, { action: 'toggle', id: 1, enabled: 1 }, { action: 'delete', id: 1, merchantId: 9 }, { action: 'create', data: { ...data, dayOfWeek: 1.1 } }, { action: 'create', data: { ...data, time: '99:99' } }])('refuses ambiguous or overposted action input %#', value => { expect(scheduledActionTarget.safeParse(value).success).toBe(false); });
it('requires a durable request identity and exact reviewed scope', () => {
  const value = { target: { action: 'create', data }, reviewRevision: 'a'.repeat(64), checkedAt: '2026-10-03T09:00:00.000Z', requestKey: 'edbc55c3-1d7e-48d0-9bfa-e84269037cf1' };
  expect(scheduledActionApply.safeParse(value).success).toBe(true); expect(scheduledActionApply.safeParse({ ...value, merchantId: 7 }).success).toBe(false);
  expect(scheduledReceiptInput.safeParse({ requestKey: 'guess' }).success).toBe(false);
});
it('bounds review age without preventing receipt recovery', () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-03T09:05:00Z'));
  expect(() => assertScheduledReviewTime('2026-10-03T09:00:00Z')).not.toThrow();
  for (const value of ['2026-10-03T08:59:59.999Z', '2026-10-03T09:05:00.001Z', 'invalid']) expect(() => assertScheduledReviewTime(value)).toThrow('stale');
});
