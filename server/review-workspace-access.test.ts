import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn(), detail: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('./review-workspace', async original => ({ ...await original<typeof import('./review-workspace')>(), readReviewWorkspace: mocks.read, readReviewDetail: mocks.detail }));
import { reviewsRouter } from './routers-reviews';
import { bookingReviewsRouter } from './routers-booking-reviews';
import { appRouter } from './routers';
import { ReviewWorkspaceError } from './review-workspace';
beforeEach(() => { vi.resetAllMocks(); mocks.access.mockResolvedValue({ merchantId: 20, role: 'viewer' }); });
for (const kind of ['order', 'booking'] as const) for (const mounted of [false, true]) {
  const caller = (user: any = { id: 7, role: 'user' }, selection = '20') => {
    const ctx = { user, merchantId: 999, merchantRole: 'owner', req: { headers: { 'x-merchant-id': selection } }, res: {} } as any;
    return mounted ? kind === 'order' ? appRouter.createCaller(ctx).reviews : appRouter.createCaller(ctx).bookingReviews
      : kind === 'order' ? reviewsRouter.createCaller(ctx) : bookingReviewsRouter.createCaller(ctx);
  };
  it(`selects ${kind} tenant and rejects overposting mounted=${mounted}`, async () => {
    await caller().workspace({}); expect(mocks.read).toHaveBeenCalledWith(7, 20, kind, expect.objectContaining({ page: 1, rating: null }));
    await caller().detail({ id: 9 }); expect(mocks.detail).toHaveBeenCalledWith(7, 20, kind, { id: 9 });
    await expect(caller().workspace({ merchantId: 999 } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller().detail({ id: 9, kind: 'booking' } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller(undefined, '20bad').workspace({})).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it(`requires current ${kind} membership and session mounted=${mounted}`, async () => {
    await expect(caller(null).workspace({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    mocks.access.mockResolvedValue(null); await expect(caller().workspace({})).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(mocks.read).not.toHaveBeenCalled();
  });
  it(`maps ${kind} errors without leaking database content mounted=${mounted}`, async () => {
    mocks.detail.mockRejectedValue(new ReviewWorkspaceError('missing')); await expect(caller().detail({ id: 1 })).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'review_workspace:unavailable' });
    mocks.read.mockRejectedValue(new Error('database password private')); await expect(caller().workspace({})).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'review_workspace:unavailable' });
    mocks.read.mockRejectedValue(new ReviewWorkspaceError('forbidden')); await expect(caller().workspace({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
}
