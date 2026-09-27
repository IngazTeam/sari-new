import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const external=vi.hoisted(()=>({status:vi.fn(),send:vi.fn()}));
vi.mock('./salla',()=>({SallaIntegration:class{getOrderStatus=external.status;}}));
vi.mock('../channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({send:external.send})}));
import { getPool,closeDb } from '../db/connection';
import { assertDisposableDatabase,createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { encryptSecret } from '../security/secrets';
import { persistSallaOrderProjection,preflightSallaOrderAuthority,sallaOrderProjectionId,sallaOrderNoticeKey,sallaOrderStatusMessage,canDispatchSallaOrderNotice } from './salla-order-projection';
import { runSallaWebhookReceiptBatch,enqueueSallaOrderPolls } from './salla-webhook-receipts';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';

describe.skipIf(!process.env.DATABASE_URL)('Salla store provenance and real WhatsApp dispatch guards on MySQL',()=>{
  const q=async(sql:string,args:any[]=[]):Promise<any> => (await (await getPool())!.execute(sql,args))[0];
  let merchant:number,other:number,store:string,connectionId:number,users:number[],instance:number;
  const authority=()=>({merchantId:merchant,connectionId,storeId:store,accessToken:'synthetic-token'});
  const draft=(id='98765')=>({externalOrderId:id,orderNumber:id,customerPhone:'966500000000',customerName:'Synthetic',address:'Synthetic',items:'[]',totalAmount:100,paymentUrl:null,isGift:0 as const,discountCode:null});
  const create=(id='98765')=>persistSallaOrderProjection(authority(),draft(id));
  const receipt=async(id='98765')=>Number((await q("INSERT INTO salla_webhook_receipts(merchant_id,salla_store_id,event_key,event_type,resource_id,status,available_at) VALUES (?,?,?,'order.updated',?,'pending',NOW(3))",[merchant,store,randomBytes(32).toString('hex'),id])).insertId);
  beforeEach(async()=>{
    assertDisposableDatabase();vi.stubEnv('FIELD_ENCRYPTION_KEY','synthetic-salla-projection-encryption-only');users=[];
    const m=await createDisposableMerchant('salla-project'),b=await createDisposableMerchant('salla-other');users.push(m.userId,b.userId);merchant=m.merchantId;other=b.merchantId;store=String(700000000+merchant);
    connectionId=Number((await q("INSERT INTO salla_connections(merchantId,salla_store_id,storeUrl,accessToken,syncStatus) VALUES (?,?,'https://synthetic.example.test',?,'active')",[merchant,store,encryptSecret('synthetic-token')])).insertId);
    instance=Number((await q("INSERT INTO whatsapp_instances(merchant_id,instance_id,token,status,is_primary,provider) VALUES (?,?,'fixture','active',1,'green_api')",[merchant,'salla-'+merchant])).insertId);
    external.status.mockReset().mockResolvedValue({status:'shipped',trackingNumber:'TRACK-SYNTHETIC'});
    external.send.mockReset().mockImplementation(async()=>({accepted:true,outcome:'accepted',status:'sent',providerMessageId:randomUUID()}));
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants(users);vi.unstubAllEnvs();});afterAll(closeDb);
  it('saves one namespaced order and its provenance atomically without changing financial state',async()=>{
    await preflightSallaOrderAuthority(authority());const order=await create();
    expect(await q('SELECT merchantId,sallaOrderId,status,payment_status FROM orders WHERE id=?',[order.id])).toMatchObject([{merchantId:merchant,sallaOrderId:sallaOrderProjectionId(store,'98765'),status:'pending',payment_status:'unpaid'}]);
    expect(await q('SELECT * FROM salla_order_projections WHERE local_order_id=?',[order.id])).toMatchObject([{merchant_id:merchant,store_id:store,external_order_id:'98765',connection_id:connectionId}]);
  });
  it('does not overwrite a duplicate response with different recipient or amount',async()=>{
    const o=await create();await expect(persistSallaOrderProjection(authority(),{...draft(),customerPhone:'966599999999',totalAmount:200})).rejects.toThrow();
    expect((await q('SELECT customerPhone,totalAmount FROM orders WHERE id=?',[o.id]))[0]).toEqual({customerPhone:'966500000000',totalAmount:100});
  });
  it.each(['store','token','paused','connection','merchant'])('rejects stale %s when saving an accepted response',async change=>{
    const a=authority();if(change==='store')await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connectionId]);
    if(change==='token')await q('UPDATE salla_connections SET accessToken=? WHERE id=?',[encryptSecret('new-token'),connectionId]);
    if(change==='paused')await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);
    if(change==='connection')a.connectionId++;if(change==='merchant')a.merchantId=other;
    await expect(persistSallaOrderProjection(a,draft())).rejects.toThrow();expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
  });
  it('rolls back the local insert if provenance storage fails',async()=>{
    const pool=(await getPool())!,c=await pool.getConnection(),execute=c.execute.bind(c);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(c);
    vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{const r=await execute(sql,args);if(sql.includes('INSERT INTO salla_order_projections'))throw Error('synthetic fail');return r;})as any);
    await expect(create()).rejects.toThrow('synthetic fail');vi.restoreAllMocks();expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
  });
  it('retains both sides of a lost commit acknowledgment without a duplicate local order',async()=>{
    const pool=(await getPool())!,c=await pool.getConnection(),commit=c.commit.bind(c);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(c);
    vi.spyOn(c,'commit').mockImplementationOnce(async()=>{await commit();throw Error('synthetic lost ack');});
    await expect(create()).rejects.toThrow('lost ack');vi.restoreAllMocks();await expect(create()).rejects.toThrow();
    expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(1);expect(await q('SELECT id FROM salla_order_projections WHERE merchant_id=?',[merchant])).toHaveLength(1);
  });
  it('updates and notifies only the current store when the external number is reused after reconnect',async()=>{
    const first=await create(),oldStore=store;store+='1';await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store,connectionId]);const second=await create();
    await receipt();await runSallaWebhookReceiptBatch();
    expect((await q('SELECT status FROM orders WHERE id=?',[first.id]))[0].status).toBe('pending');expect((await q('SELECT status FROM orders WHERE id=?',[second.id]))[0].status).toBe('shipped');
    expect(external.send).toHaveBeenCalledTimes(1);expect(external.send.mock.calls[0][1].sallaOrderGuard.storeId).toBe(store);
    expect(external.send.mock.calls[0][1].idempotencyKey).not.toContain(`:${oldStore}:`);
  });
  it.each(['legacy','forged_alias'])('parks %s without guessing its store, while retaining the provider observation',async kind=>{
    const id=kind==='legacy'?'98765':sallaOrderProjectionId(store,'98765');const o=await q("INSERT INTO orders(merchantId,sallaOrderId,customerName,customerPhone,items,totalAmount) VALUES (?,?,'Unverified','966500000000','[]',100)",[merchant,id]);
    const r=await receipt();await runSallaWebhookReceiptBatch();expect(external.send).not.toHaveBeenCalled();
    expect((await q('SELECT status FROM orders WHERE id=?',[o.insertId]))[0].status).toBe('pending');
    expect((await q('SELECT status,last_error,effect_applied FROM salla_webhook_receipts WHERE id=?',[r]))[0]).toEqual({status:'manual_review',last_error:'order_store_unverified',effect_applied:1});
    expect(await q('SELECT id FROM salla_sales_observations WHERE merchant_id=?',[merchant])).toHaveLength(1);
  });
  it('retries rejected delivery with the new receipt lease, exactly once after acceptance',async()=>{
    await create();const r=await receipt();external.send.mockResolvedValueOnce({accepted:false,outcome:'rejected',status:'failed',errorCode:'http_400'});
    await runSallaWebhookReceiptBatch();await q('UPDATE salla_webhook_receipts SET available_at=NOW(3) WHERE id=?',[r]);await runSallaWebhookReceiptBatch();
    expect(external.send).toHaveBeenCalledTimes(2);expect(external.status).toHaveBeenCalledTimes(1);
    await q("UPDATE salla_webhook_receipts SET status='pending',available_at=NOW(3) WHERE id=?",[r]);await runSallaWebhookReceiptBatch();expect(external.send).toHaveBeenCalledTimes(2);
  });
  it('never retries an ambiguous WhatsApp result automatically',async()=>{
    await create();const r=await receipt();external.send.mockResolvedValueOnce({accepted:false,outcome:'unknown',status:'failed',errorCode:'provider_unreachable'});
    await runSallaWebhookReceiptBatch();await q('UPDATE salla_webhook_receipts SET available_at=NOW(3) WHERE id=?',[r]);await runSallaWebhookReceiptBatch();expect(external.send).toHaveBeenCalledTimes(1);
  });
  const notice=async()=>{
    const o=await create(),r=await receipt();await q("UPDATE orders SET status='shipped',trackingNumber='TRACK-SYNTHETIC' WHERE id=?",[o.id]);
    await q("UPDATE salla_webhook_receipts SET status='processing',processing_token='synthetic-lease',claimed_at=NOW(3),effect_applied=1,notification_required=1,notification_status='shipped' WHERE id=?",[r]);
    const guard={storeId:store,orderId:'98765',localOrderId:o.id,receiptId:r,processingToken:'synthetic-lease',status:'shipped' as const};
    const input={merchantId:merchant,idempotencyKey:sallaOrderNoticeKey(merchant,guard),kind:'text' as const,to:'966500000000',text:sallaOrderStatusMessage({id:o.id,status:'shipped',customerPhone:'966500000000',customerName:'Synthetic',orderNumber:'98765',trackingNumber:'TRACK-SYNTHETIC'},'shipped'),sallaOrderGuard:guard,retryFailed:true};
    return {input,o,r};
  };
  it.each(['store','recipient','state','lease','expired','scope'])('rechecks %s at the actual transport boundary',async change=>{
    const {input,o,r}=await notice(),pool=(await getPool())!,execute=pool.execute.bind(pool);let changed=false;
    vi.spyOn(pool,'execute').mockImplementation((async(sql:string,args:any[])=>{const result=await execute(sql,args);
      if(!changed&&sql.includes('INSERT INTO whatsapp_message_deliveries')){changed=true;
        if(change==='store')await execute('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connectionId]);
        if(change==='recipient')await execute("UPDATE orders SET customerPhone='966599999999' WHERE id=?",[o.id]);
        if(change==='state')await execute("UPDATE orders SET status='delivered' WHERE id=?",[o.id]);
        if(change==='lease')await execute("UPDATE salla_webhook_receipts SET processing_token='another-worker' WHERE id=?",[r]);
        if(change==='expired')await execute('UPDATE salla_webhook_receipts SET claimed_at=DATE_SUB(NOW(3),INTERVAL 11 MINUTE) WHERE id=?',[r]);
        if(change==='scope')await execute('UPDATE salla_order_projections SET merchant_id=? WHERE local_order_id=?',[other,o.id]);
      }return result;})as any);
    expect(await sendMerchantWhatsApp(input)).toMatchObject({accepted:false,errorCode:'salla_order_suppressed'});expect(external.send).not.toHaveBeenCalled();
  });
  it.each(['drop_guard','change_text','change_recipient','legacy_key'])('rejects transport tampering %s',async change=>{
    const {input}=await notice();if(change==='drop_guard')delete (input as any).sallaOrderGuard;if(change==='change_text')input.text='forged';if(change==='change_recipient')input.to='966599999999';if(change==='legacy_key')input.idempotencyKey=`salla-order:${merchant}:98765:shipped`;
    expect(await sendMerchantWhatsApp(input)).toMatchObject({accepted:false,errorCode:'salla_order_suppressed'});expect(external.send).not.toHaveBeenCalled();
  });
  it('cannot strip a persisted guard even from a malformed legacy key on retry',async()=>{
    const {input}=await notice();input.idempotencyKey='unprefixed_synthetic_key';await sendMerchantWhatsApp(input);delete (input as any).sallaOrderGuard;
    expect(await sendMerchantWhatsApp(input)).toMatchObject({accepted:false,duplicate:true});expect(external.send).not.toHaveBeenCalled();
  });
  it('queues polls through the durable worker without HTTP during scheduling, including concurrent cron runs',async()=>{
    const o=await create();const results=await Promise.all([enqueueSallaOrderPolls(),enqueueSallaOrderPolls()]);expect(results.reduce((n,r)=>n+r.queued,0)).toBe(1);
    expect(external.status).not.toHaveBeenCalled();expect(external.send).not.toHaveBeenCalled();
    await runSallaWebhookReceiptBatch();expect((await q('SELECT status FROM orders WHERE id=?',[o.id]))[0].status).toBe('shipped');expect(external.send).toHaveBeenCalledTimes(1);
    expect((await enqueueSallaOrderPolls()).queued).toBe(0);
  });
  it.each(['pending','processing','failed','manual_review'])('does not bypass an existing %s receipt through hourly polling',async state=>{
    await create();const r=await receipt();await q('UPDATE salla_webhook_receipts SET status=? WHERE id=?',[state,r]);expect((await enqueueSallaOrderPolls()).queued).toBe(0);
  });
  it('excludes legacy, other-store, terminal and unproved aliases from polling',async()=>{
    const old=await create();store+='1';await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store,connectionId]);const done=await create('22');await q("UPDATE orders SET status='delivered' WHERE id=?",[done.id]);
    for(const alias of ['123','zid:anything',sallaOrderProjectionId(store,'33')])await q("INSERT INTO orders(merchantId,sallaOrderId,customerName,customerPhone,items,totalAmount) VALUES (?,?,'Synthetic','966500000000','[]',100)",[merchant,alias]);
    expect(await enqueueSallaOrderPolls()).toEqual({checked:0,queued:0});expect(external.status).not.toHaveBeenCalled();
  });
});
