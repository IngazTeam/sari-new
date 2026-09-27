import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const external=vi.hoisted(()=>({post:vi.fn(),notify:vi.fn()}));
vi.mock('axios',()=>({default:{create:()=>({post:external.post})}}));
vi.mock('../_core/emailNotifications',()=>({notifyNewOrder:external.notify}));
import { getPool,closeDb } from '../db/connection';
import { assertDisposableDatabase,createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { encryptSecret } from '../security/secrets';
import { runSallaOrderCreation,dispatchSallaCreation, type SallaCreationAttempt } from './salla-order-creation';
import { persistSallaOrderProjection } from './salla-order-projection';
import { createOrderFromChat } from '../automation/order-from-chat';

describe.skipIf(!process.env.DATABASE_URL)('Salla durable creation through actual order orchestration and MySQL',()=>{
  const q=async(sql:string,args:any[]=[]):Promise<any>=>(await(await getPool())!.execute(sql,args))[0];
  const shipTo={country:1,city:2,address_line:'Synthetic',street_number:'12',block:'Fixture',short_address:'ABCD1234',building_number:'1234',additional_number:'5678',postal_code:'12345',geo_coordinates:{lat:24,lng:46}};
  let merchant:number,user:number,otherUser:number,users:number[],connectionId:number,productId:number,store:string,requestId:string;
  const intent=()=>({customerPhone:'966500000000',customerName:'Synthetic',message:'Synthetic order',shipTo});
  const input=()=>({merchantId:merchant,actorUserId:user,requestId,intent:intent()});
  const work=(a:SallaCreationAttempt)=>createOrderFromChat(merchant,intent().customerPhone,intent().customerName,{shipTo,products:[{name:'Synthetic',productId,quantity:1}]},undefined,a);
  const run=()=>runSallaOrderCreation(input(),work);
  const ledger=async()=>(await q('SELECT * FROM salla_order_creations WHERE merchant_id=? AND request_id=?',[merchant,requestId]))[0];
  beforeEach(async()=>{
    assertDisposableDatabase();vi.stubEnv('FIELD_ENCRYPTION_KEY','synthetic-salla-creation-encryption-only');users=[];
    const m=await createDisposableMerchant('salla-create'),o=await createDisposableMerchant('salla-actor');users=[m.userId,o.userId];merchant=m.merchantId;user=m.userId;otherUser=o.userId;store=String(800000000+merchant);requestId=randomUUID();
    connectionId=Number((await q("INSERT INTO salla_connections(merchantId,salla_store_id,storeUrl,accessToken,syncStatus) VALUES (?,?,'https://synthetic.example.test',?,'active')",[merchant,store,encryptSecret('synthetic-token')])).insertId);
    productId=Number((await q("INSERT INTO products(merchantId,sallaProductId,name,price,price_unit,currency,stock,isActive) VALUES (?,'123','Synthetic',100,'minor','SAR',5,1)",[merchant])).insertId);
    external.post.mockReset().mockResolvedValue({data:{success:true,data:{id:98765,reference_id:456,currency:'SAR',amounts:{total:{amount:1,currency:'SAR'}},urls:{checkout:'https://synthetic.example.test/pay'}}}});external.notify.mockReset().mockResolvedValue(undefined);
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants(users);vi.unstubAllEnvs();});afterAll(closeDb);
  it('commits the operation, order and store identity together and replays without another provider call or email',async()=>{
    const first=await run();expect(first.replayed).toBe(false);expect((await ledger()).state).toBe('completed');
    expect(await run()).toEqual({...first,replayed:true});expect(external.post).toHaveBeenCalledTimes(1);expect(external.notify).toHaveBeenCalledTimes(1);
    expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(1);
    const row=await ledger();expect(row.request_hash).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(row)).not.toContain(intent().customerPhone);expect(JSON.stringify(row)).not.toContain('synthetic-token');
  });
  it('only one concurrent caller may enter preparation or POST',async()=>{
    let release!:()=>void,entered!:()=>void;const ready=new Promise<void>(r=>entered=r),hold=new Promise<void>(r=>release=r);
    const prepare=vi.fn(async(a:SallaCreationAttempt)=>{entered();await hold;return work(a);});
    const first=runSallaOrderCreation(input(),prepare);await ready;
    try{await expect(runSallaOrderCreation(input(),prepare)).rejects.toMatchObject({code:'operation_pending'});expect(prepare).toHaveBeenCalledTimes(1);}finally{release();}
    await first;expect(external.post).toHaveBeenCalledTimes(1);
  });
  it.each(['phone','name','message','address','actor'])('rejects a repeated request ID with changed %s',async mode=>{
    await run();const next=input();if(mode==='phone')next.intent.customerPhone='966511111111';if(mode==='name')next.intent.customerName='Changed';if(mode==='message')next.intent.message='Different';if(mode==='address')next.intent.shipTo={...shipTo,address_line:'Changed'};if(mode==='actor')next.actorUserId=otherUser;
    const prepare=vi.fn();await expect(runSallaOrderCreation(next,prepare)).rejects.toMatchObject({code:'request_conflict'});expect(prepare).not.toHaveBeenCalled();expect(external.post).toHaveBeenCalledTimes(1);
  });
  it('normalizes UUID case and object key order without changing operation identity',async()=>{
    const first=await run(),next=input();next.requestId=requestId.toUpperCase();next.intent.shipTo={...shipTo,geo_coordinates:{lng:46,lat:24}};
    expect(await runSallaOrderCreation(next,work)).toEqual({...first,replayed:true});expect(external.post).toHaveBeenCalledTimes(1);
  });
  it('does not leak or replay another tenant operation under the same request ID',async()=>{
    const first=await run(),m=await createDisposableMerchant('salla-scope');users.push(m.userId);
    const prepare=vi.fn().mockResolvedValue(null);await expect(runSallaOrderCreation({...input(),merchantId:m.merchantId,actorUserId:m.userId},prepare)).rejects.toMatchObject({code:'operation_rejected'});
    expect(prepare).toHaveBeenCalledTimes(1);expect((await ledger()).local_order_id).toBe(first.orderId);
  });
  it.each(['timeout','malformed'])('parks %s after POST and never resends on replay',async mode=>{
    if(mode==='timeout')external.post.mockRejectedValueOnce(Error('socket timeout'));else external.post.mockResolvedValueOnce({data:{success:true,data:{id:98765}}});
    await expect(run()).rejects.toMatchObject({code:'operation_review'});expect((await ledger()).state).toBe('review');await expect(run()).rejects.toMatchObject({code:'operation_review'});
    expect(external.post).toHaveBeenCalledTimes(1);expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
  });
  it('records a preflight rejection with no provider effect and will not silently reuse its key',async()=>{
    await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);await expect(run()).rejects.toMatchObject({code:'operation_rejected'});expect((await ledger()).state).toBe('rejected');
    await q("UPDATE salla_connections SET syncStatus='active' WHERE id=?",[connectionId]);await expect(run()).rejects.toMatchObject({code:'operation_rejected'});expect(external.post).not.toHaveBeenCalled();
  });
  it('rejects a suspended merchant before reservation, without implying a saved order exists',async()=>{
    await q("UPDATE merchants SET status='suspended' WHERE id=?",[merchant]);const prepare=vi.fn();
    await expect(runSallaOrderCreation(input(),prepare)).rejects.toMatchObject({code:'result_unavailable'});
    expect(await ledger()).toBeUndefined();expect(prepare).not.toHaveBeenCalled();expect(external.post).not.toHaveBeenCalled();
  });
  it.each(['preparing','dispatching'])('does not steal a stale %s operation after process restart',async state=>{
    await expect(runSallaOrderCreation(input(),async a=>{if(state==='dispatching')await dispatchSallaCreation(a,{merchantId:merchant,connectionId,storeId:store,accessToken:'synthetic-token'});throw Error('crash');})).rejects.toThrow();
    await q("UPDATE salla_order_creations SET state=?,created_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY),updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) WHERE merchant_id=?",[state,merchant]);
    await expect(run()).rejects.toMatchObject({code:'operation_pending'});expect(external.post).not.toHaveBeenCalled();
  });
  it.each(['reservation','dispatch','completion'])('handles lost %s commit acknowledgement without duplicate POST',async phase=>{
    const pool=(await getPool())!,get=pool.getConnection.bind(pool);let number=0;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();number++;if(number===({reservation:1,dispatch:2,completion:3}[phase])){const commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementationOnce(async()=>{await commit();throw Error('lost acknowledgement');});}return c;});
    if(phase==='completion'){const r=await run();expect(r.replayed).toBe(true);expect((await ledger()).state).toBe('completed');}
    else await expect(run()).rejects.toThrow();
    vi.restoreAllMocks();if(phase==='completion')await run();else await expect(run()).rejects.toThrow();expect(external.post).toHaveBeenCalledTimes(phase==='completion'?1:0);
  });
  it('rolls back order and operation completion together when the final write fails',async()=>{
    const pool=(await getPool())!,get=pool.getConnection.bind(pool);vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{const r=await execute(sql,args);if(sql.includes("SET state='completed'"))throw Error('write failed');return r;})as any);return c;});
    await expect(run()).rejects.toMatchObject({code:'operation_review'});vi.restoreAllMocks();expect((await ledger()).state).toBe('review');expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);await expect(run()).rejects.toThrow();expect(external.post).toHaveBeenCalledTimes(1);
  });
  it.each(['store','token','paused'])('rechecks %s after the provider accepted, without holding locks over HTTP',async mode=>{
    const response=await external.post();external.post.mockClear().mockImplementationOnce(async()=>{if(mode==='store')await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connectionId]);if(mode==='token')await q('UPDATE salla_connections SET accessToken=? WHERE id=?',[encryptSecret('new-synthetic-token'),connectionId]);if(mode==='paused')await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);return response;});
    await expect(run()).rejects.toMatchObject({code:'operation_review'});await expect(run()).rejects.toThrow();expect(external.post).toHaveBeenCalledTimes(1);expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
  });
  it.each(['order_deleted','store_changed','alias_changed','result_changed'])('does not leak an unverifiable saved result: %s',async mode=>{
    const r=await run();if(mode==='order_deleted')await q('DELETE FROM orders WHERE id=?',[r.orderId]);if(mode==='store_changed')await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connectionId]);if(mode==='alias_changed')await q("UPDATE orders SET sallaOrderId='other' WHERE id=?",[r.orderId]);if(mode==='result_changed')await q("UPDATE salla_order_creations SET result_json=JSON_SET(result_json,'$.orderId',123) WHERE merchant_id=?",[merchant]);
    await expect(run()).rejects.toMatchObject({code:'result_unavailable'});expect((await ledger()).state).toBe('completed');expect(external.post).toHaveBeenCalledTimes(1);
  });
  it('rejects a forged attempt token before POST',async()=>{
    await expect(runSallaOrderCreation(input(),a=>work({...a,token:randomUUID()}))).rejects.toMatchObject({code:'operation_rejected'});expect(external.post).not.toHaveBeenCalled();
  });
  it.each(['table','unique'])('fails closed on missing %s before preparation or provider access',async mode=>{
    // First warm readiness, then prove a process cannot keep using a stale success.
    await run();requestId=randomUUID();const prepare=vi.fn();
    try{
      if(mode==='table')await q('RENAME TABLE salla_order_creations TO salla_order_creations_fixture_hidden');else await q('ALTER TABLE salla_order_creations DROP INDEX salla_creation_request');
      await expect(runSallaOrderCreation(input(),prepare)).rejects.toMatchObject({code:'DATABASE_SCHEMA_OUTDATED'});expect(prepare).not.toHaveBeenCalled();expect(external.post).toHaveBeenCalledTimes(1);
    }finally{
      if(mode==='table')await q('RENAME TABLE salla_order_creations_fixture_hidden TO salla_order_creations');else await q('ALTER TABLE salla_order_creations ADD UNIQUE KEY salla_creation_request(merchant_id,request_id)');
    }
  });
  it('cannot project an operation before dispatch or with another tenant authority',async()=>{
    const draft={externalOrderId:'98765',orderNumber:'456',customerPhone:'966500000000',customerName:'Synthetic',address:'Fixture',items:'[]',totalAmount:100,paymentUrl:null,isGift:0 as const,discountCode:null};
    await expect(runSallaOrderCreation(input(),async a=>{await expect(persistSallaOrderProjection({merchantId:merchant,connectionId,storeId:store,accessToken:'synthetic-token'},draft,a)).rejects.toThrow();await expect(dispatchSallaCreation(a,{merchantId:merchant+1,connectionId,storeId:store,accessToken:'synthetic-token'})).rejects.toThrow();return null;})).rejects.toMatchObject({code:'operation_rejected'});
    expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
  });
});
