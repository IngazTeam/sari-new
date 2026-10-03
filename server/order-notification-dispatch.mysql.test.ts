import {randomUUID} from 'node:crypto';
import {describe,beforeEach,afterEach,afterAll,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({send:vi.fn(),afterRead:vi.fn(),beforeExecute:vi.fn(),commit:vi.fn()}));
vi.mock('./db/connection',async original=>{const db=await original<typeof import('./db/connection')>();return {...db,getPool:async()=>{const pool=await db.getPool();if(!pool)return pool;return new Proxy(pool,{get(target,prop){if(prop==='getConnection')return async()=>{const tx=await target.getConnection();return new Proxy(tx,{get(connection,key){if(key==='execute')return async(...args:any[])=>{await m.beforeExecute(...args);return (connection.execute as any)(...args);};if(key==='commit')return async()=>m.commit.getMockImplementation()?m.commit(()=>connection.commit()):connection.commit();const value=Reflect.get(connection,key);return typeof value==='function'?value.bind(connection):value;}});};const value=Reflect.get(target,prop);return typeof value==='function'?value.bind(target):value;}});}};});
vi.mock('./channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({send:m.send})}));
vi.mock('./db',async original=>{const db=await original<typeof import('./db')>();return {...db,getWhatsAppInstanceById:async(id:number)=>{const result=await db.getWhatsAppInstanceById(id);await m.afterRead();return result;}};});
import {getPool,getDb,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {reviewOrderStatus,writeOrderStatus} from './order-status-review';
import {claimReviewedOrderNotice,reconcileOrderNoticeClaim,recoverReviewedOrderNoticeLeases} from './order-notification-dispatch';
import {sendMerchantWhatsApp} from './channels/whatsapp/service';
import {runOrderStatusNotificationBatch} from './orders/order-status-notification-outbox';
import type {SendMerchantWhatsAppInput} from './channels/whatsapp/types';
describe.skipIf(!process.env.DATABASE_URL)('reviewed order notification transport MySQL',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,orderId:number,instanceId:number,noticeId:number;
 const sql=async(q:string,p:any[]=[])=> (await (await getPool())!.execute<any>(q,p))[0];
 const row=async()=>(await sql('SELECT * FROM order_notifications WHERE merchant_id=? AND id=?',[owner.merchantId,noticeId]))[0];
 const claim=async()=>{const input=await claimReviewedOrderNotice(owner.merchantId,noticeId);expect(input).not.toBeNull();return input!;};
 const send=async(input:SendMerchantWhatsAppInput)=>{let result;try{result=await sendMerchantWhatsApp(input);}finally{await reconcileOrderNoticeClaim(input);}return result;};
 const due=()=>sql('UPDATE order_notifications SET available_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE merchant_id=? AND id=?',[owner.merchantId,noticeId]);
 const ledger=()=>sql('SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=?',[owner.merchantId]);
 const fakeReceipt=async(input:SendMerchantWhatsAppInput,status='sent',providerId:string|null='SIMULATED-ACCEPTED',patch:object={})=>sql("INSERT INTO whatsapp_message_deliveries (merchant_id,instance_id,provider,direction,status,provider_message_id,idempotency_key,request_json) VALUES (?,?,'meta_cloud','outgoing',?,?,?,?)",[owner.merchantId,instanceId,status,providerId,input.idempotencyKey,JSON.stringify({to:input.to,kind:input.kind,text:input.text,orderNoticeGuard:input.orderNoticeGuard,...patch})]);
 beforeEach(async()=>{
  await getDb();vi.resetAllMocks();owner=await createDisposableMerchant('notice-send');other=await createDisposableMerchant('notice-other');
  orderId=(await sql("INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,currency,status) VALUES (?,'+12025550161','Local','[]',10000,'SAR','pending')",[owner.merchantId])).insertId;
  instanceId=(await sql("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,is_primary,phone_number_id) VALUES (?,?,'local-only-token','meta_cloud','active',1,'123456')",[owner.merchantId,'dispatch-'+randomUUID()])).insertId;
  await sql("INSERT INTO notification_templates (merchant_id,status,template,enabled) VALUES (?,'processing','Order {{orderNumber}} for {{customerName}} / {{total}} {{currency}}',1)",[owner.merchantId]);
  const intent={id:orderId,status:'processing',notify:true},review=await reviewOrderStatus(owner.merchantId,owner.userId,intent);await writeOrderStatus(owner.merchantId,owner.userId,{requestId:randomUUID(),intent,expectedDigest:review.digest,reviewed:true});
  noticeId=(await sql('SELECT id FROM order_notifications WHERE merchant_id=?',[owner.merchantId]))[0].id;
  m.send.mockResolvedValue({accepted:true,outcome:'accepted',status:'sent',providerMessageId:'SIMULATED-'+randomUUID()});
 });
 afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner?.userId,other?.userId].filter(Boolean));});afterAll(closeDb);
 it('dispatches once through the reviewed tenant channel and stores acceptance atomically',async()=>{
  const input=await claim(),result=await send(input);expect(result?.accepted).toBe(true);expect((await row()).delivery_status).toBe('sent');expect((await ledger())[0]).toMatchObject({status:'sent',instance_id:instanceId,provider:'meta_cloud'});expect((await sendMerchantWhatsApp(input)).accepted).toBe(true);expect(m.send).toHaveBeenCalledOnce();expect(m.send.mock.calls[0][1]).toMatchObject({to:input.to,text:input.text,instanceRecordId:instanceId});expect(JSON.stringify((await ledger())[0].request_json)).not.toContain('local-only-token');
 });
 it('runs the actual batch worker without a direct unguarded provider call',async()=>{expect(await runOrderStatusNotificationBatch(25)).toBeGreaterThanOrEqual(1);expect((await row()).delivery_status).toBe('sent');expect(m.send).toHaveBeenCalledOnce();expect(await runOrderStatusNotificationBatch(25)).toBe(0);expect(m.send).toHaveBeenCalledOnce();});
 it('serializes concurrent claims',async()=>{const results=await Promise.all([claimReviewedOrderNotice(owner.merchantId,noticeId),claimReviewedOrderNotice(owner.merchantId,noticeId)]);expect(results.filter(Boolean)).toHaveLength(1);expect((await row()).attempts).toBe(1);});
 it.each(['unknown','throw','accepted-without-id'])('quarantines %s and never repeats the provider call',async mode=>{
  if(mode==='throw')m.send.mockRejectedValue(Error('transport outcome unavailable'));else m.send.mockResolvedValue(mode==='unknown'?{accepted:false,outcome:'unknown',status:'failed',errorCode:'http_500'}:{accepted:true,outcome:'accepted',status:'sent'});
  const input=await claim();await send(input);expect((await row()).delivery_status).toBe('manual_review');expect(await claimReviewedOrderNotice(owner.merchantId,noticeId)).toBeNull();expect((await sendMerchantWhatsApp(input)).accepted).toBe(false);expect(m.send).toHaveBeenCalledOnce();
 });
 it('retries only a matching definitive rejection under a new valid claim',async()=>{
  m.send.mockResolvedValueOnce({accepted:false,outcome:'rejected',status:'failed',errorCode:'http_400'});const first=await claim();await send(first);expect((await row()).delivery_status).toBe('failed');await due();const next=await claim();expect(next.orderNoticeGuard?.claimToken).not.toBe(first.orderNoticeGuard?.claimToken);await send(next);expect((await row()).delivery_status).toBe('sent');expect(m.send).toHaveBeenCalledTimes(2);
 });
 it('bounds explicit rejection retries at eight attempts',async()=>{await sql('UPDATE order_notifications SET attempts=7 WHERE id=?',[noticeId]);m.send.mockResolvedValue({accepted:false,outcome:'rejected',status:'failed',errorCode:'http_400'});await send(await claim());expect((await row()).delivery_status).toBe('manual_review');await due();expect(await claimReviewedOrderNotice(owner.merchantId,noticeId)).toBeNull();expect(m.send).toHaveBeenCalledOnce();});
 it.each(['phone','text','guard','instance','lease'])('blocks altered transport %s before provider I/O',async change=>{
  const input=await claim();if(change==='phone')input.to='+12025550162';if(change==='text')input.text='Different';if(change==='guard')input.orderNoticeGuard=undefined;if(change==='instance')input.instanceRecordId=2147483647;if(change==='lease')input.orderNoticeGuard!.claimToken=randomUUID();
  await sendMerchantWhatsApp(input);expect(m.send).not.toHaveBeenCalled();
 });
 it.each(['phone','order-status','owner','membership','channel','token','expired-lease'])('rechecks %s after the transport has read its channel',async change=>{
  const input=await claim();m.afterRead.mockImplementationOnce(async()=>{
   if(change==='phone')await sql("UPDATE orders SET customerPhone='+12025550162' WHERE id=?",[orderId]);
   if(change==='order-status')await sql("UPDATE orders SET status='shipped' WHERE id=?",[orderId]);
   if(change==='owner')await sql("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);
   if(change==='membership')await sql("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",[owner.merchantId,owner.userId]);
   if(change==='channel')await sql("UPDATE whatsapp_instances SET is_primary=0,status='inactive' WHERE id=?",[instanceId]);
   if(change==='token')await sql("UPDATE whatsapp_instances SET token='changed' WHERE id=?",[instanceId]);
   if(change==='expired-lease')await sql('UPDATE order_notifications SET claimed_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 11 MINUTE) WHERE id=?',[noticeId]);
  });await send(input);expect(m.send).not.toHaveBeenCalled();expect((await row()).delivery_status).toBe(change==='expired-lease'?'failed':'manual_review');
 });
 it('retains the frozen message when a later template is disabled',async()=>{await sql('UPDATE notification_templates SET enabled=0 WHERE merchant_id=?',[owner.merchantId]);await send(await claim());expect(m.send).toHaveBeenCalledOnce();expect((await row()).delivery_status).toBe('sent');});
 it('does not invent authority for legacy rows',async()=>{await sql('DELETE FROM order_notification_authorizations WHERE merchant_id=?',[owner.merchantId]);expect(await claimReviewedOrderNotice(owner.merchantId,noticeId)).toBeNull();expect((await row()).delivery_status).toBe('manual_review');expect(m.send).not.toHaveBeenCalled();});
 it('rejects foreign order and authorization references before claiming',async()=>{const foreign=(await sql("INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,currency,status) VALUES (?,'+12025550162','Other','[]',100,'SAR','processing')",[other.merchantId])).insertId;await sql('UPDATE order_notifications SET order_id=? WHERE id=?',[foreign,noticeId]);expect(await claimReviewedOrderNotice(owner.merchantId,noticeId)).toBeNull();expect((await row()).delivery_status).toBe('manual_review');expect(m.send).not.toHaveBeenCalled();});
 it('invalidates a changed stored contract rather than trusting its JSON',async()=>{await sql("UPDATE order_notification_authorizations SET reviewed_contract=JSON_SET(reviewed_contract,'$.message','Changed') WHERE merchant_id=?",[owner.merchantId]);expect(await claimReviewedOrderNotice(owner.merchantId,noticeId)).toBeNull();expect(m.send).not.toHaveBeenCalled();});
 it.each(['sent','delivered','read','failed'])('recovers matching %s acceptance without sending after owner revocation',async status=>{
  const input=await claim();await fakeReceipt(input,status);await sql("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);await sql('UPDATE order_notifications SET claimed_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 11 MINUTE) WHERE id=?',[noticeId]);await recoverReviewedOrderNoticeLeases();expect((await row()).delivery_status).toBe('sent');expect(m.send).not.toHaveBeenCalled();
 });
 it.each(['body','recipient','missing-id','direction','instance','provider','created','updated','guard'])('quarantines a contradictory %s receipt without accepting or retrying it',async mode=>{
  const input=await claim();await fakeReceipt(input,'sent',mode==='missing-id'?null:'SYNTHETIC-'+randomUUID(),mode==='body'?{text:'Other'}:mode==='recipient'?{to:'+12025550162'}:mode==='guard'?{orderNoticeGuard:{...input.orderNoticeGuard,contractDigest:'e'.repeat(64)}}:{});
  if(mode==='direction')await sql("UPDATE whatsapp_message_deliveries SET direction='incoming' WHERE merchant_id=?",[owner.merchantId]);
  if(mode==='instance')await sql('UPDATE whatsapp_message_deliveries SET instance_id=NULL WHERE merchant_id=?',[owner.merchantId]);
  if(mode==='provider')await sql("UPDATE whatsapp_message_deliveries SET provider='green_api' WHERE merchant_id=?",[owner.merchantId]);
  if(mode==='created')await sql('UPDATE whatsapp_message_deliveries SET created_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE merchant_id=?',[owner.merchantId]);
  if(mode==='updated')await sql('UPDATE whatsapp_message_deliveries SET status_updated_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE merchant_id=?',[owner.merchantId]);
  await reconcileOrderNoticeClaim(input);expect((await row()).delivery_status).toBe('manual_review');expect(m.send).not.toHaveBeenCalled();
 });
 it('reclaims a stale pre-dispatch lease without letting the old claimant poison the next reservation',async()=>{const old=await claim();await sql('UPDATE order_notifications SET claimed_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 11 MINUTE) WHERE id=?',[noticeId]);await recoverReviewedOrderNoticeLeases();expect((await row()).delivery_status).toBe('failed');await due();const next=await claim();await sendMerchantWhatsApp(old);expect(m.send).not.toHaveBeenCalled();expect(await ledger()).toHaveLength(0);await reconcileOrderNoticeClaim(old);expect((await row()).claim_token).toBe(next.orderNoticeGuard!.claimToken);await send(next);expect((await row()).delivery_status).toBe('sent');expect(m.send).toHaveBeenCalledOnce();});
 it('serializes duplicate sends while the provider is running',async()=>{
  const input=await claim();let started!:()=>void,finish!:()=>void;const entered=new Promise<void>(r=>started=r),held=new Promise<void>(r=>finish=r);
  m.send.mockImplementationOnce(async()=>{started();await held;return {accepted:true,outcome:'accepted',status:'sent',providerMessageId:'SIMULATED-CONCURRENT'};});
  const first=sendMerchantWhatsApp(input);await entered;const duplicate=sendMerchantWhatsApp(input);finish();const result=await Promise.all([first,duplicate]);expect(result.every(r=>r.accepted)).toBe(true);expect(m.send).toHaveBeenCalledOnce();expect((await row()).delivery_status).toBe('sent');
 });
 it.each(['merchant','owner','order','channel'])('keeps the %s authority locked through provider I/O',async target=>{
  const input=await claim();m.send.mockImplementationOnce(async()=>{
   const tx=await (await getPool())!.getConnection();await tx.beginTransaction();
   const [query,recordId]=target==='merchant'?['SELECT id FROM merchants WHERE id=? FOR UPDATE NOWAIT',owner.merchantId]:target==='owner'?['SELECT id FROM users WHERE id=? FOR UPDATE NOWAIT',owner.userId]:target==='order'?['SELECT id FROM orders WHERE id=? FOR UPDATE NOWAIT',orderId]:['SELECT id FROM whatsapp_instances WHERE id=? FOR UPDATE NOWAIT',instanceId];
   try{await expect(tx.execute(String(query),[recordId])).rejects.toMatchObject({code:'ER_LOCK_NOWAIT'});}finally{await tx.rollback();tx.release();}
   return {accepted:true,outcome:'accepted',status:'sent',providerMessageId:'SIMULATED-LOCKED'};
  });await send(input);expect((await row()).delivery_status).toBe('sent');expect(m.send).toHaveBeenCalledOnce();
 });
 it.each(['ledger-write','commit-before','commit-after'])('recovers %s failure after provider acceptance without sending twice',async failure=>{
  const input=await claim();m.send.mockImplementationOnce(async()=>{
   if(failure==='ledger-write')m.beforeExecute.mockImplementationOnce(async(q:string)=>{if(q.includes('UPDATE whatsapp_message_deliveries'))throw Error('Injected persistence failure');});
   else m.commit.mockImplementationOnce(async(commit:()=>Promise<void>)=>{if(failure==='commit-after')await commit();throw Error('Injected uncertain commit');});
   return {accepted:true,outcome:'accepted',status:'sent',providerMessageId:'SIMULATED-UNKNOWN-COMMIT'};
  });await expect(sendMerchantWhatsApp(input)).rejects.toThrow();m.commit.mockReset();m.beforeExecute.mockReset();await reconcileOrderNoticeClaim(input);
  expect((await row()).delivery_status).toBe(failure==='commit-after'?'sent':'manual_review');await due();expect(await claimReviewedOrderNotice(owner.merchantId,noticeId)).toBeNull();await sendMerchantWhatsApp(input);expect(m.send).toHaveBeenCalledOnce();
 });
 it.each(['revoked','body','stripped-guard'])('does not retry a rejection after %s changes',async change=>{
  m.send.mockResolvedValueOnce({accepted:false,outcome:'rejected',status:'failed',errorCode:'http_400'});const first=await claim();await send(first);await due();const next=await claim();
  if(change==='revoked')await sql("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);
  if(change==='body')await sql("UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.text','Other') WHERE merchant_id=?",[owner.merchantId]);
  await sendMerchantWhatsApp(change==='stripped-guard'?{...next,orderNoticeGuard:undefined}:next);expect(m.send).toHaveBeenCalledOnce();expect((await ledger())[0].status).toBe('failed');
 });
 it('never retries a queued stale lease',async()=>{const input=await claim();await fakeReceipt(input,'queued',null);await sql('UPDATE order_notifications SET claimed_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 11 MINUTE) WHERE id=?',[noticeId]);await recoverReviewedOrderNoticeLeases();expect((await row()).delivery_status).toBe('manual_review');expect(m.send).not.toHaveBeenCalled();});
});
