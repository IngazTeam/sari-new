import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), db: Object.fromEntries(['getBookingById','getBookingsByMerchant','getBookingsByService','getBookingsByCustomer','getBookingStats','getServiceById','getStaffMemberById','checkBookingConflict','getAvailableTimeSlots','getMerchantByUserId'].map(key => [key, vi.fn()])) }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: m.access }));
vi.mock('./db', async original => ({ ...await original<typeof import('./db')>(), ...m.db }));
import { appRouter } from './routers';
import { bookingsRouter } from './routers-bookings';
const schedule = { serviceId: 11, staffId: 12, bookingDate: '2026-12-20', startTime: '10:00', endTime: '11:00' };
const reads = [
  ['getById', { bookingId: 31 }, 'getBookingById'], ['list', {}, 'getBookingsByMerchant'],
  ['getByService', { serviceId: 11 }, 'getBookingsByService'], ['getByCustomer', { customerPhone: '966500987654' }, 'getBookingsByCustomer'],
  ['getStats', {}, 'getBookingStats'], ['checkAvailability', schedule, 'checkBookingConflict'],
  ['getAvailableSlots', { serviceId: 11, staffId: 12, date: '2026-12-20' }, 'getAvailableTimeSlots'],
] as const;
beforeEach(() => {
  vi.resetAllMocks(); m.access.mockResolvedValue({ merchantId: 20, role: 'viewer' });
  m.db.getBookingById.mockResolvedValue({ id: 31, merchantId: 20 });
  m.db.getServiceById.mockResolvedValue({ id: 11, merchantId: 20, isActive: 1 });
  m.db.getStaffMemberById.mockResolvedValue({ id: 12, merchantId: 20, isActive: 1 });
  for (const key of ['getBookingsByMerchant','getBookingsByService','getBookingsByCustomer','getAvailableTimeSlots']) m.db[key].mockResolvedValue([]);
  m.db.checkBookingConflict.mockResolvedValue(false); m.db.getBookingStats.mockResolvedValue({ total: 0 });
});
for (const surface of ['mounted','standalone']) describe(`booking reads ${surface}`, () => {
  const caller = (user: any = { id: 7, role: 'user' }, headers: any = { 'x-merchant-id': '20' }) => {
    const ctx = { user, merchantId: 999, merchantRole: 'owner', req: { headers }, res: {} } as any;
    return surface === 'mounted' ? appRouter.createCaller(ctx).bookings : bookingsRouter.createCaller(ctx);
  };
  it.each(['owner','manager','sales_supervisor','viewer'])('uses resolved %s membership for every read', async role => {
    m.access.mockResolvedValue({ merchantId: 20, role });
    for (const [name, input] of reads) await (caller() as any)[name](input);
    expect(m.access).toHaveBeenCalledWith(7,20); expect(m.db.getMerchantByUserId).not.toHaveBeenCalled();
    expect(m.db.getBookingById).toHaveBeenCalledWith(31,20);
    expect(m.db.getBookingsByMerchant).toHaveBeenCalledWith(20,{});
    expect(m.db.getBookingsByService).toHaveBeenCalledWith(11,20,{serviceId:11});
    expect(m.db.getBookingsByCustomer).toHaveBeenCalledWith(20,'966500987654');
    expect(m.db.getBookingStats).toHaveBeenCalledWith(20,{});
    expect(m.db.checkBookingConflict).toHaveBeenCalledWith(11,12,'2026-12-20','10:00','11:00',undefined,20);
    expect(m.db.getAvailableTimeSlots).toHaveBeenCalledWith(11,'2026-12-20',12,20);
  });
  it.each(reads)('denies missing membership and anonymous %s', async (name,input,read) => {
    m.access.mockResolvedValue(null); await expect((caller() as any)[name](input)).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect((caller(null) as any)[name](input)).rejects.toMatchObject({code:'UNAUTHORIZED'}); expect(m.db[read]).not.toHaveBeenCalled();
  });
  it.each(reads)('rejects forged scope in %s', async(name,input,read) => {
    await expect((caller() as any)[name]({...input,merchantId:999})).rejects.toMatchObject({code:'BAD_REQUEST'}); expect(m.db[read]).not.toHaveBeenCalled();
  });
  it.each(reads)('redacts storage failure in %s', async(name,input,read) => {
    m.db[read].mockRejectedValue(Error('private SQL phone credential'));
    await expect((caller() as any)[name](input)).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR',message:'Booking data unavailable'});
  });
  it.each([
    ['getById',{bookingId:0}], ['getById',{bookingId:1.5}], ['getById',{bookingId:2147483648}],
    ['list',{limit:1.5}], ['list',{limit:501}], ['list',{limit:0}], ['list',{status:'unknown'}], ['list',{staffId:-1}],
    ['list',{startDate:'2026-02-30'}], ['list',{startDate:'2026-10-02',endDate:'2026-10-01'}],
    ['getByService',{serviceId:11,endDate:'2026-02-29'}], ['getStats',{serviceId:11,startDate:'2026-11-31'}],
    ['getByCustomer',{customerPhone:'bad'}], ['getByCustomer',{customerPhone:'1'.repeat(21)}],
    ['checkAvailability',{...schedule,startTime:'24:00'}], ['checkAvailability',{...schedule,endTime:'10:00'}],
    ['checkAvailability',{...schedule,endTime:'09:00'}], ['checkAvailability',{...schedule,bookingDate:'2026-02-30'}],
    ['getAvailableSlots',{serviceId:11,date:'2026-02-30'}],
  ])('rejects malformed %s %j', async(name,input) => {
    await expect((caller() as any)[name](input)).rejects.toMatchObject({code:'BAD_REQUEST'});
    for(const fn of Object.values(m.db)) expect(fn).not.toHaveBeenCalled();
  });
  it('rejects foreign booking and relationships without querying downstream data', async() => {
    m.db.getBookingById.mockResolvedValue({id:31,merchantId:99}); await expect(caller().getById({bookingId:31})).rejects.toMatchObject({code:'NOT_FOUND'});
    m.db.getServiceById.mockResolvedValue({id:11,merchantId:99,isActive:1});
    for(const [name,input,read] of reads.filter(([name]) => ['getByService','checkAvailability','getAvailableSlots'].includes(name))) {
      await expect((caller() as any)[name](input)).rejects.toMatchObject({code:'NOT_FOUND'}); expect(m.db[read]).not.toHaveBeenCalled();
    }
    await expect(caller().list({serviceId:11})).rejects.toMatchObject({code:'NOT_FOUND'});
    await expect(caller().getStats({serviceId:11})).rejects.toMatchObject({code:'NOT_FOUND'});
    expect(m.db.getBookingStats).not.toHaveBeenCalled(); expect(m.db.getBookingsByMerchant).not.toHaveBeenCalled();
  });
  it.each([null,{id:12,merchantId:99,isActive:1},{id:12,merchantId:20,isActive:0}])('rejects unavailable staff in availability %j', async staff => {
    m.db.getStaffMemberById.mockResolvedValue(staff);
    await expect(caller().checkAvailability(schedule)).rejects.toMatchObject({code:'NOT_FOUND'});
    await expect(caller().getAvailableSlots({serviceId:11,staffId:12,date:'2026-12-20'})).rejects.toMatchObject({code:'NOT_FOUND'});
    expect(m.db.checkBookingConflict).not.toHaveBeenCalled(); expect(m.db.getAvailableTimeSlots).not.toHaveBeenCalled();
  });
  it('allows historical filters for inactive resources while refusing new availability', async() => {
    m.db.getServiceById.mockResolvedValue({id:11,merchantId:20,isActive:0}); m.db.getStaffMemberById.mockResolvedValue({id:12,merchantId:20,isActive:0});
    await expect(caller().list({serviceId:11,staffId:12})).resolves.toEqual({bookings:[]});
    await expect(caller().checkAvailability(schedule)).rejects.toMatchObject({code:'NOT_FOUND'});
  });
  it('fails closed on malformed selection and membership lookup error', async() => {
    await expect(caller(undefined,{'x-merchant-id':'20x'}).list({})).rejects.toMatchObject({code:'BAD_REQUEST'});
    m.access.mockRejectedValue(Error('private SQL')); await expect(caller().list({})).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR'}); expect(m.db.getBookingsByMerchant).not.toHaveBeenCalled();
  });
  it('accepts leap days and explicit list bounds', async() => {
    await caller().list({startDate:'2028-02-29',endDate:'2028-02-29',limit:500}); expect(m.db.getBookingsByMerchant).toHaveBeenCalledWith(20,{startDate:'2028-02-29',endDate:'2028-02-29',limit:500});
  });
});
