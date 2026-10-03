import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), review: vi.fn(), apply: vi.fn(), read: vi.fn(), resolve: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('./scheduled-message-actions', async original => ({ ...await original<typeof import('./scheduled-message-actions')>(), reviewScheduledAction: mocks.review, applyScheduledAction: mocks.apply, readScheduledActionReceipt: mocks.read, resolveScheduledActionReceipt: mocks.resolve }));
import { scheduledMessagesRouter } from './routers-scheduled-messages';
import { appRouter } from './routers';
const target = { action: 'toggle' as const, id: 2, enabled: true }, requestKey = 'edbc55c3-1d7e-48d0-9bfa-e84269037cf1';
beforeEach(() => { vi.resetAllMocks(); mocks.access.mockResolvedValue({ merchantId: 20, role: 'manager' }); });
for (const mounted of [false, true]) {
  const caller = (user: any = { id: 7, role: 'user' }, selected = '20') => { const ctx = { user, merchantId: 999, merchantRole: 'owner', req: { headers: { 'x-merchant-id': selected } }, res: {} } as any; return mounted ? appRouter.createCaller(ctx).scheduledMessages : scheduledMessagesRouter.createCaller(ctx); };
  it(`routes reviewed actions to the current selected tenant mounted=${mounted}`, async () => {
    await caller().reviewAction(target); expect(mocks.review).toHaveBeenCalledWith(7, 20, target);
    const value = { target, requestKey, checkedAt: '2026-10-03T09:00:00.000Z', reviewRevision: 'a'.repeat(64) };
    await caller().applyAction(value); expect(mocks.apply).toHaveBeenCalledWith(7, 20, value);
    await caller().actionReceipt({ requestKey }); await caller().resolveActionReceipt({ requestKey });
    expect(mocks.read).toHaveBeenCalledWith(7, 20, { requestKey }); expect(mocks.resolve).toHaveBeenCalledWith(7, 20, { requestKey });
  });
  it(`retires every legacy entrypoint without applying an unreviewed action mounted=${mounted}`, async () => {
    const old = { list: undefined, create: { title: 'Weekly', message: 'Hello', dayOfWeek: 4, time: '10:00' }, update: { id: 2, title: 'Changed' }, toggle: { id: 2, isActive: true }, delete: { id: 2 } };
    for (const [method, input] of Object.entries(old)) await expect((caller() as any)[method](input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: 'scheduled_action:reload_reviewed_workspace' });
    expect(mocks.review).not.toHaveBeenCalled(); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it(`refuses writes without campaign permission but permits scoped recovery for viewers mounted=${mounted}`, async () => {
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'viewer' });
    await expect(caller().reviewAction(target)).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(mocks.review).not.toHaveBeenCalled();
    await caller().actionReceipt({ requestKey }); await caller().resolveActionReceipt({ requestKey }); expect(mocks.resolve).toHaveBeenCalledOnce();
  });
  it(`rejects injected scope, malformed selection and missing login mounted=${mounted}`, async () => {
    await expect(caller().reviewAction({ ...target, merchantId: 999 } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller(undefined, '20wrong').reviewAction(target)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller(null).resolveActionReceipt({ requestKey })).rejects.toMatchObject({ code: 'UNAUTHORIZED' }); expect(mocks.review).not.toHaveBeenCalled(); expect(mocks.resolve).not.toHaveBeenCalled();
  });
}
