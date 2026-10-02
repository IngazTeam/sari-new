import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), list: vi.fn(), details: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: m.access }));
vi.mock('./booking-workspace', async original => ({ ...await original<typeof import('./booking-workspace')>(), readBookingWorkspace: m.list, readBookingDetails: m.details }));
import { appRouter } from './routers';
import { bookingsRouter } from './routers-bookings';
import { BookingWorkspaceMissingError } from './booking-workspace';
import { bookingWorkspaceInput, bookingWorkspaceSchema, bookingDetailsSchema } from '../shared/booking-workspace';
const empty = { actorId: 7, merchantId: 20, canManage: false, checkedAt: '2026-10-02T10:00:00Z', selection: bookingWorkspaceInput.parse({}), summary: { total: 0, counts: { pending: 0, confirmed: 0, in_progress: 0, completed: 0, cancelled: 0, no_show: 0, unknown: 0 }, payments: { unpaid: 0, paid: 0, refunded: 0, unknown: 0 }, paidValue: { minor: 0, eligible: 0, invalid: 0 } }, pagination: { page: 1, pageSize: 25, total: 0, pages: 0 }, rows: [] };
beforeEach(() => { vi.resetAllMocks(); m.access.mockResolvedValue({ merchantId: 20, role: 'viewer' }); m.list.mockResolvedValue(empty); m.details.mockResolvedValue({ actorId: 7, merchantId: 20, canManage: false, booking: { id: 31 } }); });
for (const surface of ['mounted', 'standalone']) describe(`booking workspace authority ${surface}`, () => {
  const caller = (user: any = { id: 7, role: 'user' }) => { const ctx = { user, merchantId: 999, merchantRole: 'owner', req: { headers: { 'x-merchant-id': '20' } }, res: {} } as any; return surface === 'mounted' ? appRouter.createCaller(ctx).bookings : bookingsRouter.createCaller(ctx); };
  it.each(['owner', 'manager', 'sales_supervisor', 'viewer'])('derives %s authority from selected membership', async role => {
    m.access.mockResolvedValue({ merchantId: 20, role });
    expect((await caller().workspace({ search: ' named ', page: 4 })).canManage).toBe(role !== 'viewer');
    expect((await caller().details({ bookingId: 31 })).canManage).toBe(role !== 'viewer');
    expect(m.list).toHaveBeenCalledWith(7, 20, { ...empty.selection, search: 'named', page: 4 }); expect(m.details).toHaveBeenCalledWith(7, 20, { bookingId: 31 });
  });
  it.each(['workspace', 'details'] as const)('denies anonymous, revoked membership and forged scope for %s', async method => {
    const input = method === 'workspace' ? {} : { bookingId: 31 };
    await expect((caller(null)[method] as any)(input)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect((caller()[method] as any)({ ...input, merchantId: 999 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    m.access.mockResolvedValue(null); await expect((caller()[method] as any)(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(m.list).not.toHaveBeenCalled(); expect(m.details).not.toHaveBeenCalled();
  });
  it.each(['workspace', 'details'] as const)('redacts failure and distinguishes missing records for %s', async method => {
    const source = method === 'workspace' ? m.list : m.details, input = method === 'workspace' ? {} : { bookingId: 31 };
    source.mockRejectedValue(Error('private SQL customer phone'));
    await expect((caller()[method] as any)(input)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Booking data unavailable' });
    source.mockRejectedValue(new BookingWorkspaceMissingError()); await expect((caller()[method] as any)(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
describe('booking workspace contracts', () => {
  it.each([{ page: 0 }, { page: 1.2 }, { page: 1000001 }, { status: 'made-up' }, { payment: 'settled' }, { serviceId: 0 }, { staffId: 1.2 }, { startDate: '2026-02-30' }, { startDate: '2026-10-02', endDate: '2026-10-01' }, { search: 'x'.repeat(201) }, { limit: 100 }, { actorId: 9 }])('rejects malformed selection %j', input => expect(bookingWorkspaceInput.safeParse(input).success).toBe(false));
  it('keeps valid dates, literal search and unknown-state filters', () => expect(bookingWorkspaceInput.parse({ startDate: '2028-02-29', search: '%_\\', status: 'unknown', payment: 'unknown' })).toMatchObject({ startDate: '2028-02-29', search: '%_\\', status: 'unknown', payment: 'unknown' }));
  it('accepts a complete empty snapshot', () => expect(bookingWorkspaceSchema.safeParse(empty).success).toBe(true));
  it.each([
    (v: any) => { v.pagination.total = 1; }, (v: any) => { v.pagination.page = 2; }, (v: any) => { v.pagination.pages = 1; },
    (v: any) => { v.summary.counts.pending = 1; }, (v: any) => { v.summary.payments.paid = 1; }, (v: any) => { v.summary.paidValue.minor = null; },
    (v: any) => { v.summary.paidValue.eligible = 1; }, (v: any) => { v.summary.paidValue.minor = 100; },
  ])('rejects inconsistent aggregates %#', mutate => { const data = structuredClone(empty); mutate(data); expect(bookingWorkspaceSchema.safeParse(data).success).toBe(false); });
  it('rejects mismatched details scope', () => expect(bookingDetailsSchema.safeParse({ actorId: 7, merchantId: 20, selection: { bookingId: 31 }, booking: { id: 32, merchantId: 21 } }).success).toBe(false));
});
