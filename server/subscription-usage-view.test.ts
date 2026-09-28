import { expect, it } from 'vitest';
import { subscriptionDaysRemaining, subscriptionEndsAt, subscriptionPlanFeatures, subscriptionQuota } from '../shared/subscription-usage';
it('keeps unlimited, zero allowance, over-limit, and missing limits distinct', () => {
  expect(subscriptionQuota(45, -1)).toMatchObject({ known: true, unlimited: true, percentage: null, remaining: null });
  expect(subscriptionQuota(0, 0)).toMatchObject({ known: true, limit: 0, percentage: 0, remaining: 0 });
  expect(subscriptionQuota(150, 100)).toMatchObject({ used: 150, percentage: 100, remaining: 0 });
  expect(subscriptionQuota(0, undefined)).toEqual({ known: false });
  expect(subscriptionQuota(-1, 100)).toEqual({ known: false });
});
it('does not crash on non-array JSON plan features or render objects as children', () => {
  expect(subscriptionPlanFeatures('{"feature":true}')).toEqual([]);
  expect(subscriptionPlanFeatures('null')).toEqual([]);
  expect(subscriptionPlanFeatures('["support",null,{},"",12]')).toEqual(['support']);
  expect(subscriptionPlanFeatures('Support by email')).toEqual(['Support by email']);
});
it('uses the earlier trial end and rounds remaining partial days without negative days', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');
  const subscription = { status: 'trial', endDate: '2026-10-28T12:00:00Z', trialEndsAt: '2026-09-29T13:00:00Z' };
  expect(subscriptionDaysRemaining(subscription, now)).toBe(2);
  expect(subscriptionEndsAt(subscription)).toBe(subscription.trialEndsAt);
  const endsFirst = { ...subscription, endDate: '2026-09-29T00:00:00Z' };
  expect(subscriptionDaysRemaining(endsFirst, now)).toBe(1);
  expect(subscriptionEndsAt(endsFirst)).toBe(endsFirst.endDate);
  expect(subscriptionEndsAt({ ...subscription, endDate: 'invalid' })).toBeNull();
  expect(subscriptionDaysRemaining({ ...subscription, status: 'active' }, now)).toBe(30);
  expect(subscriptionDaysRemaining({ ...subscription, trialEndsAt: '2026-09-27T12:00:00Z' }, now)).toBe(0);
});
