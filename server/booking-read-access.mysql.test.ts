import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { bookingsRouter } from './routers-bookings';
import { getBookingById, getAvailableTimeSlots, checkBookingConflict } from './db';
describe.skipIf(!process.env.DATABASE_URL)('booking read authority on disposable MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, member: typeof owner;
  let serviceId: number, foreignServiceId: number, staffId: number, foreignStaffId: number, bookingId: number, foreignBookingId: number;
  const q = async(sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql,args))[0];
  const caller = (userId = member.userId, merchantId = owner.merchantId) => bookingsRouter.createCaller({user:{id:userId,role:'user'},req:{headers:{'x-merchant-id':String(merchantId)}},res:{}} as any);
  beforeEach(async() => {
    owner=await createDisposableMerchant('booking-reads'); other=await createDisposableMerchant('booking-other'); member=await createDisposableMerchant('booking-member');
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",[owner.merchantId,member.userId]);
    serviceId=Number((await q("INSERT INTO services (merchant_id,name,duration_minutes,is_active) VALUES (?,'Own service',60,1)",[owner.merchantId])).insertId);
    foreignServiceId=Number((await q("INSERT INTO services (merchant_id,name,duration_minutes,is_active) VALUES (?,'Foreign service',60,1)",[other.merchantId])).insertId);
    staffId=Number((await q("INSERT INTO staff_members (merchant_id,name,is_active) VALUES (?,'Own staff',1)",[owner.merchantId])).insertId);
    foreignStaffId=Number((await q("INSERT INTO staff_members (merchant_id,name,is_active) VALUES (?,'Foreign staff',1)",[other.merchantId])).insertId);
    const book=async(merchantId:number,service:number) => Number((await q("INSERT INTO bookings (merchant_id,service_id,customer_phone,booking_date,start_time,end_time,duration_minutes,base_price,final_price) VALUES (?,?,'966500987654','2026-12-20','10:00','11:00',60,1000,1000)",[merchantId,service])).insertId);
    bookingId=await book(owner.merchantId,serviceId); foreignBookingId=await book(other.merchantId,serviceId);
    await q("INSERT INTO booking_time_slots (merchant_id,service_id,staff_id,slot_date,start_time,end_time,is_available,is_blocked,max_bookings,current_bookings) VALUES (?,?,?,'2026-12-20','12:00','13:00',1,0,1,0)",[owner.merchantId,serviceId,staffId]);
  });
  afterEach(async() => { await cleanupDisposableMerchants([owner.userId,other.userId,member.userId]); }); afterAll(closeDb);
  it('reads the explicitly selected membership, not the member own store', async() => {
    expect((await caller().list({})).bookings.map(b=>b.id)).toEqual([bookingId]);
    expect((await caller().getByCustomer({customerPhone:'966500987654'})).bookings.map(b=>b.id)).toEqual([bookingId]);
    expect((await caller().getByService({serviceId})).bookings.map(b=>b.id)).toEqual([bookingId]);
    expect((await caller().getStats({})).stats.total).toBe(1);
    expect((await caller().getById({bookingId})).booking.id).toBe(bookingId);
    expect((await caller(member.userId,member.merchantId).list({})).bookings).toEqual([]);
  });
  it('excludes contradictory foreign bookings in SQL and rejects foreign records', async() => {
    expect(await getBookingById(foreignBookingId,owner.merchantId)).toBeUndefined();
    await expect(caller().getById({bookingId:foreignBookingId})).rejects.toMatchObject({code:'NOT_FOUND'});
    await expect(caller().getByService({serviceId:foreignServiceId})).rejects.toMatchObject({code:'NOT_FOUND'});
    await expect(caller().list({staffId:foreignStaffId})).rejects.toMatchObject({code:'NOT_FOUND'});
  });
  it('revoked or other-store membership cannot read and viewer cannot create', async() => {
    await expect(caller(member.userId,other.merchantId).list({})).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(caller().create({serviceId,customerPhone:'966500987654',bookingDate:'2026-12-20',startTime:'13:00',endTime:'14:00',durationMinutes:60,basePrice:1000,finalPrice:1000})).rejects.toMatchObject({code:'FORBIDDEN'});
    await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[owner.merchantId,member.userId]);
    await expect(caller().list({})).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('checks configured slots and live capacity without accepting foreign staff', async() => {
    expect((await caller().getAvailableSlots({serviceId,date:'2026-12-20',staffId})).slots).toHaveLength(1);
    expect(await caller().checkAvailability({serviceId,staffId,bookingDate:'2026-12-20',startTime:'10:00',endTime:'11:00'})).toEqual({available:false});
    expect(await caller().checkAvailability({serviceId,staffId,bookingDate:'2026-12-20',startTime:'12:00',endTime:'13:00'})).toEqual({available:true});
    await expect(caller().getAvailableSlots({serviceId,date:'2026-12-20',staffId:foreignStaffId})).rejects.toMatchObject({code:'NOT_FOUND'});
  });
  it('keeps storage scoped even if a service changes ownership after the router check', async() => {
    await q('UPDATE services SET merchant_id=? WHERE id=?',[other.merchantId,serviceId]);
    await expect(getAvailableTimeSlots(serviceId,'2026-12-20',staffId,owner.merchantId)).rejects.toThrow('Booking scope unavailable');
    await expect(checkBookingConflict(serviceId,null,'2026-12-20','12:00','13:00',undefined,owner.merchantId)).rejects.toThrow('Booking capacity unavailable');
    expect(await getAvailableTimeSlots(serviceId,'2026-12-20',undefined,other.merchantId)).toEqual([]);
  });
  it('rejects missing selection for multiple memberships', async() => {
    const ctx={user:{id:member.userId,role:'user'},req:{headers:{}},res:{}} as any;
    await expect(bookingsRouter.createCaller(ctx).list({})).rejects.toMatchObject({code:'PRECONDITION_FAILED'});
  });
});
