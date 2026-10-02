import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, getDb, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { readBookingWorkspace, readBookingDetails } from './booking-workspace';
import { bookingsRouter } from './routers-bookings';
describe.skipIf(!process.env.DATABASE_URL)('complete booking workspace on MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, member: typeof owner;
  let service: number, foreignService: number, staff: number, foreignStaff: number;
  const q = async (text: string, args: any[] = []) => (await (await getPool())!.execute<any>(text, args))[0];
  const list = (input: unknown = {}) => readBookingWorkspace(owner.userId, owner.merchantId, input);
  const detail = (bookingId: number) => readBookingDetails(owner.userId, owner.merchantId, { bookingId });
  const book = async (patch: Record<string, any> = {}) => Number((await q("INSERT INTO bookings (merchant_id,service_id,staff_id,customer_name,customer_phone,customer_email,notes,booking_date,start_time,end_time,duration_minutes,status,payment_status,base_price,final_price) VALUES (?,?,?,?,?,?,?,'2026-10-02',?, ?,60,?,?,?,?)", [patch.merchant ?? owner.merchantId, patch.service ?? service, patch.staff ?? staff, patch.name ?? 'Scoped customer', '966500987654', 'booking@example.test', 'Only in details', patch.start ?? '10:00', patch.end ?? '11:00', patch.status ?? 'pending', patch.payment ?? 'unpaid', patch.amount ?? 1000, patch.amount ?? 1000])).insertId);
  beforeEach(async () => {
    owner = await createDisposableMerchant('booking-workspace'); other = await createDisposableMerchant('workspace-other'); member = await createDisposableMerchant('workspace-viewer');
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)", [owner.merchantId, member.userId]);
    service = Number((await q("INSERT INTO services (merchant_id,name,is_active,duration_minutes) VALUES (?,'Own service',1,60)", [owner.merchantId])).insertId);
    foreignService = Number((await q("INSERT INTO services (merchant_id,name,is_active,duration_minutes) VALUES (?,'Secret foreign service',1,60)", [other.merchantId])).insertId);
    staff = Number((await q("INSERT INTO staff_members (merchant_id,name,is_active) VALUES (?,'Own provider',1)", [owner.merchantId])).insertId);
    foreignStaff = Number((await q("INSERT INTO staff_members (merchant_id,name,is_active) VALUES (?,'Secret foreign provider',1)", [other.merchantId])).insertId);
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants([owner.userId, other.userId, member.userId]); }); afterAll(closeDb);
  it('returns complete empty and out-of-range pages', async () => {
    expect(await list()).toMatchObject({ actorId: owner.userId, merchantId: owner.merchantId, rows: [], summary: { total: 0 }, pagination: { pages: 0 } });
    await book(); expect(await list({ page: 1000000 })).toMatchObject({ rows: [], summary: { total: 1 }, pagination: { total: 1, pages: 1, page: 1000000 } });
  });
  it('searches beyond 100 rows and pages all matching results in a stable order', async () => {
    const ids: number[] = []; for (let i = 0; i < 103; i++) ids.push(await book({ name: i === 0 ? 'Oldest needle' : 'Scoped customer' }));
    await book({ merchant: other.merchantId, name: 'Foreign customer' });
    const first = await list(), fifth = await list({ page: 5 }); expect(first.rows.map(r => r.id)).toEqual(ids.slice().reverse().slice(0, 25));
    expect(fifth.rows.map(r => r.id)).toEqual(ids.slice(0, 3).reverse()); expect(first.summary.total).toBe(103); expect(first.pagination.pages).toBe(5);
    expect((await list({ search: 'oldest NEEDLE' })).rows.map(r => r.id)).toEqual([ids[0]]);
    expect(JSON.stringify(first)).not.toContain('Only in details'); expect(JSON.stringify(first)).not.toContain('Foreign customer');
  });
  it('keeps filters, payment values and aggregates in the same scope', async () => {
    await book({ status: 'completed', payment: 'paid', amount: 0 }); await book({ status: 'completed', payment: 'paid', amount: 2000 });
    await book({ status: 'completed', payment: 'refunded', amount: 1000 }); await book({ status: 'pending', payment: 'paid', amount: 3000 });
    const result = await list({ status: 'completed', payment: 'paid', startDate: '2026-10-02', endDate: '2026-10-02', serviceId: service, staffId: staff });
    expect(result.summary).toMatchObject({ total: 2, counts: { completed: 2, pending: 0 }, payments: { paid: 2, refunded: 0 }, paidValue: { minor: 2000, eligible: 2, invalid: 0 } });
    expect((await list({ startDate: '2026-10-03' })).summary.total).toBe(0);
  });
  it('supports literal punctuation, email, phone and reference searches without wildcard expansion', async () => {
    const id = await book({ name: "Literal %_\\' value" }); await book();
    expect((await list({ search: "%_\\'" })).rows.map(r => r.id)).toEqual([id]);
    for (const search of ['booking@example.test', '966500987654', 'Own service', 'Own provider']) expect((await list({ search })).summary.total).toBe(2);
    expect((await list({ search: "' OR 1=1 --" })).summary.total).toBe(0);
  });
  it('redacts foreign relationships even when an own booking links to them', async () => {
    const id = await book({ service: foreignService, staff: foreignStaff }), foreignId = await book({ merchant: other.merchantId });
    const result = await detail(id); expect(result.booking.service).toEqual({ id: foreignService, name: null, isActive: null });
    expect(result.booking.staff).toEqual({ id: foreignStaff, name: null, isActive: null }); expect(result.booking.issues).toEqual(expect.arrayContaining(['serviceReference', 'staffReference']));
    expect(JSON.stringify(await list())).not.toContain('Secret foreign'); expect((await list({ search: 'Secret foreign' })).summary.total).toBe(0);
    await expect(detail(foreignId)).rejects.toThrow('Booking or reference not found');
    await expect(list({ serviceId: foreignService })).rejects.toThrow('Booking or reference not found'); await expect(list({ staffId: foreignStaff })).rejects.toThrow('Booking or reference not found');
  });
  it('retains inactive owned references and all detail fields', async () => {
    const id = await book(); await q('UPDATE services SET is_active=0 WHERE id=?', [service]); await q('UPDATE staff_members SET is_active=0 WHERE id=?', [staff]);
    await q("UPDATE bookings SET customer_agreement_id=77,discount_amount=100,final_price=900,google_event_id='stored-event',reminder_24h_sent=1,cancellation_reason='Requested',cancelled_by='customer',booking_source='phone',confirmed_at='2026-10-01 10:00:00',completed_at='2026-10-02 11:00:00',cancelled_at='2026-10-02 12:00:00' WHERE id=?", [id]);
    const data = await detail(id); expect(data.booking).toMatchObject({ service: { name: 'Own service', isActive: false }, staff: { name: 'Own provider', isActive: false }, customerAgreementId: 77, basePrice: 1000, discountAmount: 100, finalPrice: 900, notes: 'Only in details', customerEmail: 'booking@example.test', googleEventId: 'stored-event', reminder24hSent: true, reminder1hSent: false, cancellationReason: 'Requested', cancelledBy: 'customer', bookingSource: 'phone', confirmedAt: '2026-10-01T10:00:00Z', completedAt: '2026-10-02T11:00:00Z', cancelledAt: '2026-10-02T12:00:00Z', issues: [] });
    expect(data.booking.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); expect((await list({ serviceId: service, staffId: staff })).summary.total).toBe(1);
  });
  it('keeps unknown legacy states, invalid schedules and amounts explicit', async () => {
    const id = await book(); await q("UPDATE bookings SET start_time='bad',end_time='25:00',duration_minutes=0,base_price=-1,discount_amount=-1,final_price=-1,reminder_24h_sent=9 WHERE id=?", [id]);
    const connection = await (await getPool())!.getConnection(); const [modes] = await connection.query<any[]>('SELECT @@SESSION.sql_mode AS value');
    try { await connection.query("SET SESSION sql_mode=''"); await connection.execute("UPDATE bookings SET status='',payment_status='',booking_source='',cancelled_by='',booking_date='0000-00-00' WHERE id=?", [id]); }
    finally { await connection.query('SET SESSION sql_mode=?', [modes[0].value]); connection.release(); }
    const result = await list({ status: 'unknown', payment: 'unknown' }); expect(result.summary).toMatchObject({ total: 1, counts: { unknown: 1 }, payments: { unknown: 1 } });
    expect((await detail(id)).booking).toMatchObject({ status: 'unknown', paymentStatus: 'unknown', bookingSource: 'unknown', cancelledBy: 'unknown', date: null, startTime: null, endTime: null, durationMinutes: null, basePrice: null, discountAmount: null, finalPrice: null, reminder24hSent: null });
  });
  it('does not publish a partial paid amount and flags inconsistent schedule and pricing', async () => {
    const id = await book({ status: 'completed', payment: 'paid', amount: -10, start: '12:00', end: '11:00' }); await book({ status: 'completed', payment: 'paid', amount: 500 });
    expect((await list()).summary.paidValue).toEqual({ minor: null, eligible: 2, invalid: 1 }); expect((await detail(id)).booking.issues).toContain('schedule');
    await q('UPDATE bookings SET base_price=1000,final_price=900 WHERE id=?', [id]); expect((await detail(id)).booking.issues).toContain('price');
  });
  it('holds count, rows and reference names in one snapshot during a concurrent insert', async () => {
    await book(); const db = (await getDb())!, transaction = db.transaction.bind(db); let injected = false;
    vi.spyOn(db, 'transaction').mockImplementation(((callback: any, config: any) => transaction(async tx => {
      const execute = tx.execute.bind(tx); vi.spyOn(tx, 'execute').mockImplementation((async (query: any) => { const result = await execute(query); if (!injected) { injected = true; await book(); await q("UPDATE services SET name='Changed concurrently' WHERE id=?", [service]); } return result; }) as any); return callback(tx);
    }, config)) as any);
    const first = await list(); expect(first.summary.total).toBe(1); expect(first.rows).toHaveLength(1); expect(first.rows[0].service.name).toBe('Own service');
    vi.restoreAllMocks(); const second = await list(); expect(second.summary.total).toBe(2); expect(second.rows[0].service.name).toBe('Changed concurrently');
  });
  it('uses actual viewer membership and fails after revocation', async () => {
    const id = await book(); const caller = bookingsRouter.createCaller({ user: { id: member.userId, role: 'user' }, req: { headers: { 'x-merchant-id': String(owner.merchantId) } }, res: {} } as any);
    expect(await caller.workspace({})).toMatchObject({ actorId: member.userId, merchantId: owner.merchantId, canManage: false, summary: { total: 1 } });
    expect((await caller.details({ bookingId: id })).canManage).toBe(false);
    await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [owner.merchantId, member.userId]);
    await expect(caller.workspace({})).rejects.toMatchObject({ code: 'FORBIDDEN' }); await expect(caller.details({ bookingId: id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
