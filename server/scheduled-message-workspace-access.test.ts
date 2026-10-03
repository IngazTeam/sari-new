import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('./scheduled-message-workspace', async original => ({ ...await original<typeof import('./scheduled-message-workspace')>(), readScheduledMessageWorkspace: mocks.read }));
import { scheduledMessagesRouter } from './routers-scheduled-messages';
import { appRouter } from './routers';
beforeEach(() => { vi.resetAllMocks(); mocks.access.mockResolvedValue({ merchantId: 20, role: 'viewer' }); });
for (const mounted of [false, true]) {
  const caller = (user: any = { id: 7, role: 'user' }, selection = '20') => { const ctx = { user, merchantId: 999, merchantRole: 'owner', req: { headers: { 'x-merchant-id': selection } }, res: {} } as any; return mounted ? appRouter.createCaller(ctx).scheduledMessages : scheduledMessagesRouter.createCaller(ctx); };
  it(`uses selected scope for workspace mounted=${mounted}`, async () => {
    await caller().workspace({}); expect(mocks.read).toHaveBeenCalledWith(7, 20, expect.objectContaining({ page: 1 }));
    await expect(caller().workspace({ merchantId: 999 } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller(undefined, '20bad').workspace({})).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it(`requires a live session and membership mounted=${mounted}`, async () => {
    await expect(caller(null).workspace({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    mocks.access.mockResolvedValue(null); await expect(caller().workspace({})).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(mocks.read).not.toHaveBeenCalled();
  });
}
