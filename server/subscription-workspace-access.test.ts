import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ merchant: vi.fn(), cancel: vi.fn() }));
vi.mock('./db', () => ({ getMerchantByUserId: mocks.merchant }));
vi.mock('./subscriptions/cancel-subscription', () => ({ cancelCurrentSubscription: mocks.cancel, SubscriptionCancellationConflictError: class extends Error {} }));
import { merchantSubscriptionRouter } from './routers/subscriptions';
import { SubscriptionCancellationConflictError } from './subscriptions/cancel-subscription';
const context = { user: { id: 21, role: 'user' } } as any;
beforeEach(() => { vi.resetAllMocks(); mocks.merchant.mockResolvedValue({ id: 73 }); });
it('passes the reviewed identifier with the owner-resolved tenant', async () => {
  await merchantSubscriptionRouter.createCaller(context).cancelSubscription({ expectedSubscriptionId: 9 });
  expect(mocks.cancel).toHaveBeenCalledWith(73, 9, undefined);
});
it('keeps the existing object input compatible', async () => {
  await merchantSubscriptionRouter.createCaller(context).cancelSubscription({});
  expect(mocks.cancel).toHaveBeenCalledWith(73, undefined, undefined);
});
it('blocks requests without owner access before cancellation', async () => {
  mocks.merchant.mockResolvedValue(undefined);
  await expect(merchantSubscriptionRouter.createCaller(context).cancelSubscription({ expectedSubscriptionId: 9 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(mocks.cancel).not.toHaveBeenCalled();
});
it.each([{ expectedSubscriptionId: -1 }, { expectedSubscriptionId: 1.5 }, { reason: 'x'.repeat(501) }, { expectedSubscriptionId: 9, merchantId: 999 }])('rejects malformed or forged input %j', async input => {
  await expect(merchantSubscriptionRouter.createCaller(context).cancelSubscription(input as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(mocks.cancel).not.toHaveBeenCalled();
});
it('maps stale confirmation to a conflict without leaking storage errors', async () => {
  mocks.cancel.mockRejectedValueOnce(new SubscriptionCancellationConflictError());
  await expect(merchantSubscriptionRouter.createCaller(context).cancelSubscription({ expectedSubscriptionId: 9 })).rejects.toMatchObject({ code: 'CONFLICT' });
  mocks.cancel.mockRejectedValueOnce(new Error('secret SQL detail'));
  await expect(merchantSubscriptionRouter.createCaller(context).cancelSubscription({ expectedSubscriptionId: 9 })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not cancel subscription' });
});
it('rejects an anonymous caller', async () => {
  await expect(merchantSubscriptionRouter.createCaller({ user: null } as any).cancelSubscription({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(mocks.cancel).not.toHaveBeenCalled();
});
