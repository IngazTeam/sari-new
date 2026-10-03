import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), upload: vi.fn(), remove: vi.fn(), receipt: vi.fn(), close: vi.fn(), read: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('./media-actions', () => ({ uploadMediaReviewed: mocks.upload, removeMediaReviewed: mocks.remove, readMediaReceipt: mocks.receipt, closeMediaRequest: mocks.close }));
vi.mock('./media-workspace', async original => ({ ...await original<typeof import('./media-workspace')>(), readMediaWorkspace: mocks.read }));
import { mediaRouter } from './routers-media';
import { appRouter } from './routers';
beforeEach(() => { vi.resetAllMocks(); mocks.access.mockResolvedValue({ merchantId: 20, role: 'manager' }); });
const old = { list: {}, getStats: undefined, upload: { originalName: 'file.png', mimeType: 'image/png', fileBase64: 'AAAA', category: 'product' }, delete: { id: 1 } };
for (const mounted of [false, true]) {
  const caller = (user: any = { id: 7, role: 'user' }, selection = '20') => { const ctx = { user, merchantId: 999, merchantRole: 'owner', req: { headers: { 'x-merchant-id': selection } }, res: {} } as any; return mounted ? appRouter.createCaller(ctx).media : mediaRouter.createCaller(ctx); };
  it(`retires all four legacy entrypoints without storage or data writes mounted=${mounted}`, async () => {
    for (const [name, input] of Object.entries(old)) await expect((caller() as any)[name](input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: 'media_workspace:reload_reviewed_workspace' });
    for (const fn of [mocks.upload, mocks.remove, mocks.read, mocks.close, mocks.receipt]) expect(fn).not.toHaveBeenCalled();
  });
  it(`uses selected scope and refuses expanded inputs mounted=${mounted}`, async () => {
    await caller().workspace({}); expect(mocks.read).toHaveBeenCalledWith(7, 20, expect.objectContaining({ page: 1 }));
    await expect(caller().workspace({ merchantId: 999 } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller(undefined, '20junk').workspace({})).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it(`requires current access for reads and old writes mounted=${mounted}`, async () => {
    await expect(caller(null).workspace({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    mocks.access.mockResolvedValue(null); await expect(caller().workspace({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'viewer' }); await expect(caller().delete({ id: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
}
