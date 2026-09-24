import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { getPool,closeDb } from '../db/connection';
import { reserveAiBudget,settleAiBudget,withAiBudget,type AiBudgetAttempt } from './budget-ledger';
import { persistAiProviderUsage,settleAiProviderUsage,claimAiSettlements,recoverAiSettlement,runAiSettlementBatch } from './budget-settlement';

describe.skipIf(!process.env.DATABASE_URL)('durable provider usage settlement on MySQL',()=>{
  let identity:string,model:string,attempt:AiBudgetAttempt;
  const usage={prompt_tokens:3,completion_tokens:2};
  const query=async(sql:string,args:any[]=[]):Promise<any>=>(await(await getPool())!.execute(sql,args))[0];
  const row=async()=> (await query('SELECT * FROM ai_usage_reservations WHERE reservation_key=?',[attempt.reservationKey]))[0];
  const amounts=()=>query('SELECT * FROM ai_budget_periods WHERE scope_key=? ORDER BY period_start',[attempt.scopeKey]);
  const due=()=>query('UPDATE ai_usage_reservations SET settlement_next_at=UTC_TIMESTAMP(3) WHERE reservation_key=?',[attempt.reservationKey]);
  const request=()=>({merchantId:identity,provider:'openai',model,taskType:'fixture.settlement',inputTokens:10,maxOutputTokens:10});
  beforeEach(async()=>{
    identity=`settlement-${randomUUID()}`;model=`fixture-${randomUUID()}`;vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Unexpected HTTP');}));
    await query("INSERT INTO ai_budget_policies(scope_key,version,daily_limit_micro_usd,enabled) VALUES (?,'fixture',100000000,1)",[`platform:${identity}`]);
    await query(`INSERT INTO ai_price_cards(provider,model,version,input_micro_usd_per_million,output_micro_usd_per_million,flat_micro_usd,max_input_tokens,enabled)
      VALUES ('openai',?,'fixture-v1',1000000,2000000,1,10000,1)`,[model]);
    const input=request(),r=await reserveAiBudget(input);attempt={...r,provider:input.provider,model,taskType:input.taskType};
  });
  afterEach(async()=>{
    expect(fetch).not.toHaveBeenCalled();vi.restoreAllMocks();vi.unstubAllGlobals();
    for(const p of await amounts())await query("UPDATE ai_budget_periods SET reserved_micro_usd=reserved_micro_usd-?,spent_micro_usd=spent_micro_usd-? WHERE scope_key='global' AND period_start=?",[p.reserved_micro_usd,p.spent_micro_usd,p.period_start]);
    for(const table of ['ai_usage_reservations','ai_budget_periods','ai_budget_policies'])await query(`DELETE FROM ${table} WHERE scope_key=?`,[attempt.scopeKey]);
    await query("DELETE FROM ai_price_cards WHERE provider='openai' AND model=?",[model]);
  });afterAll(closeDb);
  async function fault(phase:'receipt'|'settle',when:'before'|'after',count=Infinity,code?:string){
    const pool=(await getPool())!,get=pool.getConnection.bind(pool);let failures=0;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();let selected=false;
      return new Proxy(c,{get(t,k){
        if(k==='execute')return async(...args:any[])=>{const sql=String(args[0]);
          if(sql.includes(phase==='receipt'?'SET usage_prompt_tokens=':"SET state = 'settled'"))selected=true;
          return(t.execute as any)(...args);
        };
        if(k==='commit')return async()=>{
          const fail=selected&&failures<count;if(fail)failures++;const error=Object.assign(Error('private database details'),code?{code}:{});
          if(fail&&when==='before')throw error;await t.commit();if(fail&&when==='after')throw error;
        };
        const value=(t as any)[k];return typeof value==='function'?value.bind(t):value;
      }})as any;
    });return()=>failures;
  }
  it.each(['reserved','unknown'])('settles captured usage after a process stops in %s',async state=>{
    await persistAiProviderUsage(attempt,usage);await query('UPDATE ai_usage_reservations SET state=? WHERE reservation_key=?',[state,attempt.reservationKey]);
    expect(await claimAiSettlements()).toHaveLength(0);await due();expect((await runAiSettlementBatch()).settled).toBe(1);
    expect(await row()).toMatchObject({state:'settled',settled_micro_usd:8,settlement_token:null,settlement_next_at:null,settlement_attempts:1});
    expect((await amounts())[0]).toMatchObject({spent_micro_usd:8,reserved_micro_usd:0});
  });
  it('does not guess usage for old reserved or unknown attempts',async()=>{
    await query("UPDATE ai_usage_reservations SET state='unknown' WHERE reservation_key=?",[attempt.reservationKey]);await due();
    expect(await claimAiSettlements()).toHaveLength(0);expect((await amounts())[0].reserved_micro_usd).toBe(31);
  });
  it('preserves the original quote after an administrator changes or disables its price card',async()=>{
    await persistAiProviderUsage(attempt,usage);await query("UPDATE ai_price_cards SET enabled=0,input_micro_usd_per_million=999999999,version='changed' WHERE model=?",[model]);
    await due();expect((await runAiSettlementBatch()).settled).toBe(1);expect((await row()).settled_micro_usd).toBe(8);
  });
  it('records actual usage above the quote without truncating the billed amount',async()=>{
    await persistAiProviderUsage(attempt,{prompt_tokens:100,completion_tokens:20});await due();await runAiSettlementBatch();
    expect((await amounts())[0]).toMatchObject({spent_micro_usd:141,reserved_micro_usd:0});
  });
  it('acknowledges the same receipt without moving its schedule or stealing its lease',async()=>{
    await persistAiProviderUsage(attempt,usage);await due();const [claim]=await claimAiSettlements();const before=await row();
    expect(await persistAiProviderUsage(attempt,{...usage})).toBe(false);expect(await row()).toEqual(before);expect((await row()).settlement_token).toBe(claim.token);
  });
  it.each(['reservationKey','scopeKey','requestId','provider','model','taskType'])('rejects forged receipt %s before recording usage',async field=>{
    const before=await row();await expect(persistAiProviderUsage({...attempt,[field]:field==='reservationKey'?'f'.repeat(64):'forged'},usage)).rejects.toThrow();expect(await row()).toEqual(before);
  });
  it('rejects a different receipt even when flat pricing would produce the same total',async()=>{
    await query('UPDATE ai_usage_reservations SET input_rate=0,output_rate=0,flat_micro_usd=31 WHERE reservation_key=?',[attempt.reservationKey]);
    await persistAiProviderUsage(attempt,usage);const before=await row();await expect(persistAiProviderUsage(attempt,{...usage,prompt_tokens:4})).rejects.toThrow('reservation_conflict');expect(await row()).toEqual(before);
    await expect(settleAiBudget(attempt,{...usage,prompt_tokens:4})).rejects.toThrow('reservation_conflict');
  });
  it.each(['before','after']as const)('retains receipt durability across a transient %s commit fault',async when=>{
    const failures=await fault('receipt',when,1,'ECONNRESET');await settleAiProviderUsage(attempt,usage);
    expect(failures()).toBe(1);expect((await row()).state).toBe('settled');expect((await amounts())[0].spent_micro_usd).toBe(8);
  });
  it('bounds transient receipt retries and does not settle without a committed receipt',async()=>{
    const failures=await fault('receipt','before',Infinity,'ER_LOCK_DEADLOCK');await expect(settleAiProviderUsage(attempt,usage)).rejects.toThrow('budget_unavailable');
    expect(failures()).toBe(3);expect((await row()).usage_received_at).toBeNull();expect((await amounts())[0].reserved_micro_usd).toBe(31);
  });
  it('keeps a saved receipt after lost acknowledgement even when the caller cannot confirm it',async()=>{
    await fault('receipt','after');await expect(settleAiProviderUsage(attempt,usage)).rejects.toThrow('budget_unavailable');vi.restoreAllMocks();
    expect((await row()).state).toBe('reserved');await due();expect((await runAiSettlementBatch()).settled).toBe(1);
  });
  it.each(['before','after']as const)('recovers a settlement commit failure %s acknowledgement exactly once',async when=>{
    await fault('settle',when);await expect(settleAiProviderUsage(attempt,usage)).rejects.toThrow();vi.restoreAllMocks();
    await due();const result=await runAiSettlementBatch();expect(result.settled).toBe(when==='before'?1:0);
    expect((await row()).state).toBe('settled');expect((await amounts())[0]).toMatchObject({spent_micro_usd:8,reserved_micro_usd:0});
    expect((await runAiSettlementBatch()).claimed).toBe(0);
  });
  it('retains funds, redacts failure and backs off a failed worker without blocking the next attempt',async()=>{
    await persistAiProviderUsage(attempt,usage);await due();await fault('settle','before');expect((await runAiSettlementBatch()).deferred).toBe(1);vi.restoreAllMocks();
    expect((await row()).settlement_last_error).toBe('settlement_deferred');expect((await amounts())[0].reserved_micro_usd).toBe(31);
    expect(await claimAiSettlements()).toHaveLength(0);await due();expect((await runAiSettlementBatch()).settled).toBe(1);
  });
  it('settles only once across five concurrent workers',async()=>{
    await persistAiProviderUsage(attempt,usage);await due();const r=await Promise.all(Array.from({length:5},()=>runAiSettlementBatch()));
    expect(r.reduce((n,x)=>n+x.claimed,0)).toBe(1);expect(r.reduce((n,x)=>n+x.settled,0)).toBe(1);expect((await amounts())[0].spent_micro_usd).toBe(8);
  });
  it('settles from SQL in three independent processes without in-memory authority',async()=>{
    await persistAiProviderUsage(attempt,usage);await due();
    const script=`import {assertDisposableDatabase} from './server/tests/helpers/disposable-merchant.ts';assertDisposableDatabase();const {runAiSettlementBatch}=await import('./server/ai/budget-settlement.ts');const {closeDb}=await import('./server/db/connection.ts');try{console.log('RESULT:'+JSON.stringify(await runAiSettlementBatch()));}finally{await closeDb();}`;
    const worker=()=>new Promise<any>((resolve,reject)=>{const c=spawn(process.execPath,['--import','tsx','--input-type=module','-e',script],{env:process.env,windowsHide:true});let out='';c.stdout.on('data',b=>out+=b);c.on('error',reject);c.on('exit',code=>{const line=out.split(/\r?\n/).find(s=>s.startsWith('RESULT:'));if(code!==0||!line)return reject(Error('Independent settlement fixture failed'));resolve(JSON.parse(line.slice(7)));});});
    const r=await Promise.all([worker(),worker(),worker()]);expect(r.reduce((n,x)=>n+x.claimed,0)).toBe(1);expect(r.reduce((n,x)=>n+x.settled,0)).toBe(1);expect((await amounts())[0].spent_micro_usd).toBe(8);
  },20000);
  it.each(['scope','request','token','usage','expired'])('fences %s on an automatic settlement',async mode=>{
    await persistAiProviderUsage(attempt,usage);await due();const claim={...(await claimAiSettlements())[0]};
    if(mode==='scope')claim.scopeKey='platform:another';if(mode==='request')claim.requestId=randomUUID();if(mode==='token')claim.token=randomUUID();
    if(mode==='usage')claim.usage={...usage,prompt_tokens:8};
    if(mode==='expired')await query('UPDATE ai_usage_reservations SET settlement_lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE reservation_key=?',[attempt.reservationKey]);
    const before=await row();expect(await recoverAiSettlement(claim)).not.toBe('settled');expect((await amounts())[0].reserved_micro_usd).toBe(31);
    if(mode==='expired')expect(await row()).toEqual(before);
  });
  it('rechecks expiry after waiting for the global accounting lock',async()=>{
    await persistAiProviderUsage(attempt,usage);await due();const [claim]=await claimAiSettlements();
    const pool=(await getPool())!,get=pool.getConnection.bind(pool),blocker=await get();await blocker.beginTransaction();
    await blocker.execute("SELECT scope_key FROM ai_budget_periods WHERE scope_key='global' AND period_start=UTC_DATE() FOR UPDATE");
    let entered!:()=>void;const waiting=new Promise<void>(r=>{entered=r;});
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();return new Proxy(c,{get(t,k){
      if(k==='execute')return async(...args:any[])=>{if(String(args[0]).includes("scope_key = 'global'")&&String(args[0]).includes('FOR UPDATE'))entered();return(t.execute as any)(...args);};
      const value=(t as any)[k];return typeof value==='function'?value.bind(t):value;
    }})as any;});
    const result=recoverAiSettlement(claim);
    try{await waiting;await query('UPDATE ai_usage_reservations SET settlement_lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE reservation_key=?',[attempt.reservationKey]);}
    finally{await blocker.rollback();blocker.release();}
    expect(await result).toBe('skipped');expect((await amounts())[0].reserved_micro_usd).toBe(31);
  });
  it('does not let an expired worker clear or postpone a replacement lease',async()=>{
    await persistAiProviderUsage(attempt,usage);await due();const [old]=await claimAiSettlements();
    await query('UPDATE ai_usage_reservations SET settlement_lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)),settlement_next_at=UTC_TIMESTAMP(3) WHERE reservation_key=?',[attempt.reservationKey]);
    const [next]=await claimAiSettlements(),before=await row();expect(await recoverAiSettlement(old)).toBe('skipped');expect(await row()).toEqual(before);expect(await recoverAiSettlement(next)).toBe('settled');
  });
  it.each(['before receipt','after receipt','after claim'])('preserves superadmin evidence settled %s',async when=>{
    if(when!=='before receipt')await persistAiProviderUsage(attempt,usage);
    let claim:any;if(when==='after claim'){await due();[claim]=await claimAiSettlements();}
    await settleAiBudget(attempt,{prompt_tokens:0,completion_tokens:0},{billedMicroUsd:17,reference:'provider-invoice-fixture',actorId:99});
    await settleAiProviderUsage(attempt,usage);if(claim)expect(await recoverAiSettlement(claim)).toBe('skipped');
    expect(await row()).toMatchObject({state:'settled',settled_micro_usd:17,reconciled_by:99,reconciliation_reference:'provider-invoice-fixture',settlement_next_at:null,settlement_token:null});
    expect((await amounts())[0].spent_micro_usd).toBe(17);
  });
  it('settles the original UTC period after the day changes',async()=>{
    await persistAiProviderUsage(attempt,usage);
    for(const scope of [attempt.scopeKey,'global'])await query(`INSERT INTO ai_budget_periods(scope_key,period_start,policy_version,limit_micro_usd,reserved_micro_usd)
      VALUES (?,DATE_SUB(UTC_DATE(),INTERVAL 1 DAY),'fixture',100000000,31)
      ON DUPLICATE KEY UPDATE reserved_micro_usd=reserved_micro_usd+31`,[scope]);
    await query('UPDATE ai_usage_reservations SET period_start=DATE_SUB(period_start,INTERVAL 1 DAY) WHERE reservation_key=?',[attempt.reservationKey]);
    await query("UPDATE ai_budget_periods SET reserved_micro_usd=reserved_micro_usd-31 WHERE scope_key IN (?,'global') AND period_start=UTC_DATE()",[attempt.scopeKey]);
    await due();await runAiSettlementBatch();const periods=await amounts();expect(periods[0].spent_micro_usd).toBe(8);expect(periods[1].spent_micro_usd).toBe(0);
  });
  it('captures usage even when application handoff fails without replaying generation',async()=>{
    const input={...request(),requestId:randomUUID()},operation=vi.fn(async()=>({usage}));
    await expect(withAiBudget(input,operation,r=>r.usage,{beforeDispatch:async()=>{},afterResponse:async()=>{throw Error('private handoff');}})).rejects.toThrow('budget_unavailable');
    const [saved]=await query('SELECT * FROM ai_usage_reservations WHERE request_id=?',[input.requestId]);expect(saved).toMatchObject({state:'unknown',usage_prompt_tokens:3,usage_completion_tokens:2});
    await query('UPDATE ai_usage_reservations SET settlement_next_at=UTC_TIMESTAMP(3) WHERE reservation_key=?',[saved.reservation_key]);expect((await runAiSettlementBatch()).settled).toBe(1);expect(operation).toHaveBeenCalledOnce();
  });
  it('rejects partial receipts at the database boundary',async()=>{
    await expect(query('UPDATE ai_usage_reservations SET usage_prompt_tokens=3 WHERE reservation_key=?',[attempt.reservationKey])).rejects.toThrow();expect((await row()).usage_received_at).toBeNull();
  });
  it.each([0,21,1.5,NaN])('rejects invalid settlement batch size %s',async limit=>{await expect(claimAiSettlements(limit)).rejects.toThrow('invalid_usage');});
});
