import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { upsertOrderFromZid, cancelOrderFromZid, getZidOrderByZidId, linkZidOrderToSariOrder,
  saveZidOrder, upsertNormalizedOrdersFromZid } from '../db';
import { normalizeZidOrder, zidOrderProjectionId } from '../integrations/zid-commerce-normalization';
import { enqueueZidOrderCreatedNotification, runZidOrderNotificationBatch } from '../integrations/zid-order-notification-outbox';
const channel = vi.hoisted(() => ({send:vi.fn()}));
vi.mock('../channels/whatsapp/service',()=>({sendMerchantWhatsApp:channel.send,WhatsAppDeliveryStateError:class extends Error {}}));

describe.skipIf(!process.env.DATABASE_URL)('Zid order store identity SQL',()=>{
  let fixture:Awaited<ReturnType<typeof createDisposableMerchant>>;
  const query=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
  const order=(storeId:unknown=11)=>({id:991,store_id:storeId,order_total:230,currency_code:'SAR',status:'new',
    customer:{name:'Synthetic',mobile:'966500000076'},products:[]});
  beforeEach(async()=>{fixture=await createDisposableMerchant('zid-store-order');channel.send.mockReset().mockResolvedValue({accepted:true});});
  afterEach(async()=>cleanupDisposableMerchants([fixture.userId]));afterAll(closeDb);
  it('keeps the same external order number in two stores as distinct sources and projections',async()=>{
    await upsertOrderFromZid(fixture.merchantId,order(11));await upsertOrderFromZid(fixture.merchantId,order(22));
    expect(await query('SELECT id FROM zid_orders WHERE merchant_id=?',[fixture.merchantId])).toHaveLength(2);
    expect(await query('SELECT id FROM orders WHERE merchantId=?',[fixture.merchantId])).toHaveLength(2);
  });
  it('rejects an order without explicit provider store identity',async()=>{
    await expect(upsertOrderFromZid(fixture.merchantId,order(null))).rejects.toThrow();
    expect(await query('SELECT id FROM zid_orders WHERE merchant_id=?',[fixture.merchantId])).toHaveLength(0);
  });
  it('never cancels another store with the same order number',async()=>{
    await upsertOrderFromZid(fixture.merchantId,order(11));
    await cancelOrderFromZid(fixture.merchantId,991,new Date(),'22');
    expect((await query('SELECT status FROM zid_orders WHERE merchant_id=?',[fixture.merchantId]))[0].status).not.toBe('cancelled');
  });
  const source=async(store:string)=>getZidOrderByZidId(fixture.merchantId,'991',store);
  const local=async()=>query('SELECT * FROM orders WHERE merchantId=? ORDER BY id',[fixture.merchantId]);
  const legacy=async()=>{
    const inserted=await query("INSERT INTO orders (merchantId,sallaOrderId,customerPhone,customerName,items,totalAmount,currency) VALUES (?,'zid:991','966500000076','Legacy','[]',9900,'SAR')",[fixture.merchantId]);
    await query("INSERT INTO zid_orders (merchant_id,zid_order_id,sari_order_id,total_amount,currency,customer_phone,items) VALUES (?,'991',?,99,'SAR','966500000076','[]')",[fixture.merchantId,inserted.insertId]);
  };
  const notifications=async()=>query('SELECT zid_store_id,status,last_error FROM zid_order_notification_outbox WHERE merchant_id=? ORDER BY id',[fixture.merchantId]);
  const connection=async(store='22')=>{
    await query("UPDATE merchants SET status='active',phone='966500000076' WHERE id=?",[fixture.merchantId]);
    await query("INSERT INTO platform_integrations (merchant_id,platform_type,is_active,settings) VALUES (?,'zid',1,?)",[fixture.merchantId,JSON.stringify({storeId:store,autoSync:true,syncOrders:true,notifyMerchantOrders:true})]);
  };
  const enqueue=async(store:string)=>enqueueZidOrderCreatedNotification({merchantId:fixture.merchantId,externalOrderId:991,storeId:store});
  it('replays concurrently without duplicate local orders',async()=>{
    await Promise.all(Array.from({length:4},()=>upsertOrderFromZid(fixture.merchantId,order(11))));
    expect(await local()).toHaveLength(1);expect(await source('11')).toMatchObject({sariOrderId:(await local())[0].id});
  });
  it('updates and cancels only the selected store while rejecting stale events',async()=>{
    const at=new Date('2026-09-25T10:00:00Z'),later=new Date('2026-09-25T11:00:00Z');
    await upsertOrderFromZid(fixture.merchantId,order(11),at);await upsertOrderFromZid(fixture.merchantId,order(22),at);
    await cancelOrderFromZid(fixture.merchantId,991,later,'22');
    expect(await upsertOrderFromZid(fixture.merchantId,order(22),at)).toBe(false);
    expect(await source('22')).toMatchObject({status:'cancelled'});
    const rows=await local();
    expect(rows.map((r:any)=>r.status)).toEqual(['processing','cancelled']);
  });
  it('preserves ambiguous legacy rows and avoids a second local order',async()=>{
    await legacy();const before=await local();
    const result=await upsertNormalizedOrdersFromZid(fixture.merchantId,[normalizeZidOrder(order(22))]);
    expect(result).toMatchObject({sourceOrders:1,projectedOrders:0});expect(await local()).toEqual(before);
    expect(await source('22')).toMatchObject({sariOrderId:null,zidStoreId:'22'});
    expect((await query("SELECT total_amount FROM zid_orders WHERE merchant_id=? AND zid_store_id=''",[fixture.merchantId]))[0].total_amount).toBe('99.00');
  });
  it.each([null,'',0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'11/22','1'.repeat(21)])('rejects malformed store %s before writes',async store=>{
    await expect(upsertOrderFromZid(fixture.merchantId,order(store))).rejects.toThrow();expect(await local()).toHaveLength(0);
  });
  it('does not overwrite a pre-existing unrelated local alias',async()=>{
    await query("INSERT INTO orders (merchantId,sallaOrderId,customerPhone,customerName,items,totalAmount) VALUES (?,?,'966500000076','Unrelated','[]',777)",[fixture.merchantId,zidOrderProjectionId('11','991')]);
    const before=await local();await expect(upsertOrderFromZid(fixture.merchantId,order(11))).rejects.toThrow('ZID_ORDER_PROJECTION_CONFLICT');
    expect(await local()).toEqual(before);expect(await source('11')).toBeNull();
  });
  it('rejects case-folded identities without altering their existing source or projection',async()=>{
    await upsertOrderFromZid(fixture.merchantId,{...order(11),id:'ABC'});const before=await local();
    await expect(upsertOrderFromZid(fixture.merchantId,{...order(11),id:'abc',order_total:2})).rejects.toThrow('ZID_ORDER_IDENTITY_CONFLICT');
    expect(await local()).toEqual(before);
    await cancelOrderFromZid(fixture.merchantId,'abc',new Date(),'11');expect(await local()).toEqual(before);
    expect(await getZidOrderByZidId(fixture.merchantId,'abc','11')).toBeNull();
    expect(await getZidOrderByZidId(fixture.merchantId,'ABC','11')).toMatchObject({status:'processing'});
  });
  it('refuses cross-store links and contains a corrupt cancellation pointer',async()=>{
    await upsertOrderFromZid(fixture.merchantId,order(11));await upsertOrderFromZid(fixture.merchantId,order(22));
    const a=(await source('11'))!,b=(await source('22'))!;
    await expect(linkZidOrderToSariOrder(a.id,b.sariOrderId!)).rejects.toThrow();
    await query('UPDATE zid_orders SET sari_order_id=? WHERE id=?',[b.sariOrderId,a.id]);
    await cancelOrderFromZid(fixture.merchantId,991,new Date(),'11');
    expect((await local()).every((r:any)=>r.status!=='cancelled')).toBe(true);
  });
  it('accepts an already owned projection link idempotently',async()=>{
    await upsertOrderFromZid(fixture.merchantId,order(11));const a=(await source('11'))!;
    await linkZidOrderToSariOrder(a.id,a.sariOrderId!);expect((await source('11'))?.sariOrderId).toBe(a.sariOrderId);
  });
  it('never changes legacy orders through a scoped cancellation or manual link',async()=>{
    await legacy();const before=await local();await cancelOrderFromZid(fixture.merchantId,991,new Date(),'22');
    const [old]=await query('SELECT id FROM zid_orders WHERE merchant_id=?',[fixture.merchantId]);
    await expect(linkZidOrderToSariOrder(old.id,before[0].id)).rejects.toThrow();expect(await local()).toEqual(before);
  });
  it('requires store on lookup and save, and keeps cancellation observation time',async()=>{
    await expect(getZidOrderByZidId(fixture.merchantId,'991',undefined)).rejects.toThrow();
    await expect(saveZidOrder(fixture.merchantId,{zidOrderId:'991'})).rejects.toThrow();
    await upsertOrderFromZid(fixture.merchantId,order(11),new Date('2026-09-25T10:00:00Z'));
    await saveZidOrder(fixture.merchantId,{zidOrderId:'991',zidStoreId:'11',status:'cancelled'},new Date('2026-09-25T11:00:00Z'));
    expect(await source('11')).toMatchObject({status:'cancelled',lastSyncedAt:'2026-09-25 11:00:00.000'});
  });
  it('isolates the same store and order across merchants',async()=>{
    const other=await createDisposableMerchant('zid-store-other');try{
      await upsertOrderFromZid(fixture.merchantId,order(11));await upsertOrderFromZid(other.merchantId,order(11));
      await cancelOrderFromZid(fixture.merchantId,991,new Date(),'11');
      expect(await getZidOrderByZidId(other.merchantId,'991','11')).not.toMatchObject({status:'cancelled'});
    }finally{await cleanupDisposableMerchants([other.userId]);}
  });
  it('delivers only the current store notification with its own order amount',async()=>{
    await connection();await upsertOrderFromZid(fixture.merchantId,order(11));
    await upsertOrderFromZid(fixture.merchantId,{...order(22),order_total:440});
    await enqueue('11');await enqueue('22');await enqueue('22');await runZidOrderNotificationBatch();
    expect((await notifications()).map((r:any)=>r.status)).toEqual(['suppressed','delivered']);
    expect(channel.send).toHaveBeenCalledTimes(1);expect(channel.send.mock.calls[0][0].text).toContain('440.00 SAR');
  });
  it('holds legacy identity conflicts for review without sending',async()=>{
    await connection();await legacy();await upsertOrderFromZid(fixture.merchantId,order(22));await enqueue('22');
    await runZidOrderNotificationBatch();expect(await notifications()).toMatchObject([{status:'manual_review',last_error:'legacy_store_identity_unverified'}]);
    expect(channel.send).not.toHaveBeenCalled();
  });
  it('suppresses queued historical notifications with no known store',async()=>{
    await connection();await legacy();await query("INSERT INTO zid_order_notification_outbox (merchant_id,zid_order_id,event_key) VALUES (?,'991',?)",[fixture.merchantId,'a'.repeat(64)]);
    await runZidOrderNotificationBatch();expect(await notifications()).toMatchObject([{status:'suppressed'}]);expect(channel.send).not.toHaveBeenCalled();
  });
});
