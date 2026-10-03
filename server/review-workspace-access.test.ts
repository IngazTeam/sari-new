import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn(), detail: vi.fn(), save: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('./review-workspace', async original => ({ ...await original<typeof import('./review-workspace')>(), readReviewWorkspace: mocks.read, readReviewDetail: mocks.detail }));
vi.mock('./review-reply', async original => ({ ...await original<typeof import('./review-reply')>(), saveReviewReply: mocks.save }));
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
  it(`requires current reply permission for ${kind} and scopes the save mounted=${mounted}`, async () => {
    const input = { id: 3, revision: 'a'.repeat(64), reply: 'Saved reply' };
    await expect(caller().saveReply(input)).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(mocks.save).not.toHaveBeenCalled();
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'sales_supervisor' }); await caller().saveReply(input);
    expect(mocks.save).toHaveBeenCalledWith(7, 20, kind, input);
    for (const extra of [{ merchantId: 999 }, { reply: ' ' }, { reply: 'x'.repeat(1001) }, { revision: 'bad' }])
      await expect(caller().saveReply({ ...input, ...extra } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it(`retires legacy ${kind} reads and writes mounted=${mounted}`, async () => {
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'owner' });
    const c = caller() as any;
    const operations = kind === 'order' ? [() => c.list({ merchantId: 20 }), () => c.getById({ id: 3 }), () => c.reply({ reviewId: 3, reply: 'Old reply' })]
      : [() => c.create({ bookingId: 1, serviceId: 2, customerPhone: 'fake', overallRating: 5 }), () => c.list({}), () => c.getByService({ serviceId: 1 }), () => c.getStats({ serviceId: 1 }), () => c.reply({ reviewId: 3, reply: 'Old reply' })];
    for (const run of operations) await expect(run()).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: 'review_workspace:reload' });
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  if (kind === 'order') it(`keeps dashboard statistics on the selected scoped source mounted=${mounted}`, async () => {
    mocks.read.mockResolvedValue({ stats: { rated: 5, average: 4.2, distribution: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 2 } } });
    expect(await (caller() as any).getStats({ merchantId: 20 })).toMatchObject({ totalReviews: 5, averageRating: 4.2 });
    expect(mocks.read).toHaveBeenCalledWith(7, 20, 'order', {});
    await expect((caller() as any).getStats({ merchantId: 999 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    mocks.read.mockRejectedValue(new Error('DB failure')); await expect((caller() as any).getStats({ merchantId: 20 })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });
}
