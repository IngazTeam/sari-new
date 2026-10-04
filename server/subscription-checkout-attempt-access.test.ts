import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: m.access }));
vi.mock('./subscriptions/checkout-attempt', () => ({ readCheckoutAttempt: m.read }));
import { appRouter } from './routers';
import { MerchantSettingsAuthorityError } from './accounts/merchant-settings-authority';
const caller = (user: unknown = { id: 7, role: 'user' }) => appRouter.createCaller({ user, req: { headers: { 'x-merchant-id': '20' } }, res: {}, merchantId: 999 } as any);
const input = { checkoutAttemptId: 'da2e3e62-03dc-4ebf-9db9-0c3cb5ead2d6' };
beforeEach(() => { vi.resetAllMocks(); m.access.mockResolvedValue({ merchantId: 20, role: 'owner' }); m.read.mockResolvedValue({ fixture: true }); });
it('looks up the request only in the selected tenant and actor authority', async () => {
  await caller().merchantSubscription.checkoutAttempt(input);
  expect(m.read).toHaveBeenCalledWith(7, 20, input.checkoutAttemptId);
});
it.each([{ ...input, merchantId: 21 }, { ...input, transactionId: 5 }, { ...input, actorId: 8 }, { checkoutAttemptId: 'bad' }, {}])('rejects forged lookup %j', async value => {
  await expect(caller().merchantSubscription.checkoutAttempt(value as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(m.read).not.toHaveBeenCalled();
});
it('rejects anonymous and revoked access before payment lookup', async () => {
  await expect(caller(null).merchantSubscription.checkoutAttempt(input)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  m.access.mockResolvedValue(null);
  await expect(caller().merchantSubscription.checkoutAttempt(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(m.read).not.toHaveBeenCalled();
});
it('reports lost authority and unavailable storage without details or an empty success', async () => {
  m.read.mockRejectedValue(new MerchantSettingsAuthorityError('forbidden'));
  await expect(caller().merchantSubscription.checkoutAttempt(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  m.read.mockRejectedValue(Error('PRIVATE_SQL'));
  await expect(caller().merchantSubscription.checkoutAttempt(input)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Checkout attempt unavailable' });
});
