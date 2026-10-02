import { beforeEach, expect, it, vi } from 'vitest';
import { byaanResyncRequest, byaanResyncLookup } from '../shared/byaan-resync';
const m = vi.hoisted(() => ({ access: vi.fn(), request: vi.fn(), read: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: m.access }));
vi.mock('./integrations/byaan-resync', () => ({ requestReviewedByaanResync: m.request, readByaanResyncAttempt: m.read }));
import { byaanRouter } from './routers-byaan';
import { appRouter } from './routers';
import { ByaanDashboardFault } from './integrations/byaan-dashboard-fault';
const input = { requestId: '3bc2a3e4-8589-4d5f-a0f7-68be3fe727ea', revision: 'a'.repeat(64) };
beforeEach(() => { vi.resetAllMocks(); m.access.mockResolvedValue({ merchantId: 20, role: 'manager' }); });
for (const mounted of [false, true]) {
  const api = (user: any = { id: 7, role: 'user' }) => { const ctx = { user, req: { headers: { 'x-merchant-id': '20' } }, res: {}, merchantId: 999 } as any; return mounted ? appRouter.createCaller(ctx).byaan : byaanRouter.createCaller(ctx); };
  it(`scopes both request and lookup (${mounted})`, async () => { await api().requestResync(input); await api().resyncAttempt({ requestId: input.requestId }); expect(m.request).toHaveBeenCalledWith(7, 20, input); expect(m.read).toHaveBeenCalledWith(7, 20, { requestId: input.requestId }); });
  for (const action of ['requestResync','resyncAttempt'] as const) {
    const call = (caller = api()) => action === 'requestResync' ? caller.requestResync(input) : caller.resyncAttempt({ requestId: input.requestId });
    it.each(['viewer','sales_supervisor',null])(`denies role %s for ${action} (${mounted})`, async role => {
      m.access.mockResolvedValue(role ? { merchantId: 20, role } : null); await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' }); await expect(call(api(null))).rejects.toMatchObject({ code: 'UNAUTHORIZED' }); expect(m.request).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
    });
    it(`redacts storage errors for ${action} (${mounted})`, async () => { m.request.mockRejectedValue(Error('PRIVATE SQL')); m.read.mockRejectedValue(Error('PRIVATE SQL')); await expect(call()).rejects.toMatchObject({ message: 'Byaan dashboard data unavailable' }); });
  }
  it(`returns review conflict and durable rate limit without secret data (${mounted})`, async () => {
    for (const [reason, code] of [['stale','CONFLICT'],['rate_limited','TOO_MANY_REQUESTS']] as const) { m.request.mockRejectedValue(new ByaanDashboardFault(reason)); await expect(api().requestResync(input)).rejects.toMatchObject({ code }); }
  });
}
it.each([{}, { requestId: 'bad', revision: input.revision }, { ...input, revision: 'bad' }, { ...input, merchantId: 99 }])('rejects an incomplete/injected request %j', value => expect(byaanResyncRequest.safeParse(value).success).toBe(false));
it('bounds recovery lookup to one request id', () => { expect(byaanResyncLookup.safeParse({ requestId: input.requestId, actorId: 99 }).success).toBe(false); });
