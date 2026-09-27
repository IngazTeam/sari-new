import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const effects=vi.hoisted(()=>({owner:vi.fn(),merchant:vi.fn(),sheets:vi.fn()}));
vi.mock('../_core/emailNotifications',()=>({notifyNewOrder:effects.owner}));
vi.mock('../_core/notificationService',()=>({notifyNewOrder:effects.merchant}));
vi.mock('../sheetsSync',()=>({syncOrderToSheets:effects.sheets}));
import { getPool,closeDb } from '../db/connection';
import { createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { encryptSecret } from '../security/secrets';
import { persistSallaOrderProjection } from './salla-order-projection';
import { runSallaCreationEffectsBatch } from './salla-creation-effects';
import { simulateAcceptedSheetAppend } from '../tests/helpers/salla-sheet-evidence';
import { listSallaEffects,listSallaEffectReviews,checkSallaEffect } from './salla-effect-review';

describe.skipIf(!process.env.DATABASE_URL)('Salla operational review on isolated MySQL',()=>{
  const q=async(sql:string,args:any[]=[]):Promise<any>=>(await(await getPool())!.execute(sql,args))[0];
  let users:number[],merchant:number,owner:number,connection:number,creation:number,order:number,effect:number,requestId:string;
  const rows=()=>q('SELECT * FROM salla_creation_effects WHERE merchant_id=? ORDER BY id',[merchant]);
  const history=()=>listSallaEffectReviews(merchant,owner,{});
  const input=()=>({effectId:effect,requestId,reason:'delivery_check' as const});
  const check=()=>checkSallaEffect(merchant,owner,input());
  beforeEach(async()=>{
    vi.stubEnv('FIELD_ENCRYPTION_KEY','synthetic-effects-encryption-key-only');users=[];requestId=randomUUID();
    const m=await createDisposableMerchant('salla-review');users.push(m.userId);merchant=m.merchantId;owner=m.userId;
    const store=String(70000000+merchant),token=randomUUID();
    connection=Number((await q("INSERT INTO salla_connections(merchantId,salla_store_id,storeUrl,accessToken,syncStatus) VALUES (?,?,'https://synthetic.example.test',?,'active')",[merchant,store,encryptSecret('synthetic')])).insertId);
    creation=Number((await q(`INSERT INTO salla_order_creations(merchant_id,actor_user_id,request_id,request_hash,attempt_token,state,store_id,connection_id,created_at,updated_at)
      VALUES (?,?,?,REPEAT('a',64),?,'dispatching',?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,[merchant,owner,randomUUID(),token,store,connection])).insertId);
    order=(await persistSallaOrderProjection({merchantId:merchant,connectionId:connection,storeId:store,accessToken:'synthetic'},
      {externalOrderId:'456',orderNumber:'789',customerPhone:'966500000000',customerName:'Private synthetic',address:'Private address',items:'[]',totalAmount:12345,paymentUrl:null,isGift:0,discountCode:null},
      {id:creation,merchantId:merchant,token})).id;
    effect=(await rows())[0].id;
    effects.owner.mockReset().mockImplementation(async(_d,guard)=>{await guard();return true;});
    effects.merchant.mockReset().mockImplementation(async(_m,_o,_v,guard)=>{await guard();return true;});
    effects.sheets.mockReset().mockImplementation(simulateAcceptedSheetAppend);
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants(users);vi.unstubAllEnvs();});afterAll(closeDb);
  function noSends(){expect(effects.owner).not.toHaveBeenCalled();expect(effects.merchant).not.toHaveBeenCalled();expect(effects.sheets).not.toHaveBeenCalled();}
  it('lists and records only a sanitized fresh observation without changing any task',async()=>{
    const before=await rows(),page=await listSallaEffects(merchant,owner,{});expect(page.items).toHaveLength(3);expect(page.items.every(i=>i.contextValid&&i.diagnostic==='queued')).toBe(true);
    const result=await check();expect(result).toMatchObject({reviewerUserId:owner,reason:'delivery_check',effect:{id:effect,orderId:order,state:'pending'}});
    expect((await history()).items).toEqual([result]);expect(await rows()).toEqual(before);
    expect(JSON.stringify([page,result])).not.toMatch(/Private|966500000000|synthetic|context_hash|token|digest|requestId/);noSends();
  });
  it.each(['processing','expired_preparation','dispatching','expired_dispatch','review_unsent','review_sent'])('distinguishes %s without reviving the task',async mode=>{
    const state=mode.startsWith('review')?'review':mode.includes('dispatch')?'dispatching':'processing',sent=state==='dispatching'||mode==='review_sent';
    await q(`UPDATE salla_creation_effects SET state=?,attempts=1,claim_token=?,lease_until=${state==='review'?'NULL':mode.startsWith('expired')?'DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 HOUR)':'DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 HOUR)'},dispatch_started_at=${sent?'UTC_TIMESTAMP(3)':'NULL'} WHERE id=?`,[state,randomUUID(),effect]);
    const before=await rows(),diagnostic=mode==='processing'?'preparing':mode==='expired_preparation'?'preparation_expired':mode==='dispatching'?'in_flight':mode==='review_unsent'?'review_before_send':'outcome_unknown';
    expect((await check()).effect).toMatchObject({state,diagnostic});expect(await rows()).toEqual(before);noSends();
  });
  it('preserves an earlier review after actual worker acceptance without retrying it',async()=>{
    const first=await check();await runSallaCreationEffectsBatch(20,merchant);expect((await check()).id).toBe(first.id);expect((await check()).effect.state).toBe('pending');
    requestId=randomUUID();expect((await check()).effect).toMatchObject({state:'accepted',diagnostic:'accepted'});expect((await history()).items[1]).toEqual(first);
    expect(effects.owner).toHaveBeenCalledOnce();expect(effects.merchant).toHaveBeenCalledOnce();expect(effects.sheets).toHaveBeenCalledOnce();
  });
  it.each(['viewer','sales_supervisor','inactive','disabled','suspended','foreign'])('denies %s under fresh SQL authority',async mode=>{
    if(mode==='disabled')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner]);
    else if(mode==='suspended')await q("UPDATE merchants SET status='suspended' WHERE id=?",[merchant]);
    else if(mode==='foreign'){const other=await createDisposableMerchant('other');users.push(other.userId);owner=other.userId;}
    else await q('INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,?,?)',[merchant,owner,mode==='inactive'?'owner':mode,mode==='inactive'?0:1]);
    await expect(check()).rejects.toThrow();await expect(history()).rejects.toThrow();await expect(listSallaEffects(merchant,owner,{})).rejects.toThrow();expect(await q('SELECT * FROM salla_effect_reviews WHERE merchant_id=?',[merchant])).toEqual([]);noSends();
  });
  it('allows a current manager and rejects them immediately after revocation, including replay',async()=>{
    const other=await createDisposableMerchant('manager');users.push(other.userId);await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[merchant,other.userId]);
    expect((await checkSallaEffect(merchant,other.userId,input())).reviewerUserId).toBe(other.userId);
    await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[merchant,other.userId]);await expect(checkSallaEffect(merchant,other.userId,input())).rejects.toThrow();noSends();
  });
  it('deduplicates concurrent checks and returns the same result after reconnect',async()=>{
    const results=await Promise.all(Array.from({length:6},check));expect(new Set(results.map(r=>r.id)).size).toBe(1);expect((await history()).items).toHaveLength(1);await closeDb();expect(await check()).toEqual(results[0]);noSends();
  });
  it.each(['effectId','reason','reviewer'])('rejects changed %s under the same request ID',async field=>{
    await check();let actor=owner;const value:any=input();if(field==='effectId')value.effectId++;else if(field==='reason')value.reason='incident_review';
    else{const m=await createDisposableMerchant('manager');users.push(m.userId);actor=m.userId;await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[merchant,actor]);}
    await expect(checkSallaEffect(merchant,actor,value)).rejects.toThrow();expect((await history()).items).toHaveLength(1);noSends();
  });
  it.each(['phone','token','cancelled','store','deleted_source'])('marks changed %s context without leaking its data or changing the effect',async mode=>{
    if(mode==='phone')await q("UPDATE orders SET customerPhone='966500999999' WHERE id=?",[order]);
    if(mode==='token')await q("UPDATE salla_connections SET accessToken='private changed token' WHERE id=?",[connection]);
    if(mode==='cancelled')await q("UPDATE orders SET status='cancelled' WHERE id=?",[order]);
    if(mode==='store')await q("UPDATE salla_connections SET salla_store_id='999999' WHERE id=?",[connection]);
    if(mode==='deleted_source')await q('DELETE FROM salla_order_creations WHERE id=?',[creation]);
    const before=await rows();expect((await check()).effect.contextValid).toBe(false);expect(await rows()).toEqual(before);noSends();
  });
  it('keeps audit history and idempotent replay when the original task is deleted',async()=>{
    const saved=await check();await q('DELETE FROM salla_creation_effects WHERE id=?',[effect]);expect((await history()).items).toEqual([saved]);expect(await check()).toEqual(saved);
    requestId=randomUUID();await expect(check()).rejects.toThrow();noSends();
  });
  it('filters and pages deterministically without exposing another tenant',async()=>{
    for(let n=1;n<=22;n++)await q(`INSERT INTO salla_creation_effects(merchant_id,creation_id,local_order_id,kind,context_hash,state,available_at,created_at,updated_at)
      VALUES (?,?,?,'sheets',REPEAT('a',64),'pending',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,[merchant,2000000000-n,order]);
    const first=await listSallaEffects(merchant,owner,{kind:'sheets',orderId:order,state:'pending'});expect(first.items).toHaveLength(20);expect(first.nextCursor).toBe(first.items.at(-1)!.id);
    const second=await listSallaEffects(merchant,owner,{kind:'sheets',orderId:order,state:'pending',beforeId:first.nextCursor!});expect(second.items).toHaveLength(3);expect(second.nextCursor).toBeNull();expect(first.items.every(i=>!second.items.some(j=>i.id===j.id))).toBe(true);
    const other=await createDisposableMerchant('foreign');users.push(other.userId);expect((await listSallaEffects(other.merchantId,other.userId,{})).items).toEqual([]);
    await expect(checkSallaEffect(other.merchantId,other.userId,input())).rejects.toThrow();noSends();
  });
  it.each(['snapshot_digest','request_digest','reviewer_user_id','effect_id','order_id','snapshot'])('rejects corrupt audit %s',async field=>{
    await check();await q(`UPDATE salla_effect_reviews SET ${field}=? WHERE merchant_id=?`,[field==='snapshot'?JSON.stringify('invalid'):field.endsWith('digest')?'0'.repeat(64):999999,merchant]);
    await expect(history()).rejects.toThrow();await expect(check()).rejects.toThrow();noSends();
  });
  it('does not lose or duplicate a review after a lost commit acknowledgement',async()=>{
    const pool=(await getPool())!,connect=pool.getConnection.bind(pool);let lost=false;vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementationOnce(async()=>{await commit();if(!lost){lost=true;throw Error('lost acknowledgement');}});return c;});
    await expect(check()).rejects.toThrow();vi.restoreAllMocks();expect((await history()).items).toEqual([await check()]);noSends();
  });
  it('leaves tasks unchanged when the audit write fails',async()=>{
    const before=await rows(),pool=(await getPool())!,connect=pool.getConnection.bind(pool);vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation(((sql:any,args:any)=>{if(String(sql).includes('INSERT INTO salla_effect_reviews'))throw Error('synthetic failure');return execute(sql,args);}) as any);return c;});
    await expect(check()).rejects.toThrow();vi.restoreAllMocks();expect(await rows()).toEqual(before);expect((await history()).items).toEqual([]);noSends();
  });
  it('coexists with worker claims and never sends through the review path',async()=>{
    await Promise.all([runSallaCreationEffectsBatch(20,merchant),...Array.from({length:3},()=>checkSallaEffect(merchant,owner,{...input(),requestId:randomUUID()}))]);
    expect((await history()).items).toHaveLength(3);expect(effects.owner).toHaveBeenCalledOnce();expect(effects.merchant).toHaveBeenCalledOnce();expect(effects.sheets).toHaveBeenCalledOnce();
  });
  it('pages audit history in descending order and keeps its order filter',async()=>{
    for(let n=0;n<22;n++)await checkSallaEffect(merchant,owner,{...input(),requestId:randomUUID()});
    const first=await listSallaEffectReviews(merchant,owner,{orderId:order});expect(first.items).toHaveLength(20);
    const second=await listSallaEffectReviews(merchant,owner,{orderId:order,beforeId:first.nextCursor!});expect(second.items).toHaveLength(2);expect(second.nextCursor).toBeNull();
    expect(first.items.every(a=>second.items.every(b=>a.id>b.id))).toBe(true);expect((await listSallaEffectReviews(merchant,owner,{orderId:order+1})).items).toEqual([]);noSends();
  });
  it.each(['table','index'])('fails closed when the review %s is missing',async part=>{
    const remove=part==='table'?'RENAME TABLE salla_effect_reviews TO salla_effect_reviews_test_hidden':'ALTER TABLE salla_effect_reviews DROP INDEX salla_effect_review_request';
    const restore=part==='table'?'RENAME TABLE salla_effect_reviews_test_hidden TO salla_effect_reviews':'ALTER TABLE salla_effect_reviews ADD UNIQUE INDEX salla_effect_review_request (merchant_id,request_id)';
    const before=await rows();await q(remove);
    try {await expect(check()).rejects.toThrow();await expect(history()).rejects.toThrow();await expect(listSallaEffects(merchant,owner,{})).rejects.toThrow();expect(await rows()).toEqual(before);noSends();}
    finally{await q(restore);}
  });
});
