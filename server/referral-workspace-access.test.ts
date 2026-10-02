import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: m.access }));
vi.mock('./referral-workspace-store', async original => ({ ...await original<typeof import('./referral-workspace-store')>(), readReferralWorkspace: m.read }));
import { referralsRouter } from './routers-referrals';
import { appRouter } from './routers';
import { ReferralWorkspaceError } from './referral-workspace-store';
beforeEach(() => { vi.resetAllMocks(); m.access.mockResolvedValue({ merchantId: 20, role: 'owner' }); m.read.mockResolvedValue({ actorId: 7, merchantId: 20 }); });
for (const mounted of [false, true]) {
 const caller = (user: any = { id: 7, role: 'user' }, selection = '20') => { const ctx = { user, merchantId: 999, merchantRole: 'owner', req: { headers: { 'x-merchant-id': selection } }, res: {} } as any; return mounted ? appRouter.createCaller(ctx).referrals : referralsRouter.createCaller(ctx); };
 it(`uses resolved tenant, not injected context mounted=${mounted}`, async () => { await caller().workspace({}); expect(m.read).toHaveBeenCalledExactlyOnceWith(7, 20, { tab: 'referrals', query: '', state: 'all', page: 1 }); expect(m.access).toHaveBeenCalledWith(7, 20); });
 it(`rejects anonymous, malformed and revoked access mounted=${mounted}`, async () => { await expect(caller(null).workspace({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' }); await expect(caller(undefined, '20x').workspace({})).rejects.toMatchObject({ code: 'BAD_REQUEST' }); m.access.mockResolvedValue(null); await expect(caller().workspace({})).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(m.read).not.toHaveBeenCalled(); });
 it(`rejects selection injection before storage mounted=${mounted}`, async () => { await expect(caller().workspace({ merchantId: 99 } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(m.read).not.toHaveBeenCalled(); });
 it(`never converts a storage failure into empty success or exposes SQL mounted=${mounted}`, async () => { m.read.mockRejectedValue(Error('PRIVATE SQL')); await expect(caller().workspace({})).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر قراءة برنامج الإحالات لهذا المتجر. حاول تحديث الصفحة.' }); m.read.mockRejectedValue(new ReferralWorkspaceError('forbidden')); await expect(caller().workspace({})).rejects.toMatchObject({ code: 'FORBIDDEN' }); });
 it(`requires explicit selection instead of guessing owned store mounted=${mounted}`, async () => { m.access.mockRejectedValue(Object.assign(Error(), { name: 'MerchantSelectionRequiredError' })); await expect(caller().workspace({})).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); expect(m.read).not.toHaveBeenCalled(); });
}
