import { afterAll, afterEach, beforeEach, expect, it, describe } from 'vitest';
import { closeDb, getPool } from './db/connection';
import { getOrderNotificationsByMerchantId, getOrderNotificationsByOrderId } from './db';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { orderNotificationsRouter } from './routers-order-notifications';
describe.skipIf(!process.env.DATABASE_URL)('order notification selected-tenant boundaries', () => {
  let a: Awaited<ReturnType<typeof createDisposableMerchant>>, b: typeof a, orderA: number, orderB: number;
  const q = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
  const caller = (actor = a.userId, merchant = b.merchantId) => orderNotificationsRouter.createCaller({ user: { id: actor, role: 'user' }, req: { headers: { 'x-merchant-id': String(merchant) } }, res: {} } as any);
  const insert = async (merchant: number, order: number, message: string) => Number((await q("INSERT INTO order_notifications (merchant_id,order_id,customer_phone,status,message) VALUES (?,?,'+966500000000','paid',?)", [merchant, order, message])).insertId);
  beforeEach(async () => {
    a = await createDisposableMerchant('order-access-a'); b = await createDisposableMerchant('order-access-b');
    const order = async (merchant: number) => Number((await q("INSERT INTO orders (merchantId,customerName,customerPhone,items,totalAmount) VALUES (?,'Synthetic','+966500000000','[]',100)", [merchant])).insertId);
    orderA = await order(a.merchantId); orderB = await order(b.merchantId);
  });
  afterEach(() => cleanupDisposableMerchants([a.userId, b.userId])); afterAll(closeDb);
  it('requires tenant equality on both the notification and its order', async () => {
    const own = await insert(a.merchantId, orderA, 'OWN'); await insert(b.merchantId, orderA, 'FOREIGN_ROW'); await insert(a.merchantId, orderB, 'FOREIGN_PARENT'); await insert(b.merchantId, orderB, 'FOREIGN');
    expect((await getOrderNotificationsByOrderId(a.merchantId, orderA)).map(r => r.id)).toEqual([own]);
    expect((await getOrderNotificationsByMerchantId(a.merchantId)).map(r => r.id)).toEqual([own]);
    expect(await getOrderNotificationsByOrderId(a.merchantId, orderB)).toEqual([]);
  });
  it('supports an invited manager and reads only their selected merchant', async () => {
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)", [b.merchantId, a.userId]);
    await insert(a.merchantId, orderA, 'OTHER_OWNED'); const selected = await insert(b.merchantId, orderB, 'SELECTED');
    expect((await caller().getHistory({})).map(r => r.id)).toEqual([selected]);
    await expect(caller().updateTemplate({ status: 'paid', template: 'Selected store', enabled: false })).rejects.toMatchObject({code:'PRECONDITION_FAILED'});
    expect(await q('SELECT merchant_id,template,enabled FROM notification_templates WHERE merchant_id IN (?,?)', [a.merchantId,b.merchantId])).toEqual([]);
  });
  it('allows viewer reads, denies writes, then denies all access after revocation', async () => {
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)", [b.merchantId, a.userId]);
    expect(await caller().getHistory({})).toEqual([]); await expect(caller().updateTemplate({ status: 'paid', template: 'Blocked', enabled: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller().acknowledgeIncidents()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [b.merchantId,a.userId]); await expect(caller().getHistory({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('does not let an owner read a foreign order or cross-linked notification', async () => {
    await insert(b.merchantId, orderA, 'PRIVATE'); const api = caller(a.userId,a.merchantId);
    expect(await api.getByOrderId({ orderId: orderA })).toEqual([]); await expect(api.getByOrderId({ orderId: orderB })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('rejects invalid direct scope and limits instead of widening the query', async () => {
    await expect(getOrderNotificationsByOrderId(0, orderA)).rejects.toThrow('Invalid notification scope');
    await expect(getOrderNotificationsByMerchantId(a.merchantId, 101)).rejects.toThrow('Invalid notification scope');
  });
});
