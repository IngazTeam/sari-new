import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const external = vi.hoisted(() => ({ getOrderStatus: vi.fn(), send: vi.fn() }));
vi.mock('../integrations/salla', () => ({ SallaIntegration: class { getOrderStatus = external.getOrderStatus; } }));
vi.mock('../channels/whatsapp/service', () => ({ sendMerchantWhatsApp: external.send, WhatsAppDeliveryStateError: class extends Error {} }));
import { sallaOrderProjectionId } from '../integrations/salla-order-projection';
import { closeDb, getPool } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants, assertDisposableDatabase } from '../tests/helpers/disposable-merchant';
import { encryptSecret } from '../security/secrets';
import { runSallaWebhookReceiptBatch } from '../integrations/salla-webhook-receipts';
import { assertSallaObservationSchema, inspectSallaObservations, recordSallaObservation, SallaObservationAccessDenied, SallaObservationConflict } from './salla-sales-observations';

describe.skipIf(!process.env.DATABASE_URL)('Salla observation actual MySQL atomicity and authority', () => {
  const query = async (sql: string, args: any[] = []): Promise<any[]> => (await (await getPool())!.execute<any[]>(sql,args))[0];
  let merchant: number, actor: number, other: number, connectionId: number, store: string, users: number[];
  const scope = () => ({merchantId:merchant,storeId:store,orderId:'98765'});
  const observations = () => query('SELECT * FROM salla_sales_observations WHERE merchant_id=? ORDER BY id',[merchant]);
  const receipt = async (order = '98765') => {
    const event = randomBytes(32).toString('hex');
    const r: any = await query("INSERT INTO salla_webhook_receipts(merchant_id,salla_store_id,event_key,event_type,resource_id,status,available_at) VALUES (?,?,?,'order.updated',?,'pending',NOW(3))",[merchant,store,event,order]);
    return {id:r.insertId,event};
  };
  beforeEach(async () => {
    assertDisposableDatabase(); vi.stubEnv('FIELD_ENCRYPTION_KEY','synthetic-only-salla-observation-key-12345');
    users=[]; const m=await createDisposableMerchant('salla-observe'), a=await createDisposableMerchant('salla-admin'), b=await createDisposableMerchant('salla-other');
    users.push(m.userId,a.userId,b.userId);merchant=m.merchantId;actor=a.userId;other=b.merchantId;store=String(800000000+merchant);
    await query("UPDATE users SET role='admin' WHERE id=?",[actor]);
    const c:any=await query("INSERT INTO salla_connections(merchantId,salla_store_id,storeUrl,accessToken,syncStatus) VALUES (?,?,'https://synthetic.example.test',?,'active')",[merchant,store,encryptSecret('synthetic-token')]);connectionId=c.insertId;
    external.getOrderStatus.mockResolvedValue({status:'paid'});external.send.mockResolvedValue({accepted:true});
  });
  afterEach(async () => { vi.restoreAllMocks();vi.clearAllMocks();await cleanupDisposableMerchants(users);vi.unstubAllEnvs(); });
  afterAll(closeDb);
  it('captures authenticated provider state with no local order and no invented payment or learning signal', async () => {
    await assertSallaObservationSchema(); const r=await receipt();expect(await runSallaWebhookReceiptBatch()).toBe(1);
    expect(await observations()).toMatchObject([{receipt_id:r.id,observed_state:'paid',provider_status:'paid'}]);
    expect(await inspectSallaObservations(actor,scope())).toMatchObject({...scope(),paymentEvidence:'not_measured',observations:[{state:'paid'}]});
    for(const table of ['ai_sales_payment_facts','ai_sales_order_facts'])expect(await query(`SELECT * FROM ${table} WHERE merchant_id=?`,[merchant])).toHaveLength(0);
    expect(external.send).not.toHaveBeenCalled();expect(await query('SELECT status,effect_applied FROM salla_webhook_receipts WHERE id=?',[r.id])).toMatchObject([{status:'completed',effect_applied:1}]);
  });
  it('deduplicates receipt retries and separate events while retaining the first source and timestamp', async () => {
    const r=await receipt();await runSallaWebhookReceiptBatch();const first=await observations();
    await query("UPDATE salla_webhook_receipts SET status='pending',available_at=NOW(3) WHERE id=?",[r.id]);await runSallaWebhookReceiptBatch();
    await receipt();await runSallaWebhookReceiptBatch();expect(await observations()).toEqual(first);expect(external.getOrderStatus).toHaveBeenCalledTimes(2);
  });
  it('preserves local order progression, tracking and notification without changing payment status', async () => {
    const inserted:any=await query("INSERT INTO orders(merchantId,sallaOrderId,customerName,customerPhone,items,totalAmount,status) VALUES (?,?,'Synthetic','966500000000','[]',100,'pending')",[merchant,sallaOrderProjectionId(store,'98765')]);
    await query("INSERT INTO salla_order_projections(merchant_id,store_id,external_order_id,local_order_id,connection_id,created_at) VALUES (?,?,'98765',?,?,UTC_TIMESTAMP(3))",[merchant,store,inserted.insertId,connectionId]);
    external.getOrderStatus.mockResolvedValue({status:'shipped',trackingNumber:'synthetic-tracking'});await receipt();await runSallaWebhookReceiptBatch();
    expect(await query('SELECT status,payment_status,trackingNumber FROM orders WHERE id=?',[inserted.insertId])).toMatchObject([{status:'shipped',payment_status:'unpaid',trackingNumber:'synthetic-tracking'}]);
    expect(await query('SELECT oldStatus,newStatus FROM order_tracking_logs WHERE orderId=?',[inserted.insertId])).toMatchObject([{oldStatus:'pending',newStatus:'shipped'}]);
    expect(external.send).toHaveBeenCalledTimes(1);await receipt();await runSallaWebhookReceiptBatch();expect(external.send).toHaveBeenCalledTimes(1);
    external.getOrderStatus.mockResolvedValue({status:'pending'});await receipt();await runSallaWebhookReceiptBatch();
    expect((await query('SELECT status FROM orders WHERE id=?',[inserted.insertId]))[0].status).toBe('shipped');expect(await observations()).toHaveLength(2);
  });
  it('rolls back local projection and observation if tracking storage fails', async () => {
    const inserted:any=await query("INSERT INTO orders(merchantId,sallaOrderId,customerName,customerPhone,items,totalAmount,status) VALUES (?,?,'Synthetic','966500000000','[]',100,'pending')",[merchant,sallaOrderProjectionId(store,'98765')]);
    await query("INSERT INTO salla_order_projections(merchant_id,store_id,external_order_id,local_order_id,connection_id,created_at) VALUES (?,?,'98765',?,?,UTC_TIMESTAMP(3))",[merchant,store,inserted.insertId,connectionId]);
    await receipt();const pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{
      const result=await execute(sql,args);if(sql.includes('INSERT INTO order_tracking_logs'))throw Error('synthetic tracking failure');return result;
    })as any);return c;});await runSallaWebhookReceiptBatch();vi.restoreAllMocks();
    expect(await observations()).toHaveLength(0);expect((await query('SELECT status FROM orders WHERE id=?',[inserted.insertId]))[0].status).toBe('pending');
    expect(await query('SELECT * FROM order_tracking_logs WHERE orderId=?',[inserted.insertId])).toHaveLength(0);expect(external.send).not.toHaveBeenCalled();
  });
  it('retains six distinct observations without asserting a monotonic or complete timeline', async () => {
    for(const status of ['delivered','pending','paid','in_progress','shipped','cancelled']){external.getOrderStatus.mockResolvedValue({status});await receipt();await runSallaWebhookReceiptBatch();}
    expect((await inspectSallaObservations(actor,scope())).observations.map(o=>o.state)).toEqual(['delivered','pending','paid','processing','shipped','cancelled']);
  });
  it.each(['unknown_custom_state','refunded'])('does not invent a financial result from unsupported state %s', async status => {
    external.getOrderStatus.mockResolvedValue({status});const r=await receipt();await runSallaWebhookReceiptBatch();
    expect(await observations()).toHaveLength(0);expect(await query('SELECT status,last_error FROM salla_webhook_receipts WHERE id=?',[r.id])).toMatchObject([{status:'manual_review',last_error:'unsupported_order_status'}]);
  });
  it.each(['token','store','paused','replaced','lease','expired','identity'])('rejects %s changed during HTTP without applying effect', async mutation => {
    const r=await receipt();external.getOrderStatus.mockImplementationOnce(async()=>{
      if(mutation==='token')await query('UPDATE salla_connections SET accessToken=? WHERE id=?',[encryptSecret('replacement-token'),connectionId]);
      if(mutation==='store')await query('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connectionId]);
      if(mutation==='paused')await query("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);
      if(mutation==='replaced'){await query('DELETE FROM salla_connections WHERE id=?',[connectionId]);await query("INSERT INTO salla_connections(merchantId,salla_store_id,storeUrl,accessToken,syncStatus) VALUES (?,?,'https://synthetic.example.test',?,'active')",[merchant,store,encryptSecret('synthetic-token')]);}
      if(mutation==='lease')await query("UPDATE salla_webhook_receipts SET processing_token='different-worker' WHERE id=?",[r.id]);
      if(mutation==='expired')await query('UPDATE salla_webhook_receipts SET claimed_at=DATE_SUB(NOW(3),INTERVAL 11 MINUTE) WHERE id=?',[r.id]);
      if(mutation==='identity')await query("UPDATE salla_webhook_receipts SET resource_id='111' WHERE id=?",[r.id]);
      return {status:'paid'};
    });await runSallaWebhookReceiptBatch();expect(await observations()).toHaveLength(0);expect(external.send).not.toHaveBeenCalled();
    expect((await query('SELECT effect_applied FROM salla_webhook_receipts WHERE id=?',[r.id]))[0].effect_applied).toBe(0);
  });
  it('rolls back observation and receipt effect after a write failure, then recovers on retry', async () => {
    const r=await receipt(),pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{
      const result=await execute(sql,args);if(sql.includes('INSERT INTO salla_sales_observations'))throw Error('synthetic write failure');return result;
    })as any);return c;});
    await runSallaWebhookReceiptBatch();vi.restoreAllMocks();expect(await observations()).toHaveLength(0);
    expect((await query('SELECT effect_applied FROM salla_webhook_receipts WHERE id=?',[r.id]))[0].effect_applied).toBe(0);
    await query('UPDATE salla_webhook_receipts SET available_at=NOW(3) WHERE id=?',[r.id]);await runSallaWebhookReceiptBatch();expect(await observations()).toHaveLength(1);
  });
  it('recovers a lost effect commit acknowledgement without fetching or recording twice', async () => {
    const r=await receipt(),pool=(await getPool())!,original=pool.getConnection.bind(pool);let lost=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original(),execute=c.execute.bind(c),commit=c.commit.bind(c);let effect=false;
      vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{if(sql.includes('INSERT INTO salla_sales_observations'))effect=true;return execute(sql,args);})as any);
      vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(effect&&!lost){lost=true;throw Error('synthetic lost acknowledgement');}});return c;});
    await runSallaWebhookReceiptBatch();vi.restoreAllMocks();expect(lost).toBe(true);const first=await observations();expect(first).toHaveLength(1);
    await query('UPDATE salla_webhook_receipts SET available_at=NOW(3) WHERE id=?',[r.id]);await runSallaWebhookReceiptBatch();expect(await observations()).toEqual(first);expect(external.getOrderStatus).toHaveBeenCalledTimes(1);
  });
  it('serializes distinct receipt transactions observing the same state', async () => {
    const receipts=await Promise.all(Array.from({length:6},()=>receipt()));
    for(const r of receipts)await query("UPDATE salla_webhook_receipts SET status='processing',processing_token='fixture-lease',claimed_at=NOW(3) WHERE id=?",[r.id]);
    await Promise.all(receipts.map(async r=>{const c=await (await getPool())!.getConnection();try{await c.beginTransaction();await recordSallaObservation(c,{...scope(),connectionId,accessToken:'synthetic-token',receiptId:r.id,eventKey:r.event,processingToken:'fixture-lease',providerStatus:'paid'});await c.execute('UPDATE salla_webhook_receipts SET effect_applied=1 WHERE id=?',[r.id]);await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();}}));
    expect(await observations()).toHaveLength(1);expect((await inspectSallaObservations(actor,scope())).observations).toHaveLength(1);
  });
  it('keeps tenant, store and order queries isolated', async () => {
    await receipt();await runSallaWebhookReceiptBatch();
    for(const input of [{...scope(),merchantId:other},{...scope(),storeId:'111'},{...scope(),orderId:'111'}])expect((await inspectSallaObservations(actor,input)).observations).toHaveLength(0);
  });
  it.each(["role='user'","account_status='deletion_pending'","account_status='anonymized'"])('checks persisted admin authority: %s', async change => {
    await query(`UPDATE users SET ${change} WHERE id=?`,[actor]);await expect(inspectSallaObservations(actor,scope())).rejects.toBeInstanceOf(SallaObservationAccessDenied);
  });
  it.each(["resource_id='111'","merchant_id=0","event_key=REPEAT('b',64)","effect_applied=0"])('refuses corrupted source %s', async change => {
    if(change==='merchant_id=0')change=`merchant_id=${other}`;
    const r=await receipt();await runSallaWebhookReceiptBatch();await query(`UPDATE salla_webhook_receipts SET ${change} WHERE id=?`,[r.id]);
    await expect(inspectSallaObservations(actor,scope())).rejects.toBeInstanceOf(SallaObservationConflict);
  });
});
