import {randomUUID} from 'node:crypto';
import {describe,beforeEach,afterEach,afterAll,it,expect} from 'vitest';
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {reviewOrderStatus,writeOrderStatus,OrderStatusConflict,OrderStatusPrecondition} from './order-status-review';
import {orderNoticeAuthorizationContract,orderNoticeAuthorityDigest,readOrderNoticeOrderDigest,readOrderNoticeChannel} from './order-notification-authority';
describe.skipIf(!process.env.DATABASE_URL)('reviewed notification authority MySQL',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,orderId:number,instanceId:number;
 const sql=async(q:string,p:any[]=[])=> (await (await getPool())!.execute<any>(q,p))[0];
 const prepare=async(actorId=owner.userId,notify=true)=>{const intent={id:orderId,status:'processing',notify},r=await reviewOrderStatus(owner.merchantId,actorId,intent);return {requestId:randomUUID(),intent:r.intent,expectedDigest:r.digest,reviewed:true as const};};
 const write=(input:unknown,actorId=owner.userId)=>writeOrderStatus(owner.merchantId,actorId,input);
 beforeEach(async()=>{
   owner=await createDisposableMerchant('notice-grant');other=await createDisposableMerchant('notice-foreign');
   orderId=(await sql("INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,currency,status) VALUES (?,'+12025550161','Local','[]',10000,'SAR','pending')",[owner.merchantId])).insertId;
   instanceId=(await sql("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,is_primary,phone_number_id) VALUES (?,?,'local-only-token','meta_cloud','active',1,'123456')",[owner.merchantId,'grant-'+randomUUID()])).insertId;
   await sql("INSERT INTO notification_templates (merchant_id,status,template,enabled) VALUES (?,'processing','{{customerName}} / {{orderNumber}} / {{total}} {{currency}}',1)",[owner.merchantId]);
 });
 afterEach(()=>cleanupDisposableMerchants([owner?.userId,other?.userId].filter(Boolean)));afterAll(closeDb);
 it('atomically links the message, reviewed actor, receipt, exact order and channel, including replay',async()=>{
   const input=await prepare(),receipt=await write(input);expect(receipt.notificationQueued).toBe(true);expect(await write(input)).toEqual(receipt);
   const grants=await sql('SELECT * FROM order_notification_authorizations WHERE merchant_id=?',[owner.merchantId]);expect(grants).toHaveLength(1);const grant=grants[0],contract=orderNoticeAuthorizationContract.parse(typeof grant.reviewed_contract==='string'?JSON.parse(grant.reviewed_contract):grant.reviewed_contract);
   expect(grant.contract_digest).toBe(orderNoticeAuthorityDigest(contract));expect(contract).toMatchObject({merchantId:owner.merchantId,ownerId:owner.userId,actorId:owner.userId,orderId,instanceId,provider:'meta_cloud',requestKey:input.requestId,reviewDigest:input.expectedDigest,status:'processing',recipient:'+12025550161'});
   const [notice]=await sql('SELECT * FROM order_notifications WHERE merchant_id=? AND id=?',[owner.merchantId,grant.notification_id]);expect(notice.message).toBe(contract.message);expect(notice.event_key).toBe(contract.eventKey);expect(notice.claim_token).toBeNull();
   const [stored]=await sql('SELECT * FROM order_status_receipts WHERE merchant_id=? AND id=?',[owner.merchantId,grant.receipt_id]);expect(stored.request_id).toBe(input.requestId);expect(stored.input_hash).toBe(contract.inputHash);
   const tx=await (await getPool())!.getConnection();try{expect(await readOrderNoticeOrderDigest(tx,owner.merchantId,orderId)).toBe(contract.orderDigest);expect(await readOrderNoticeChannel(tx,owner.merchantId)).toEqual({instanceId,provider:contract.provider,channelDigest:contract.channelDigest});}finally{tx.release();}
   expect(JSON.stringify(contract)).not.toContain('local-only-token');
 });
 it('does not create a grant or message when notification was not requested',async()=>{await write(await prepare(owner.userId,false));expect(await sql('SELECT id FROM order_notification_authorizations WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);expect(await sql('SELECT id FROM order_notifications WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);});
 it('serializes duplicate reviewed notification requests into one message and one grant',async()=>{const input=await prepare(),[a,b]=await Promise.all([write(input),write(input)]);expect(a).toEqual(b);for(const table of ['order_notifications','order_status_receipts','order_notification_authorizations'])expect(await sql(`SELECT id FROM ${table} WHERE merchant_id=?`,[owner.merchantId])).toHaveLength(1);});
 it('rejects a revoked team actor after review without queuing a message',async()=>{await sql("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[owner.merchantId,other.userId]);const input=await prepare(other.userId);await sql('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[owner.merchantId,other.userId]);await expect(write(input,other.userId)).rejects.toBeInstanceOf(OrderStatusConflict);expect(await sql('SELECT id FROM order_notifications WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);});
 it.each(["token='rotated'","phone_number_id='654321'","provider_account_id='other'","instance_id='changed'","api_url='https://example.test/local'","is_primary=0","is_primary=0,status='inactive'"] )('blocks a reviewed notification after channel change %s',async change=>{
   const input=await prepare();await sql(`UPDATE whatsapp_instances SET ${change} WHERE id=?`,[instanceId]);await expect(write(input)).rejects.toBeInstanceOf(change.includes('is_primary')||change.includes('status')?OrderStatusPrecondition:OrderStatusConflict);expect((await sql('SELECT status FROM orders WHERE id=?',[orderId]))[0].status).toBe('pending');expect(await sql('SELECT id FROM order_notifications WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);
 });
 it('keeps the database constraint against a second primary channel',async()=>{await expect(sql("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,is_primary,phone_number_id) VALUES (?,?,'local-only','meta_cloud','active',1,'456')",[owner.merchantId,randomUUID()])).rejects.toMatchObject({code:'ER_DUP_ENTRY'});expect((await prepare()).expectedDigest).toMatch(/^[a-f0-9]{64}$/);});
 it.each(["enabled=3","template='{{unsupported}}'","template=''" ])('rejects invalid stored template %s before queuing',async change=>{await sql(`UPDATE notification_templates SET ${change} WHERE merchant_id=?`,[owner.merchantId]);await expect(prepare()).rejects.toBeInstanceOf(OrderStatusPrecondition);});
 it('keeps a permitted team actor distinct from the owner and rejects an owner pending deletion',async()=>{
   await sql("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'sales_supervisor',1)",[owner.merchantId,other.userId]);const input=await prepare(other.userId);await sql("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);await expect(write(input,other.userId)).rejects.toBeInstanceOf(OrderStatusConflict);await sql("UPDATE users SET account_status='active' WHERE id=?",[owner.userId]);await write(input,other.userId);const [grant]=await sql('SELECT actor_id FROM order_notification_authorizations WHERE merchant_id=?',[owner.merchantId]);expect(grant.actor_id).toBe(other.userId);
 });
 it('rejects a notification for a merchant awaiting activation',async()=>{await sql("UPDATE merchants SET status='pending' WHERE id=?",[owner.merchantId]);await expect(prepare()).rejects.toBeInstanceOf(OrderStatusPrecondition);});
 it('rolls back the order, outbox and receipt when the grant cannot be stored',async()=>{
   const input=await prepare();await sql('INSERT INTO order_notification_authorizations (notification_id,merchant_id,order_id,actor_id,receipt_id,event_key,request_key,contract_digest,reviewed_contract) VALUES (?,?,?,?,?,?,?,?,?)',[2147483647,owner.merchantId,orderId,owner.userId,2147483647,'a'.repeat(64),input.requestId,'b'.repeat(64),'{}']);
   await expect(write(input)).rejects.toMatchObject({code:'ER_DUP_ENTRY'});expect((await sql('SELECT status FROM orders WHERE id=?',[orderId]))[0].status).toBe('pending');expect(await sql('SELECT id FROM order_notifications WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);expect(await sql('SELECT id FROM order_status_receipts WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);
 });
});
