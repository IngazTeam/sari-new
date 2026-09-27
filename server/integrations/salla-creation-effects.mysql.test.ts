import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const effects=vi.hoisted(()=>({owner:vi.fn(),merchant:vi.fn(),sheets:vi.fn()}));
vi.mock('../_core/emailNotifications',()=>({notifyNewOrder:effects.owner}));
vi.mock('../_core/notificationService',()=>({notifyNewOrder:effects.merchant}));
vi.mock('../sheetsSync',()=>({syncOrderToSheets:effects.sheets}));
import { getPool,closeDb } from '../db/connection';
import { createDisposableMerchant,cleanupDisposableMerchants,assertDisposableDatabase } from '../tests/helpers/disposable-merchant';
import { encryptSecret } from '../security/secrets';
import { persistSallaOrderProjection } from './salla-order-projection';
import { runSallaCreationEffectsBatch } from './salla-creation-effects';

describe.skipIf(!process.env.DATABASE_URL)('Salla creation effects: atomic intent, lease and actual MySQL recovery',()=>{
  const q=async(sql:string,args:any[]=[]):Promise<any>=>(await(await getPool())!.execute(sql,args))[0];
  let users:number[],merchant:number,owner:number,connection:number,creation:number,order:number,token:string,store:string;
  const rows=()=>q('SELECT * FROM salla_creation_effects WHERE merchant_id=? ORDER BY id',[merchant]);
  const run=(limit=20)=>runSallaCreationEffectsBatch(limit,merchant);
  const ready=()=>q('UPDATE salla_creation_effects SET available_at=UTC_TIMESTAMP(3) WHERE merchant_id=?',[merchant]);
  const isolateOwner=()=>q("UPDATE salla_creation_effects SET available_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 DAY) WHERE merchant_id=? AND kind<>'owner_notice'",[merchant]);
  const draft=()=>({externalOrderId:'456',orderNumber:'789',customerPhone:'966500000000',customerName:'Synthetic',address:'Fixture',items:'[{"name":"Synthetic","price":12345,"quantity":1}]',totalAmount:12345,paymentUrl:null,isGift:0 as const,discountCode:null});
  const persist=()=>persistSallaOrderProjection({merchantId:merchant,connectionId:connection,storeId:store,accessToken:'synthetic'},draft(),{id:creation,merchantId:merchant,token});
  beforeEach(async()=>{
    assertDisposableDatabase();vi.stubEnv('FIELD_ENCRYPTION_KEY','synthetic-effects-encryption-key-only');users=[];
    const m=await createDisposableMerchant('salla-effects');users.push(m.userId);merchant=m.merchantId;owner=m.userId;store=String(70000000+merchant);token=randomUUID();
    connection=Number((await q("INSERT INTO salla_connections(merchantId,salla_store_id,storeUrl,accessToken,syncStatus) VALUES (?,?,'https://synthetic.example.test',?,'active')",[merchant,store,encryptSecret('synthetic')])).insertId);
    creation=Number((await q(`INSERT INTO salla_order_creations(merchant_id,actor_user_id,request_id,request_hash,attempt_token,state,store_id,connection_id,created_at,updated_at)
      VALUES (?,?,?,REPEAT('a',64),?,'dispatching',?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,[merchant,owner,randomUUID(),token,store,connection])).insertId);
    effects.owner.mockReset().mockImplementation(async(_data,beforeSend)=>{await beforeSend();return true;});
    effects.merchant.mockReset().mockImplementation(async(_merchant,_order,_total,beforeSend)=>{await beforeSend();return true;});
    effects.sheets.mockReset().mockImplementation(async(_order,options)=>{await options.beforeSend();return {success:true};});
    order=(await persist()).id;
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants(users);vi.unstubAllEnvs();});afterAll(closeDb);
  it('queues exactly three independent effects with the accepted order, without sending in the request',async()=>{
    const pending=await rows();expect(pending.map((r:any)=>r.kind)).toEqual(['owner_notice','merchant_notice','sheets']);
    expect(pending.every((r:any)=>r.state==='pending'&&r.attempts===0&&r.local_order_id===order)).toBe(true);
    expect(effects.owner).not.toHaveBeenCalled();expect(effects.merchant).not.toHaveBeenCalled();expect(effects.sheets).not.toHaveBeenCalled();
    const text=JSON.stringify(pending);expect(text).not.toContain('966500000000');expect(text).not.toContain('Synthetic');expect(text).not.toContain('synthetic');
    await expect(q('INSERT INTO salla_creation_effects(merchant_id,creation_id,local_order_id,kind,context_hash,state,available_at,created_at,updated_at) SELECT merchant_id,creation_id,local_order_id,kind,context_hash,state,available_at,created_at,updated_at FROM salla_creation_effects WHERE merchant_id=? LIMIT 1',[merchant])).rejects.toMatchObject({code:'ER_DUP_ENTRY'});
  });
  it('resumes after request/process loss and never redispatches accepted effects',async()=>{
    expect(await run()).toBe(3);expect((await rows()).every((r:any)=>r.state==='accepted'&&r.accepted_at&&r.dispatch_started_at)).toBe(true);
    expect(effects.owner.mock.calls[0][0]).toMatchObject({totalAmount:123.45,itemsCount:1,customerName:'Synthetic'});
    expect(effects.merchant.mock.calls[0].slice(0,3)).toEqual([merchant,order,12345]);
    expect(effects.sheets.mock.calls[0][1].merchantId).toBe(merchant);
    expect(await run()).toBe(0);for(const send of Object.values(effects))expect(send).toHaveBeenCalledTimes(1);
  });
  it('concurrent batches each own a SQL lease; they cannot send the same effect twice',async()=>{
    await Promise.all(Array.from({length:6},()=>run(1)));
    for(const send of Object.values(effects))expect(send).toHaveBeenCalledTimes(1);
    expect((await rows()).map((r:any)=>r.attempts)).toEqual([1,1,1]);
  });
  it.each(['merchant','store','token','connection','alias','phone','name','amount','items','owner','cancelled','deleted','creation'])('changed %s blocks the effect before transport',async mode=>{
    if(mode==='merchant')await q("UPDATE merchants SET status='suspended' WHERE id=?",[merchant]);
    if(mode==='store')await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connection]);
    if(mode==='token')await q('UPDATE salla_connections SET accessToken=? WHERE id=?',[encryptSecret('rotated'),connection]);
    if(mode==='connection')await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connection]);
    if(mode==='alias')await q("UPDATE orders SET sallaOrderId='salla:1:456' WHERE id=?",[order]);
    if(mode==='phone')await q("UPDATE orders SET customerPhone='966511111111' WHERE id=?",[order]);
    if(mode==='name')await q("UPDATE orders SET customerName='Changed' WHERE id=?",[order]);
    if(mode==='amount')await q('UPDATE orders SET totalAmount=5 WHERE id=?',[order]);
    if(mode==='items')await q("UPDATE orders SET items='[]' WHERE id=?",[order]);
    if(mode==='owner'){const m=await createDisposableMerchant('new-owner');users.push(m.userId);await q('UPDATE merchants SET userId=? WHERE id=?',[m.userId,merchant]);}
    if(mode==='cancelled')await q("UPDATE orders SET status='cancelled' WHERE id=?",[order]);
    if(mode==='deleted')await q('DELETE FROM orders WHERE id=?',[order]);
    if(mode==='creation')await q('DELETE FROM salla_order_creations WHERE id=?',[creation]);
    await run();for(const send of Object.values(effects))expect(send).not.toHaveBeenCalled();
    expect((await rows()).every((r:any)=>r.state==='pending'&&r.last_error==='preparation_failed')).toBe(true);
  });
  it('a normal fulfilment update does not invalidate the immutable order terms',async()=>{
    await q("UPDATE orders SET status='shipped',trackingNumber='Synthetic' WHERE id=?",[order]);await run();expect((await rows()).every((r:any)=>r.state==='accepted')).toBe(true);
  });
  it.each(['store','token','lease','claim','hash','delete'])('last transport guard rejects %s changed during preparation',async mode=>{
    await isolateOwner();const sent=vi.fn();effects.owner.mockImplementationOnce(async(_data,beforeSend)=>{
      if(mode==='store')await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connection]);
      if(mode==='token')await q('UPDATE salla_connections SET accessToken=? WHERE id=?',[encryptSecret('rotated'),connection]);
      if(mode==='lease')await q('UPDATE salla_creation_effects SET lease_until=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE) WHERE merchant_id=? AND kind=\'owner_notice\'',[merchant]);
      if(mode==='claim')await q("UPDATE salla_creation_effects SET claim_token=? WHERE merchant_id=? AND kind='owner_notice'",[randomUUID(),merchant]);
      if(mode==='hash')await q("UPDATE salla_creation_effects SET context_hash=REPEAT('b',64) WHERE merchant_id=? AND kind='owner_notice'",[merchant]);
      if(mode==='delete')await q('DELETE FROM orders WHERE id=?',[order]);
      await beforeSend();sent();return true;
    });await run(1);expect(sent).not.toHaveBeenCalled();expect((await rows())[0].dispatch_started_at).toBeNull();
  });
  it('safe preparation failure is retryable with a bounded delay, without rerunning accepted siblings',async()=>{
    effects.owner.mockRejectedValueOnce(Error('synthetic preparation failure'));await run();let data=await rows();
    expect(data[0].state).toBe('pending');expect(data.slice(1).every((r:any)=>r.state==='accepted')).toBe(true);
    expect(await run()).toBe(0);await ready();await run();expect((await rows())[0].state).toBe('accepted');expect(effects.merchant).toHaveBeenCalledTimes(1);
  });
  it('eight preparation failures require review instead of an endless retry loop',async()=>{
    await isolateOwner();effects.owner.mockRejectedValue(Error('synthetic'));for(let i=0;i<8;i++){await q("UPDATE salla_creation_effects SET available_at=UTC_TIMESTAMP(3) WHERE merchant_id=? AND kind='owner_notice'",[merchant]);await run(1);}
    expect((await rows())[0]).toMatchObject({state:'review',attempts:8});expect(await run(1)).toBe(0);
  });
  it('a failed or uncertain external call is never automatically retried',async()=>{
    effects.owner.mockImplementationOnce(async(_data,beforeSend)=>{await beforeSend();throw Error('synthetic timeout with secret');});await run();
    expect((await rows())[0]).toMatchObject({state:'review',last_error:'transport_unconfirmed',attempts:1});await ready();await run();expect(effects.owner).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await rows())).not.toContain('secret');
  });
  it.each([false,true])('a helper result %s without invoking its transport guard is never accepted',async accepted=>{
    effects.owner.mockResolvedValueOnce(accepted);await run();expect((await rows())[0]).toMatchObject({state:'review',last_error:'effect_not_confirmed',dispatch_started_at:null});
  });
  it('recovers stale preparation but quarantines stale dispatch and exhausted claims',async()=>{
    await q(`UPDATE salla_creation_effects SET state='processing',claim_token=?,attempts=1,lease_until=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE) WHERE merchant_id=?`,[randomUUID(),merchant]);
    await q("UPDATE salla_creation_effects SET state='dispatching',dispatch_started_at=UTC_TIMESTAMP(3) WHERE merchant_id=? AND kind='merchant_notice'",[merchant]);
    await q("UPDATE salla_creation_effects SET attempts=8 WHERE merchant_id=? AND kind='sheets'",[merchant]);
    expect(await run()).toBe(1);const data=await rows();expect(data[0]).toMatchObject({state:'accepted',attempts:2});expect(data[1]).toMatchObject({state:'review',last_error:'transport_unconfirmed'});expect(data[2]).toMatchObject({state:'review',last_error:'retry_exhausted'});
    expect(effects.merchant).not.toHaveBeenCalled();expect(effects.sheets).not.toHaveBeenCalled();
  });
  it('settles a late positive acknowledgement of its own dispatch without a second send',async()=>{
    await isolateOwner();effects.owner.mockImplementationOnce(async(_data,beforeSend)=>{await beforeSend();await q("UPDATE salla_creation_effects SET lease_until=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE) WHERE merchant_id=? AND kind='owner_notice'",[merchant]);expect(await run(1)).toBe(0);expect((await rows())[0].state).toBe('review');return true;});
    await run(1);expect((await rows())[0].state).toBe('accepted');expect(effects.owner).toHaveBeenCalledTimes(1);
  });
  it('a lost dispatch commit acknowledgement leaves review and never calls transport',async()=>{
    await isolateOwner();const pool=(await getPool())!,get=pool.getConnection.bind(pool);const sent=vi.fn();
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{const result=await execute(sql,args);if(sql.includes("SET state='dispatching'")){const commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementationOnce(async()=>{await commit();throw Error('lost dispatch ack');});}return result;})as any);return c;});
    effects.owner.mockImplementationOnce(async(_data,beforeSend)=>{await beforeSend();sent();return true;});await run(1);vi.restoreAllMocks();
    expect(sent).not.toHaveBeenCalled();expect((await rows())[0].state).toBe('review');expect(await run(1)).toBe(0);
  });
  it('accepted-state commit loss cannot reset the effect or resend it',async()=>{
    const pool=(await getPool())!,execute=pool.execute.bind(pool);let lost=false;
    vi.spyOn(pool,'execute').mockImplementation((async(sql:string,args:any[])=>{const result=await execute(sql,args);if(!lost&&sql.includes("SET state='accepted'")){lost=true;throw Error('lost effect acknowledgement');}return result;})as any);
    await run();vi.restoreAllMocks();expect((await rows()).every((r:any)=>r.state==='accepted')).toBe(true);expect(await run()).toBe(0);for(const send of Object.values(effects))expect(send).toHaveBeenCalledTimes(1);
  });
  it('a failed acknowledgement write parks the already attempted effect for review',async()=>{
    await isolateOwner();const pool=(await getPool())!,execute=pool.execute.bind(pool);let failed=false;
    vi.spyOn(pool,'execute').mockImplementation((async(sql:string,args:any[])=>{if(!failed&&sql.includes("SET state='accepted'")){failed=true;throw Error('write unavailable');}return execute(sql,args);})as any);
    await run(1);vi.restoreAllMocks();expect((await rows())[0]).toMatchObject({state:'review',last_error:'transport_unconfirmed'});expect(await run(1)).toBe(0);expect(effects.owner).toHaveBeenCalledTimes(1);
  });
  it('a lost claim acknowledgement does not send and can safely recover only after lease expiry',async()=>{
    await isolateOwner();const pool=(await getPool())!,get=pool.getConnection.bind(pool);let lost=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{const result=await execute(sql,args);if(!lost&&sql.includes("SET state='processing'")){lost=true;const commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementationOnce(async()=>{await commit();throw Error('lost claim acknowledgement');});}return result;})as any);return c;});
    await expect(run(1)).rejects.toThrow();vi.restoreAllMocks();expect(effects.owner).not.toHaveBeenCalled();expect(await run(1)).toBe(0);
    await q("UPDATE salla_creation_effects SET lease_until=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE) WHERE merchant_id=? AND kind='owner_notice'",[merchant]);
    await run(1);expect((await rows())[0]).toMatchObject({state:'accepted',attempts:2});expect(effects.owner).toHaveBeenCalledTimes(1);
  });
  it.each(['merchant_id','local_order_id','creation_id'])('forged queue %s cannot authorize a different order or tenant',async field=>{
    const m=await createDisposableMerchant('forged-effects');users.push(m.userId);
    await q(`UPDATE salla_creation_effects SET ${field}=? WHERE merchant_id=?`,[field==='merchant_id'?m.merchantId:2147483647,merchant]);
    await runSallaCreationEffectsBatch(20,field==='merchant_id'?m.merchantId:merchant);for(const send of Object.values(effects))expect(send).not.toHaveBeenCalled();
  });
  it('an enqueue failure rolls back the order, projection and creation completion together',async()=>{
    await q('DELETE FROM salla_creation_effects WHERE merchant_id=?',[merchant]);await q('DELETE FROM orders WHERE id=?',[order]);
    await q("UPDATE salla_order_creations SET state='dispatching',local_order_id=NULL,result_json=NULL WHERE id=?",[creation]);
    const pool=(await getPool())!,get=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{const result=await execute(sql,args);if(sql.includes('INSERT INTO salla_creation_effects')&&args[3]==='sheets')throw Error('third queue row failed');return result;})as any);return c;});
    await expect(persist()).rejects.toThrow();vi.restoreAllMocks();expect(await rows()).toHaveLength(0);expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);expect((await q('SELECT state FROM salla_order_creations WHERE id=?',[creation]))[0].state).toBe('dispatching');
  });
  it('does not claim another merchant when a scoped batch runs',async()=>{
    const m=await createDisposableMerchant('other-effects');users.push(m.userId);expect(await runSallaCreationEffectsBatch(20,m.merchantId)).toBe(0);expect((await rows()).every((r:any)=>r.state==='pending')).toBe(true);
  });
  it.each(['table','index'])('schema %s removal fails closed before any effect',async mode=>{
    try{if(mode==='table')await q('RENAME TABLE salla_creation_effects TO salla_creation_effects_hidden');else await q('ALTER TABLE salla_creation_effects DROP INDEX salla_creation_effect_once');
      await expect(run()).rejects.toMatchObject({code:'DATABASE_SCHEMA_OUTDATED'});for(const send of Object.values(effects))expect(send).not.toHaveBeenCalled();
    }finally{if(mode==='table')await q('RENAME TABLE salla_creation_effects_hidden TO salla_creation_effects');else await q('ALTER TABLE salla_creation_effects ADD UNIQUE KEY salla_creation_effect_once(creation_id,kind)');}
  });
});
