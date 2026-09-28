import { createHash,randomUUID } from 'node:crypto';
import { createServer,type Server } from 'node:http';
import express from 'express';
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { getPool,closeDb } from '../db/connection';
import { assertDisposableDatabase,createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { encodeApiKeyPermissions } from '../api/api-key-permissions';
import { getApiConversionHistory,type ConversionApiAuthority } from './api-conversion-history';
import { recordApiConversion } from './api-conversion-sync';

describe.skipIf(!process.env.DATABASE_URL)('API reported conversion history with real SQL and REST',()=>{
  const q=async(sql:string,args:any[]=[]):Promise<any>=>(await(await getPool())!.execute(sql,args))[0];
  const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
  let merchant:number,user:number,users:number[],authority:ConversionApiAuthority,rawKey:string,server:Server,base:string;
  const event={customerPhone:'0501234567',customerName:'عميل اختبار',actionType:'payment',productName:'دورة اختبار',amount:125.5,externalRef:'synthetic-payment-1',status:'pending'};
  const write=(status=event.status,auth:ConversionApiAuthority|undefined=authority)=>recordApiConversion(merchant,{...event,status},auth);
  const read=(id:number,auth=authority)=>getApiConversionHistory(merchant,auth,{conversionId:id});
  const observations=()=>q('SELECT * FROM api_conversion_observations WHERE merchant_id=? ORDER BY id',[merchant]);
  async function key(owner=merchant,scopes=['conversions:read','conversions:write']){
    const raw='sari_sk_'+randomUUID().replaceAll('-',''),keyHash=hash(raw);
    const r=await q('INSERT INTO sari_api_keys(merchant_id,key_hash,key_prefix,permissions) VALUES (?,?,?,?)',[owner,keyHash,raw.slice(0,12),encodeApiKeyPermissions(scopes)]);
    return {raw,authority:{apiKeyId:r.insertId,keyHash}};
  }
  beforeAll(async()=>{
    assertDisposableDatabase();const {sariApiRouter}=await import('../api/rest');const app=express();app.use(express.json());app.use('/api',sariApiRouter);
    server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as any).port}/api`;
  });
  beforeEach(async()=>{
    assertDisposableDatabase();users=[];const account=await createDisposableMerchant('conversion-history');merchant=account.merchantId;user=account.userId;users.push(user);
    const credentials=await key();authority=credentials.authority;rawKey=credentials.raw;
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants(users);});
  afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await closeDb();});
  it('records three forward observations atomically without creating payment, order or learning facts',async()=>{
    const first=await write();expect(first.created).toBe(true);expect((await write()).created).toBe(false);
    await write('completed');await write('cancelled');expect(await write('cancelled')).toEqual({...first,created:false,status:'cancelled'});
    const result=await read(first.id);expect(result).toMatchObject({history:'recorded',currentState:'cancelled',paymentEvidence:'not_verified',attribution:'not_recorded'});
    expect(result.observations.map(o=>o.observation.state)).toEqual(['pending','completed','cancelled']);
    expect(result.observations.every(o=>o.observation.source==='api_key_report'&&o.observation.apiKeyId===authority.apiKeyId)).toBe(true);
    const serialized=JSON.stringify(result);for(const secret of [rawKey,authority.keyHash,event.customerPhone,event.customerName])expect(serialized).not.toContain(secret);
    for(const table of ['ai_sales_payment_facts','ai_sales_order_facts'])expect(await q(`SELECT * FROM ${table} WHERE merchant_id=?`,[merchant])).toEqual([]);
  });
  it('returns created exactly once across concurrent duplicate writes and serializes their history',async()=>{
    const results=await Promise.all(Array.from({length:4},()=>write()));expect(results.filter(r=>r.created)).toHaveLength(1);expect(new Set(results.map(r=>r.id)).size).toBe(1);
    expect(await observations()).toHaveLength(1);await Promise.all(Array.from({length:3},()=>write('completed')));expect(await observations()).toHaveLength(2);
  });
  it.each(['customerPhone','customerName','productName','amount','actionType'])('rejects conflicting %s without touching the history',async field=>{
    const first=await write(),before=await observations(),changed={...event,[field]:field==='amount'?126:field==='customerPhone'?'0509999999':field==='actionType'?'enrollment':'changed'};
    await expect(recordApiConversion(merchant,changed,authority)).rejects.toMatchObject({name:'ApiConversionConflictError'});
    expect(await observations()).toEqual(before);expect((await read(first.id)).currentState).toBe('pending');
  });
  it.each(['completed','pending'])('does not regress a cancelled report to %s',async status=>{
    const first=await write('cancelled'),before=await observations();await expect(write(status)).rejects.toMatchObject({name:'ApiConversionConflictError'});
    expect(await observations()).toEqual(before);expect((await read(first.id)).currentState).toBe('cancelled');
  });
  it.each(['revoked','expired','scope','corrupt-scope','rotated','other-tenant','owner','merchant','missing-key','malformed'])('rechecks %s after an earlier API authentication decision',async mode=>{
    const first=await write(),before=await observations();let auth={...authority};
    if(mode==='revoked')await q('UPDATE sari_api_keys SET is_active=0 WHERE id=?',[authority.apiKeyId]);
    if(mode==='expired')await q('UPDATE sari_api_keys SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=?',[authority.apiKeyId]);
    if(mode==='scope')await q('UPDATE sari_api_keys SET permissions=? WHERE id=?',[encodeApiKeyPermissions(['merchant:read']),authority.apiKeyId]);
    if(mode==='corrupt-scope')await q("UPDATE sari_api_keys SET permissions='{}' WHERE id=?",[authority.apiKeyId]);
    if(mode==='rotated')await q('UPDATE sari_api_keys SET key_hash=? WHERE id=?',[hash(randomUUID()),authority.apiKeyId]);
    if(mode==='other-tenant'){const other=await createDisposableMerchant('conversion-other');users.push(other.userId);auth=(await key(other.merchantId)).authority;}
    if(mode==='owner')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[user]);
    if(mode==='merchant')await q("UPDATE merchants SET status='suspended' WHERE id=?",[merchant]);
    if(mode==='missing-key')await q('DELETE FROM sari_api_keys WHERE id=?',[authority.apiKeyId]);
    if(mode==='malformed')auth={apiKeyId:0,keyHash:'x'};
    await expect(write('completed',auth)).rejects.toMatchObject({name:'ConversionAccessDenied'});await expect(read(first.id,auth)).rejects.toMatchObject({name:'ConversionAccessDenied'});
    expect(await observations()).toEqual(before);
  });
  it('retains the original observer when credentials rotate and never retroactively reassigns a receipt',async()=>{
    const first=await write(),initial=await observations(),next=await key();await q('DELETE FROM sari_api_keys WHERE id=?',[authority.apiKeyId]);
    expect(await write('pending',next.authority)).toMatchObject({id:first.id,created:false});expect(await observations()).toEqual(initial);
    await write('completed',next.authority);const result=await read(first.id,next.authority);expect(result.observations.map(o=>o.observation.apiKeyId)).toEqual([authority.apiKeyId,next.authority.apiKeyId]);
  });
  it('labels internal Byaan reporting as unverified, not as an authenticated provider payment',async()=>{
    const result=await recordApiConversion(merchant,event);expect((await read(result.id)).observations[0].observation).toMatchObject({source:'internal_unverified',apiKeyId:null});
    await write('completed');expect((await read(result.id)).observations.map(o=>o.observation.source)).toEqual(['internal_unverified','api_key_report']);
  });
  it('cannot upgrade an internal receipt by replaying the same state through a current API key',async()=>{
    const first=await recordApiConversion(merchant,{...event,status:'completed'}),before=await observations();
    await write('completed');expect(await observations()).toEqual(before);expect((await read(first.id)).observations[0].observation).toMatchObject({source:'internal_unverified',apiKeyId:null});
  });
  it('does not fabricate provenance for legacy records or backdate a newly received observation',async()=>{
    const legacy=await q("INSERT INTO sari_conversions(merchant_id,customer_phone,action_type,product_name,external_ref,idempotency_key,source,status) VALUES (?,'+966501234567','enrollment','دورة اختبار','legacy','legacy','api','completed')",[merchant]);
    expect(await read(legacy.insertId)).toMatchObject({history:'legacy_unrecorded',observations:[]});
    const after=Date.now();await recordApiConversion(merchant,{customerPhone:'0501234567',actionType:'enrollment',productName:'دورة اختبار',externalRef:'legacy',status:'completed'},authority);
    const result=await read(legacy.insertId);expect(result.observations).toHaveLength(1);expect(Date.parse(result.observations[0].observation.observedAt)).toBeGreaterThanOrEqual(after);
  });
  it.each(['head','deleted-all','deleted-first','status','payload','digest','tenant','previous'])('rejects inconsistent %s without repairing or overwriting evidence',async mode=>{
    const first=await write();await write('completed');const rows=await observations();
    if(mode==='head')await q('UPDATE sari_conversions SET history_digest=NULL WHERE id=?',[first.id]);
    if(mode==='deleted-all')await q('DELETE FROM api_conversion_observations WHERE conversion_id=?',[first.id]);
    if(mode==='deleted-first')await q('DELETE FROM api_conversion_observations WHERE id=?',[rows[0].id]);
    if(mode==='status')await q("UPDATE sari_conversions SET status='pending' WHERE id=?",[first.id]);
    if(mode==='payload')await q("UPDATE sari_conversions SET product_name='changed' WHERE id=?",[first.id]);
    if(mode==='digest')await q('UPDATE api_conversion_observations SET observation_digest=? WHERE id=?',['0'.repeat(64),rows[0].id]);
    if(mode==='previous')await q('UPDATE api_conversion_observations SET previous_digest=NULL WHERE id=?',[rows[1].id]);
    if(mode==='tenant'){const other=await createDisposableMerchant('history-foreign');users.push(other.userId);await q('UPDATE api_conversion_observations SET merchant_id=? WHERE id=?',[other.merchantId,rows[0].id]);}
    await expect(read(first.id)).rejects.toThrow();const before=await observations();await expect(write('cancelled')).rejects.toThrow();expect(await observations()).toEqual(before);
  });
  it.each(['history-insert','head-update','lost-commit'].flatMap(mode=>[false,true].map(fresh=>({mode,fresh}))))('keeps history atomic through $mode failure, new row: $fresh',async({mode,fresh})=>{
    const first=fresh?null:await write(),before=first?await read(first.id):null,pool=(await getPool())!,get=pool.getConnection.bind(pool);let hit=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c),commit=c.commit.bind(c);let changed=false;
      vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{const result=await execute(sql,args);
        if(sql.includes('INSERT INTO api_conversion_observations')){changed=true;if(mode==='history-insert'){hit=true;throw Error('lost write');}}
        if(sql.includes('UPDATE sari_conversions SET status = ?,history_digest=')&&mode==='head-update'){hit=true;throw Error('lost head');}return result;
      })as any);vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(changed&&mode==='lost-commit'&&!hit){hit=true;throw Error('lost commit');}});return c;});
    await expect(write('completed')).rejects.toThrow();vi.restoreAllMocks();expect(hit).toBe(true);
    if(mode!=='lost-commit'){
      if(first)expect(await read(first.id)).toEqual(before);
      else {expect(await q('SELECT id FROM sari_conversions WHERE merchant_id=?',[merchant])).toEqual([]);expect(await observations()).toEqual([]);}
    }
    const recovered=await write('completed');expect(recovered).toMatchObject({created:fresh&&mode!=='lost-commit',status:'completed'});
    if(first)expect(recovered.id).toBe(first.id);expect(await write('completed')).toEqual({...recovered,created:false});expect(await observations()).toHaveLength(fresh?1:2);
  });
  it('uses the real API middleware, returns 201 then 200, and exposes history without credential or customer data',async()=>{
    const request=(path:string,method='GET',body?:unknown,token=rawKey)=>fetch(base+path,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const first=await request('/conversions','POST',event);expect(first.status).toBe(201);const saved=await first.json() as any;
    const replay=await request('/conversions','POST',event);expect(replay.status).toBe(200);expect((await replay.json() as any).created).toBe(false);
    const history=await request(`/conversions/${saved.id}/history`);expect(history.status).toBe(200);const body=await history.json() as any;
    expect(body.observations[0].observation.apiKeyId).toBe(authority.apiKeyId);expect(body.paymentEvidence).toBe('not_verified');
    const readOnly=await key(merchant,['conversions:read']);expect((await request('/conversions','POST',event,readOnly.raw)).status).toBe(403);
    const writeOnly=await key(merchant,['conversions:write']);expect((await request(`/conversions/${saved.id}/history`,'GET',undefined,writeOnly.raw)).status).toBe(403);
    expect((await request('/conversions','POST',{...event,source:'api_key_report',apiKeyId:authority.apiKeyId})).status).toBe(422);
    const other=await createDisposableMerchant('rest-history-other');users.push(other.userId);const otherKey=await key(other.merchantId);
    expect((await request(`/conversions/${saved.id}/history`,'GET',undefined,otherKey.raw)).status).toBe(404);
    expect((await request('/conversions/2147483648/history')).status).toBe(400);
    await q('DELETE FROM api_conversion_observations WHERE conversion_id=?',[saved.id]);expect((await request(`/conversions/${saved.id}/history`)).status).toBe(409);
  });
});
