import { expect, it } from 'vitest';
import { assertPlanChangeSnapshot } from './subscriptions/plan-change-snapshot';
const now = new Date('2026-10-16T00:00:00Z');
const row = { plan_id: 1, billing_cycle: 'monthly', status: 'active', start_date: '2026-10-01 00:00:00', end_date: '2026-10-31 00:00:00' };
const meta = { previousPlanId: 1, previousBillingCycle: 'monthly', previousStatus: 'active', previousStartDate: '2026-10-01T00:00:00.000Z', previousEndDate: '2026-10-31T00:00:00.000Z' };
it('matches canonical UTC timestamp representations and ignores usage counters', () => {
  expect(() => assertPlanChangeSnapshot({ ...row, conversations_used: 123 }, meta, now)).not.toThrow();
});
it('allows a matching trial without a plan', () => {
  expect(() => assertPlanChangeSnapshot({ ...row, plan_id: null, status: 'trial' }, { ...meta, previousPlanId: null, previousStatus: 'trial' }, now)).not.toThrow();
});
it.each([
  { previousPlanId: undefined }, { previousPlanId: -1 }, { previousPlanId: 1.5 }, { previousPlanId: '1' }, { previousPlanId: null },
  { previousBillingCycle: 'weekly' }, { previousStatus: 'cancelled' },
  { previousStartDate: 'invalid' }, { previousEndDate: 'invalid' }, { previousEndDate: '2026-02-30' },
  { previousPlanId: 2 }, { previousBillingCycle: 'yearly' }, { previousStatus: 'trial' },
])('rejects missing, malformed or stale reviewed state %j', change => {
  expect(() => assertPlanChangeSnapshot(row, { ...meta, ...change }, now)).toThrow('SUBSCRIPTION_PLAN_CHANGE_CONFLICT');
});
it.each([new Date('invalid'), new Date('2026-09-30'), new Date('2026-10-31')])('rejects invalid or out-of-period completion clocks %s', date => {
  expect(() => assertPlanChangeSnapshot(row, meta, date)).toThrow();
});
it('rejects a missing subscription or a changed date', () => {
  expect(() => assertPlanChangeSnapshot(undefined, meta, now)).toThrow();
  expect(() => assertPlanChangeSnapshot({ ...row, end_date: '2026-11-30 00:00:00' }, meta, now)).toThrow();
});
