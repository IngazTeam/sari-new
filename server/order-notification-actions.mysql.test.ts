import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants, assertDisposableDatabase } from './tests/helpers/disposable-merchant';
import { readOrderNoticeWorkspace, readOrderNoticeDetail } from './order-notification-workspace';
import { saveReviewedOrderNoticeTemplate as save, acknowledgeReviewedOrderNotices as ack } from './order-notification-actions';
describe.skipIf(!process.env.DATABASE_URL)('reviewed order notification writes',()=>{
  let a:Awaited<ReturnType<typeof createDisposableMerchant>>,b:typeof a;
  const q=async(sql:string,args:any[]=[])=>{assertDisposableDatabase();return(await(await getPool())!.execute<any>(sql,args))[0];};
  const snapshot=()=>readOrderNoticeWorkspace(a.userId,a.merchantId,{});
  const template=async()=>{const row=(await snapshot()).templates.find(t=>t.status==='paid')!;return{status:'paid' as const,revision:row.revision,template:'Reviewed {{orderNumber}}',enabled:true};};
  const notice=async(merchant=a.merchantId)=>{
    const order=Number((await q("INSERT INTO orders (merchantId,customerName,customerPhone,items,totalAmount) VALUES (?,'Synthetic','+966500000000','[]',100)",[merchant])).insertId);
    const id=Number((await q("INSERT INTO order_notifications (merchant_id,order_id,event_key,customer_phone,status,message,delivery_status) VALUES (?,?,?,'+966500000000','paid','Synthetic','manual_review')",[merchant,order,randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','')])).insertId);
    return{id,order};
  };
  const record=async(id:number)=>{const {row}=await readOrderNoticeDetail(a.userId,a.merchantId,{id});return{id,revision:row.revision};};
  beforeEach(async()=>{a=await createDisposableMerchant('notice-action');b=await createDisposableMerchant('notice-other');});afterEach(()=>cleanupDisposableMerchants([a.userId,b.userId]));afterAll(closeDb);
  it('creates a scoped template, preserves identical retries and rejects stale overwrites',async()=>{
    const draft=await template(),r=await save(a.userId,a.merchantId,draft);expect(r).toMatchObject({effect:'saved',sendsMessage:false,template:{stored:true,enabled:true,template:draft.template}});
    expect((await save(a.userId,a.merchantId,draft)).effect).toBe('already_current');await expect(save(a.userId,a.merchantId,{...draft,template:'Overwrite'})).rejects.toMatchObject({reason:'stale'});
    expect(await q('SELECT merchant_id,template FROM notification_templates WHERE merchant_id IN (?,?)',[a.merchantId,b.merchantId])).toEqual([{merchant_id:a.merchantId,template:draft.template}]);
  });
  it('permits only one of two concurrent changes based on the same snapshot',async()=>{
    const draft=await template(),results=await Promise.allSettled([save(a.userId,a.merchantId,{...draft,template:'One'}),save(a.userId,a.merchantId,{...draft,template:'Two'})]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  });
  it('binds template revision to actor and tenant even for an absent status',async()=>{
    const draft=await template();await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[a.merchantId,b.userId]);
    await expect(save(b.userId,a.merchantId,draft)).rejects.toMatchObject({reason:'stale'});await expect(save(b.userId,b.merchantId,draft)).rejects.toMatchObject({reason:'stale'});
  });
  it('closes only the reviewed set and leaves a newly arrived incident open',async()=>{
    const first=await notice(),second=await notice();const records=[await record(first.id),await record(second.id)];const later=await notice();
    expect(await ack(a.userId,a.merchantId,{records})).toEqual({actorId:a.userId,merchantId:a.merchantId,acknowledgedIds:[first.id,second.id],sendsMessage:false});
    const rows=await q('SELECT id,delivery_status,reviewed_by_user_id FROM order_notifications WHERE merchant_id=? ORDER BY id',[a.merchantId]);
    expect(rows).toEqual([{id:first.id,delivery_status:'suppressed',reviewed_by_user_id:a.userId},{id:second.id,delivery_status:'suppressed',reviewed_by_user_id:a.userId},{id:later.id,delivery_status:'manual_review',reviewed_by_user_id:null}]);
    await expect(ack(a.userId,a.merchantId,{records})).rejects.toMatchObject({reason:'stale'});
  });
  it('rolls back the entire selection if any record changed, disappeared or belongs to another tenant',async()=>{
    const first=await notice(),second=await notice(),foreign=await notice(b.merchantId);const records=[await record(first.id),await record(second.id)];
    await q('UPDATE order_notifications SET attempts=attempts+1 WHERE id=?',[second.id]);await expect(ack(a.userId,a.merchantId,{records})).rejects.toMatchObject({reason:'stale'});
    await expect(ack(a.userId,a.merchantId,{records:[records[0],{id:foreign.id,revision:records[1].revision}]})).rejects.toMatchObject({reason:'missing'});
    expect((await readOrderNoticeDetail(a.userId,a.merchantId,{id:first.id})).row.state).toBe('manual_review');
  });
  it('refuses cross-linked orders and missing event identity',async()=>{
    const local=await notice(),foreign=await notice(b.merchantId);await q('UPDATE order_notifications SET order_id=? WHERE id=?',[foreign.order,local.id]);
    await expect(ack(a.userId,a.merchantId,{records:[await record(local.id)]})).rejects.toMatchObject({reason:'reference'});
    await q('UPDATE order_notifications SET order_id=?,event_key=NULL WHERE id=?',[local.order,local.id]);await expect(ack(a.userId,a.merchantId,{records:[await record(local.id)]})).rejects.toMatchObject({reason:'reference'});
  });
  it.each(['viewer','sales_supervisor','revoked','owner_deleted','actor_deleted','pending','suspended'])('rechecks %s before either write',async condition=>{
    const draft=await template(),f=await notice(),records=[await record(f.id)];
    if(['viewer','sales_supervisor','revoked'].includes(condition))await q('INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,?)',[a.merchantId,a.userId,condition==='revoked'?'owner':condition,condition==='revoked'?0:1]);
    if(condition==='actor_deleted'||condition==='owner_deleted')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[a.userId]);
    if(condition==='pending'||condition==='suspended')await q('UPDATE merchants SET status=? WHERE id=?',[condition,a.merchantId]);
    await expect(save(a.userId,a.merchantId,draft)).rejects.toMatchObject({reason:'forbidden'});await expect(ack(a.userId,a.merchantId,{records})).rejects.toMatchObject({reason:'forbidden'});
    expect(await q('SELECT id FROM notification_templates WHERE merchant_id=?',[a.merchantId])).toEqual([]);
  });
});
