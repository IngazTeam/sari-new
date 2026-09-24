import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { AiBudgetError, reserveAiBudget, withAiBudget, type AiBudgetAttempt } from './budget-ledger';
import { bindLearningProviderAttempt, claimLearningAnalysis, dispatchLearningAnalysis, recordLearningProviderFailure,
  resumeLearningAnalysis, storeLearningResponse, storeLearningProviderReceipt, loadLearningProviderRecovery } from './learning-analysis-jobs';
import { claimLearningProviderRecoveries, recoverLearningProviderResult, runLearningProviderRecoveryBatch } from './learning-provider-recovery';
import { snapshotLearningSignals } from './learning-analysis-contract';
import { getLearningAnalysisStatus, runLearningRecoveryBatch } from './learning-analysis-recovery';
import { clearZahyPiRuntimeConfigCache } from './zahypi-client';
import { resolveSariTaskType } from './task-catalog';
import { triggerPatternAnalysis } from './learning-engine';
import { saveLearningProviderResponse } from './learning-response-handoff';
import { runAiSettlementBatch } from './budget-settlement';

const config=vi.hoisted(()=>({provider:'openai',model:'',notify:vi.fn(),enabled:true}));
vi.mock('../db_ai_settings',()=>({
  getOpenAiApiKey:async()=> 'synthetic-key', logAiUsage:async()=>{},estimateCost:()=>0,
  getZahyPiRuntimeConfig:async()=>({enabled:config.enabled,provider:config.provider,model:config.model,
    apiKey:'synthetic-key',baseUrl:'https://api.zahypi.test/v1',projectId:'sari',source:'database'}),
}));
vi.mock('../_core/notificationService',()=>({sendNotification:config.notify}));
vi.mock('./smart-escalation',()=>({sendKnowledgeGapDigest:async()=>{}}));

describe.skipIf(!process.env.DATABASE_URL)('learning response handoff through real adapters and budget on MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,ids:number[],originalPrices:any[];
  const query=async(sql:string,args:any[]=[]):Promise<any> => (await (await getPool())!.execute(sql,args))[0];
  const job=async()=> (await query('SELECT * FROM ai_learning_analysis_jobs WHERE merchant_id=?',[owner.merchantId]))[0];
  const ledger=()=>query('SELECT * FROM ai_usage_reservations WHERE scope_key=?',[`merchant:${owner.merchantId}`]);
  const response=(references=ids)=>JSON.stringify({updates:[{dimension:'objection_handling',insight:'Explain relevant value',confidence:0.7,
    supporting_signal_ids:references.slice(0,3),contrary_signal_ids:[]}],knowledge_gaps:[]});
  const request=()=>({merchantId:owner.merchantId,provider:'openai',model:'gpt-4o-mini',taskType:'sari.learning.pattern_analysis',inputTokens:1,maxOutputTokens:1});
  beforeEach(async()=>{
    config.provider='openai';config.enabled=true;config.model=`learning-fixture-${randomUUID()}`;config.notify.mockReset();
    clearZahyPiRuntimeConfigCache();vi.stubEnv('ZAHYPI_ALLOWED_ORIGINS','https://api.zahypi.test');
    owner=await createDisposableMerchant('provider-link');ids=[];
    const sub=await query(`INSERT INTO merchant_subscriptions (merchant_id,status,billing_cycle,start_date,end_date,trial_ends_at)
      VALUES (?,'trial','monthly',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY))`,[owner.merchantId]);
    await query('UPDATE merchants SET current_subscription_id=? WHERE id=?',[sub.insertId,owner.merchantId]);
    await query("INSERT INTO ai_budget_policies (scope_key,version,daily_limit_micro_usd,enabled) VALUES (?,'fixture',100000000,1)",[`merchant:${owner.merchantId}`]);
    originalPrices=await query("SELECT * FROM ai_price_cards WHERE provider='openai' AND model='gpt-4o-mini'");
    for(const [provider,model]of [['openai','gpt-4o-mini'],['zahypi',config.model]])await query(`INSERT INTO ai_price_cards
      (provider,model,version,input_micro_usd_per_million,output_micro_usd_per_million,flat_micro_usd,max_input_tokens,enabled)
      VALUES (?,?,'fixture',1,1,1,1000000,1) ON DUPLICATE KEY UPDATE version='fixture',input_micro_usd_per_million=1,
      output_micro_usd_per_million=1,flat_micro_usd=1,max_input_tokens=1000000,enabled=1`,[provider,model]);
    const conversation=(await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000177')",[owner.merchantId])).insertId;
    for(let i=0;i<10;i++)ids.push((await query("INSERT INTO sari_learning_signals (merchant_id,conversation_id,signal_type,customer_message) VALUES (?,?,'price_objection','Synthetic source')",[owner.merchantId,conversation])).insertId);
  });
  afterEach(async()=>{
    vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();clearZahyPiRuntimeConfigCache();
    // Remove only this merchant's synthetic accounting, preserving other local fixtures.
    for(const p of await query('SELECT * FROM ai_budget_periods WHERE scope_key=?',[`merchant:${owner.merchantId}`]))
      await query("UPDATE ai_budget_periods SET reserved_micro_usd=reserved_micro_usd-?,spent_micro_usd=spent_micro_usd-? WHERE scope_key='global' AND period_start=?",[p.reserved_micro_usd,p.spent_micro_usd,p.period_start]);
    for(const table of ['ai_usage_reservations','ai_budget_periods','ai_budget_policies'])await query(`DELETE FROM ${table} WHERE scope_key=?`,[`merchant:${owner.merchantId}`]);
    await query("DELETE FROM ai_price_cards WHERE (provider='openai' AND model='gpt-4o-mini') OR (provider='zahypi' AND model=?)",[config.model]);
    for(const row of originalPrices){const columns=Object.keys(row);await query(`INSERT INTO ai_price_cards (${columns.map(k=>'`'+k+'`').join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,Object.values(row));}
    await cleanupDisposableMerchants([owner.userId]);
  });afterAll(closeDb);
  async function claim(){
    const s=snapshotLearningSignals(owner.merchantId,await query('SELECT * FROM sari_learning_signals WHERE merchant_id=? ORDER BY id',[owner.merchantId]));
    const r=await claimLearningAnalysis(s);if(r.status!=='claimed')throw Error('Missing fixture claim');
    await dispatchLearningAnalysis(r.claim);return r.claim;
  }
  async function attempt():Promise<AiBudgetAttempt>{const input=request(),r=await reserveAiBudget(input);return {...r,provider:input.provider,model:input.model,taskType:input.taskType};}
  function transport(content?:string){
    const fetchMock=vi.fn(async(_url:any,init:any)=>{
      const bound=await job(),[reservation]=await ledger();
      expect(bound.ai_reservation_key).toBe(reservation.reservation_key);expect(bound.state).toBe('dispatched');
      expect(reservation.state).toBe('reserved');
      const headers=init.headers as Record<string,string>,id=headers['X-Client-Request-Id']??headers['X-Trace-Id'];
      expect(id).toBe(reservation.request_id);
      const references=typeof bound.source_ids==='string'?JSON.parse(bound.source_ids):bound.source_ids;
      if(config.provider==='openai')return Response.json({id:'chatcmpl-synthetic',model:'gpt-4o-mini',choices:[{message:{content:content??response(references)}}],usage:{prompt_tokens:3,completion_tokens:2,total_tokens:5}});
      const contract=resolveSariTaskType('sari.learning.pattern_analysis');
      return Response.json({job_id:'11111111-1111-4111-8111-111111111111',status:'completed',project_id:'sari',tenant_id:headers['X-ZahyPi-Tenant'],
        task_type:contract.taskType,trace_id:id,run_manifest_id:'22222222-2222-4222-8222-222222222222',route:config.model,
        usage:{prompt_tokens:3,completion_tokens:2,total_tokens:5},structured_output:{...contract.sampleOutput,traceId:id,applicationResponse:content??response(references)}});
    });vi.stubGlobal('fetch',fetchMock);return fetchMock;
  }
  function fault(mode:'bind before'|'bind after'|'save before'|'save after'|'settle before'|'settle after'|'receipt before'|'receipt after'){
    return (async()=>{
      const pool=(await getPool())!,get=pool.getConnection.bind(pool);
      vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();let phase='';return new Proxy(c,{get(t,k){
        if(k==='execute')return async(...args:any[])=>{const sql=String(args[0]);
          if(sql.includes('SET ai_reservation_key='))phase='bind';
          if(sql.includes('SET provider_receipt='))phase='receipt';
          if(sql.includes("SET state='responded'"))phase='save';
          if(sql.includes("SET state = 'settled'"))phase='settle';
          return (t.execute as any)(...args);
        };
        if(k==='commit')return async()=>{if(mode===`${phase} before`)throw Error('private-sql-fixture');await t.commit();if(mode===`${phase} after`)throw Error('private-sql-fixture');};
        const value=(t as any)[k];return typeof value==='function'?value.bind(t):value;
      }})as any;});
    })();
  }
  async function recover(){
    await query('UPDATE ai_learning_analysis_jobs SET recovery_next_at=UTC_TIMESTAMP(3) WHERE merchant_id=?',[owner.merchantId]);
    const result=await runLearningRecoveryBatch();expect(result.applied).toBe(1);
    expect((await job()).state).toBe('applied');expect(await query('SELECT id FROM ai_learning_proposals WHERE merchant_id=?',[owner.merchantId])).toHaveLength(1);
  }
  const dueProvider=()=>query('UPDATE ai_learning_analysis_jobs SET recovery_next_at=UTC_TIMESTAMP(3) WHERE merchant_id=?',[owner.merchantId]);
  it.each(['before','after'] as const)('does not repeat POST or poll when receipt commit fails %s acknowledgement',async when=>{
    config.provider='zahypi';const fetch=vi.fn(async()=>Response.json({job_id:randomUUID(),status:'queued'}));vi.stubGlobal('fetch',fetch);await fault(`receipt ${when}`);
    expect((await triggerPatternAnalysis(owner.merchantId)).status).toBe('failed');expect(fetch).toHaveBeenCalledOnce();
    expect((await job()).provider_receipt!==null).toBe(when==='after');expect((await ledger())[0].state).toBe('unknown');
  });
  async function accepted(){
    config.provider='zahypi';let headers:Record<string,string>={};
    const fetch=vi.fn(async(_url:any,init:any)=>{
      if(init.method==='POST') {headers=init.headers;return Response.json({job_id:'11111111-1111-4111-8111-111111111111',status:'queued'});}
      expect((await job()).provider_receipt).not.toBeNull();throw Error('Synthetic worker interruption after acceptance');
    });vi.stubGlobal('fetch',fetch);
    expect((await triggerPatternAnalysis(owner.merchantId)).status).toBe('failed');
    const stored=await job();expect(stored.state).toBe('uncertain');expect(stored.provider_receipt).not.toBeNull();
    const contract=resolveSariTaskType('sari.learning.pattern_analysis');
    const completed={job_id:'11111111-1111-4111-8111-111111111111',status:'completed',project_id:'sari',tenant_id:headers['X-ZahyPi-Tenant'],
      task_type:contract.taskType,trace_id:headers['X-Trace-Id'],run_manifest_id:'22222222-2222-4222-8222-222222222222',route:config.model,
      usage:{prompt_tokens:3,completion_tokens:2,total_tokens:5},structured_output:{...contract.sampleOutput,traceId:headers['X-Trace-Id'],applicationResponse:response(typeof stored.source_ids==='string'?JSON.parse(stored.source_ids):stored.source_ids)}};
    fetch.mockImplementation(async(_url:any,init:any)=>{expect(init.method).toBe('GET');return Response.json(completed);});
    fetch.mockClear();return{fetch,completed};
  }
  it('recovers an accepted result from durable receipt, settles the original reservation and projects without notifications',async()=>{
    const {fetch}=await accepted();expect(await claimLearningProviderRecoveries()).toHaveLength(0);await dueProvider();
    expect((await runLearningProviderRecoveryBatch()).saved).toBe(1);expect(fetch).toHaveBeenCalledOnce();expect(await ledger()).toHaveLength(1);expect((await ledger())[0].state).toBe('settled');
    expect((await job()).state).toBe('responded');await recover();expect(config.notify).not.toHaveBeenCalled();expect((await runLearningProviderRecoveryBatch()).claimed).toBe(0);
  });
  it('recovers a process death that left dispatch and budget both reserved',async()=>{
    const {fetch}=await accepted();await query("UPDATE ai_learning_analysis_jobs SET state='dispatched' WHERE merchant_id=?",[owner.merchantId]);
    await query("UPDATE ai_usage_reservations SET state='reserved' WHERE scope_key=?",[`merchant:${owner.merchantId}`]);await dueProvider();
    expect((await runLearningProviderRecoveryBatch()).saved).toBe(1);expect(fetch).toHaveBeenCalledOnce();expect((await ledger())[0].state).toBe('settled');
  });
  it('reconstructs receipt authority in a fresh Node process after competing processes claim it',async()=>{
    await accepted();await dueProvider();
    const script=`import {assertDisposableDatabase} from './server/tests/helpers/disposable-merchant.ts';assertDisposableDatabase();const {claimLearningProviderRecoveries}=await import('./server/ai/learning-provider-recovery.ts');const {loadLearningProviderRecovery}=await import('./server/ai/learning-analysis-jobs.ts');const {closeDb}=await import('./server/db/connection.ts');try{const claims=await claimLearningProviderRecoveries();const recovered=[];for(const claim of claims)recovered.push({claim,authority:await loadLearningProviderRecovery(claim)});console.log('RESULT:'+JSON.stringify(recovered));}finally{await closeDb();}`;
    const worker=()=>new Promise<any[]>((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',script],{env:process.env,windowsHide:true});let out='';child.stdout.on('data',b=>out+=b);child.on('error',reject);child.on('exit',code=>{const line=out.split(/\r?\n/).find(s=>s.startsWith('RESULT:'));if(code!==0||!line)return reject(Error('Independent recovery fixture failed'));resolve(JSON.parse(line.slice(7)));});});
    const rows=(await Promise.all([worker(),worker(),worker()])).flat();expect(rows).toHaveLength(1);
    expect(rows[0].authority.attempt.reservationKey).toBe((await job()).ai_reservation_key);expect(rows[0].authority.receipt.tenantId).toBe(`merchant:${owner.merchantId}`);
    expect(await recoverLearningProviderResult(rows[0].claim)).toBe('saved');
  },20000);
  it('allows only one lease among five concurrent workers',async()=>{
    const {fetch}=await accepted();await dueProvider();const results=await Promise.all(Array.from({length:5},()=>runLearningProviderRecoveryBatch()));
    expect(results.reduce((n,r)=>n+r.claimed,0)).toBe(1);expect(results.reduce((n,r)=>n+r.saved,0)).toBe(1);expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(['queued','http failure','invalid identity','malformed result'])('defers %s and preserves held funds without re-POST',async mode=>{
    const {fetch,completed}=await accepted();await dueProvider();
    if(mode==='queued')completed.status='running';if(mode==='invalid identity')completed.tenant_id='merchant:999999';
    if(mode==='malformed result')completed.structured_output.applicationResponse='invalid';
    if(mode==='http failure')fetch.mockResolvedValue(new Response('private failure',{status:503}));
    const result=await runLearningProviderRecoveryBatch();expect(result.saved).toBe(0);expect((await ledger())[0].state).toBe('unknown');expect(fetch).toHaveBeenCalledOnce();
    expect((await runLearningProviderRecoveryBatch()).claimed).toBe(0);expect(await query('SELECT id FROM ai_learning_proposals WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);
  });
  it.each(['disabled','provider changed','source changed','budget missing','forged tenant','forged trace','replaced claim','expired lease'])('blocks %s before any retrieval',async mode=>{
    const {fetch}=await accepted();await dueProvider();const [c]=await claimLearningProviderRecoveries();
    if(mode==='disabled')config.enabled=false;if(mode==='provider changed')config.provider='openai';
    if(mode==='source changed')await query('UPDATE sari_learning_signals SET customer_message=? WHERE merchant_id=?',['changed',owner.merchantId]);
    if(mode==='budget missing')await query('UPDATE ai_learning_analysis_jobs SET ai_reservation_key=? WHERE merchant_id=?',['b'.repeat(64),owner.merchantId]);
    if(mode==='forged tenant'||mode==='forged trace')await query('UPDATE ai_learning_analysis_jobs SET provider_receipt=JSON_SET(provider_receipt,?,?) WHERE merchant_id=?',[mode==='forged tenant'?'$.tenantId':'$.traceId',mode==='forged tenant'?'merchant:999999':randomUUID(),owner.merchantId]);
    if(mode==='replaced claim')await query('UPDATE ai_learning_analysis_jobs SET claim_token=? WHERE merchant_id=?',[randomUUID(),owner.merchantId]);
    if(mode==='expired lease')await query('UPDATE ai_learning_analysis_jobs SET recovery_lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE merchant_id=?',[owner.merchantId]);
    expect(await recoverLearningProviderResult(c)).not.toBe('saved');expect(fetch).not.toHaveBeenCalled();expect((await ledger())[0].state).toBe('unknown');
  });
  it.each(['claim replaced','lease expired','source changed'])('fences a %s while GET is in flight',async mode=>{
    const {fetch,completed}=await accepted();await dueProvider();const [c]=await claimLearningProviderRecoveries();const nextAt=(await job()).recovery_next_at;
    fetch.mockImplementation(async()=>{
      if(mode==='claim replaced')await query('UPDATE ai_learning_analysis_jobs SET claim_token=? WHERE merchant_id=?',[randomUUID(),owner.merchantId]);
      if(mode==='lease expired')await query('UPDATE ai_learning_analysis_jobs SET recovery_lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE merchant_id=?',[owner.merchantId]);
      if(mode==='source changed')await query('UPDATE sari_learning_signals SET customer_message=? WHERE merchant_id=?',['changed',owner.merchantId]);
      return Response.json(completed);
    });expect(await recoverLearningProviderResult(c)).toBe('skipped');expect((await ledger())[0].state).toBe('unknown');
    expect((await job()).response_json).toBeNull();if(mode==='lease expired')expect((await job()).recovery_next_at).toEqual(nextAt);
  });
  it('retains the recovered response through a settlement outage',async()=>{
    const {fetch}=await accepted();await dueProvider();await fault('settle before');expect((await runLearningProviderRecoveryBatch()).saved).toBe(1);
    expect((await job()).state).toBe('responded');expect((await ledger())[0].state).toBe('unknown');expect(fetch).toHaveBeenCalledOnce();vi.restoreAllMocks();await recover();
    expect((await ledger())[0]).toMatchObject({usage_prompt_tokens:3,usage_completion_tokens:2});
    // Replacing the one-per-merchant learning slot must not erase the financial recovery evidence.
    await query('UPDATE sari_learning_signals SET customer_message=?,analyzed=0 WHERE merchant_id=?',['New source after recovered result',owner.merchantId]);await claim();
    await query('UPDATE ai_usage_reservations SET settlement_next_at=UTC_TIMESTAMP(3) WHERE scope_key=?',[`merchant:${owner.merchantId}`]);
    expect((await runAiSettlementBatch()).settled).toBe(1);expect((await ledger())[0].state).toBe('settled');expect(fetch).toHaveBeenCalledOnce();expect(config.notify).not.toHaveBeenCalled();
  });
  it('recovers a lost response-save acknowledgement after GET without reading or generating again',async()=>{
    const {fetch}=await accepted();await dueProvider();await responseFault('after',1,'ECONNRESET');
    expect((await runLearningProviderRecoveryBatch()).saved).toBe(1);expect(fetch).toHaveBeenCalledOnce();expect((await ledger())[0].state).toBe('settled');
    vi.restoreAllMocks();await recover();expect(config.notify).not.toHaveBeenCalled();
  });
  it('keeps a new recovery lease intact when an old worker returns late',async()=>{
    const {fetch,completed}=await accepted();await dueProvider();const [old]=await claimLearningProviderRecoveries();let next:any;
    fetch.mockImplementation(async()=>{
      await query('UPDATE ai_learning_analysis_jobs SET recovery_lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)),recovery_next_at=UTC_TIMESTAMP(3) WHERE merchant_id=?',[owner.merchantId]);
      [next]=await claimLearningProviderRecoveries();return Response.json(completed);
    });expect(await recoverLearningProviderResult(old)).toBe('skipped');expect((await job()).recovery_token).toBe(next.recoveryToken);
    fetch.mockResolvedValue(Response.json(completed));expect(await recoverLearningProviderResult(next)).toBe('saved');
  });
  it('clears a completed receipt when a different source snapshot obtains a new claim',async()=>{
    await accepted();await dueProvider();await runLearningProviderRecoveryBatch();await recover();
    await query('UPDATE sari_learning_signals SET customer_message=?,analyzed=0 WHERE merchant_id=?',['New source snapshot',owner.merchantId]);
    await claim();expect((await job()).provider_receipt).toBeNull();expect((await job()).ai_reservation_key).toBeNull();
  });
  it('acknowledges an identical acceptance and rejects a replacement provider job ID',async()=>{
    await accepted();await dueProvider();const [c]=await claimLearningProviderRecoveries(),a=await loadLearningProviderRecovery(c);expect(a).not.toBeNull();
    const before=await job();await storeLearningProviderReceipt(c,a!.receipt,a!.attempt);expect(await job()).toEqual(before);
    await expect(storeLearningProviderReceipt(c,{...a!.receipt,jobId:randomUUID()},a!.attempt)).rejects.toThrow('receipt changed');expect(await job()).toEqual(before);
  });
  it('does not authorize retrieval for unreceipted OpenAI or legacy unknown work',async()=>{
    const c=await claim(),a=await attempt();await bindLearningProviderAttempt(c,a);await recordLearningProviderFailure(c,Error('unknown'));await dueProvider();
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect(await claimLearningProviderRecoveries()).toHaveLength(0);expect(fetch).not.toHaveBeenCalled();
  });
  it.each([0,6,1.5,NaN])('rejects invalid recovery batch size %s',async limit=>{
    await expect(claimLearningProviderRecoveries(limit)).rejects.toThrow('batch');
  });
  async function responseFault(mode:'before'|'after',failures:number,code='ECONNRESET',afterCommit?:()=>Promise<void>){
    const stats={saves:0,failed:0,released:0},pool=(await getPool())!,get=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();let saving=false;return new Proxy(c,{get(t,k){
      if(k==='execute')return async(...args:any[])=>{if(String(args[0]).includes("SET state='responded'")){saving=true;stats.saves++;}return(t.execute as any)(...args);};
      if(k==='commit')return async()=>{
        const fail=saving&&stats.failed<failures;
        if(fail&&mode==='before'){stats.failed++;throw Object.assign(Error('private SQL fixture'),{code});}
        await t.commit();
        if(fail&&mode==='after'){stats.failed++;await afterCommit?.();throw Object.assign(Error('private SQL fixture'),{code});}
      };
      if(k==='release')return()=>{if(saving)stats.released++;t.release();};
      const value=(t as any)[k];return typeof value==='function'?value.bind(t):value;
    }})as any;});return stats;
  }
  for(const provider of ['openai','zahypi'])describe(provider,()=>{
    it('links the exact request before HTTP and projects the saved result',async()=>{
      config.provider=provider;const fetch=transport();expect((await triggerPatternAnalysis(owner.merchantId)).status).toBe('applied');
      expect(fetch).toHaveBeenCalledTimes(1);expect((await ledger())[0].state).toBe('settled');
      expect((await job()).ai_reservation_key).toBe((await ledger())[0].reservation_key);
      expect(JSON.stringify(await getLearningAnalysisStatus(owner.merchantId))).not.toContain('reservation');
    });
    it.each(['settle before','settle after','save after'] as const)('recovers without provider replay after %s',async mode=>{
      config.provider=provider;const fetch=transport();await fault(mode);
      expect((await triggerPatternAnalysis(owner.merchantId)).status).toBe('failed');vi.restoreAllMocks();
      expect((await job()).state).toBe('responded');expect((await ledger())[0].state).toBe(mode==='settle after'?'settled':'unknown');
      expect((await getLearningAnalysisStatus(owner.merchantId)).state).toBe('saved');
      await recover();await triggerPatternAnalysis(owner.merchantId);expect(fetch).toHaveBeenCalledTimes(1);
      expect(config.notify).not.toHaveBeenCalled();
    });
    it.each(['bind before','bind after','save before'] as const)('blocks uncertain work after %s',async mode=>{
      config.provider=provider;const fetch=transport();await fault(mode);await triggerPatternAnalysis(owner.merchantId);vi.restoreAllMocks();
      expect((await job()).state).toBe('uncertain');expect((await ledger())[0].state).toBe('unknown');
      expect((await triggerPatternAnalysis(owner.merchantId)).status).toBe('blocked');
      expect(fetch).toHaveBeenCalledTimes(mode==='save before'?1:0);expect((await runLearningRecoveryBatch()).applied).toBe(0);
    });
    it('settles a received but invalid analysis without creating proposals',async()=>{
      config.provider=provider;const fetch=transport('{}');await triggerPatternAnalysis(owner.merchantId);
      expect((await job()).state).toBe('invalid');expect((await ledger())[0].state).toBe('settled');
      expect(await query('SELECT id FROM ai_learning_proposals WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);expect(fetch).toHaveBeenCalledTimes(1);
    });
    it.each([1,2])('saves the returned response after %i transient precommit failures without another provider call',async failures=>{
      config.provider=provider;const fetch=transport(),stats=await responseFault('before',failures,'ER_LOCK_DEADLOCK');
      expect((await triggerPatternAnalysis(owner.merchantId)).status).toBe('applied');
      expect(stats).toEqual({saves:failures+1,failed:failures,released:failures+1});expect(fetch).toHaveBeenCalledTimes(1);
      expect(await ledger()).toHaveLength(1);expect((await ledger())[0].state).toBe('settled');
      expect(await query('SELECT id FROM ai_learning_proposals WHERE merchant_id=?',[owner.merchantId])).toHaveLength(1);expect(config.notify).toHaveBeenCalledTimes(1);
    });
    it('acknowledges an already-committed response after a transient lost acknowledgement',async()=>{
      config.provider=provider;const fetch=transport(),stats=await responseFault('after',1);
      expect((await triggerPatternAnalysis(owner.merchantId)).status).toBe('applied');
      expect(stats.saves).toBe(1);expect(fetch).toHaveBeenCalledTimes(1);expect((await ledger())[0].state).toBe('settled');expect(config.notify).toHaveBeenCalledTimes(1);
    });
    it('stops after three failed local saves and does not authorize another model request',async()=>{
      config.provider=provider;const fetch=transport(),stats=await responseFault('before',100,'ETIMEDOUT');
      expect((await triggerPatternAnalysis(owner.merchantId)).status).toBe('failed');expect(stats.saves).toBe(3);expect(stats.released).toBe(3);
      expect((await job()).state).toBe('uncertain');expect((await job()).response_json).toBeNull();expect((await ledger())[0].state).toBe('unknown');
      expect((await triggerPatternAnalysis(owner.merchantId)).status).toBe('blocked');expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
  it.each(['scopeKey','requestId','model','provider','taskType','reservationKey'] as const)('rejects forged attempt %s before binding',async field=>{
    const c=await claim(),a=await attempt();await expect(bindLearningProviderAttempt(c,{...a,[field]:field==='reservationKey'?'f'.repeat(64):'forged'})).rejects.toThrow();
    expect((await job()).ai_reservation_key).toBeNull();expect((await resumeLearningAnalysis(owner.merchantId)).status).toBe('blocked');
  });
  it('cannot replace an existing bound attempt even with another valid reservation',async()=>{
    const c=await claim(),a=await attempt();await bindLearningProviderAttempt(c,a);
    await expect(bindLearningProviderAttempt(c,await attempt())).rejects.toThrow();expect((await job()).ai_reservation_key).toBe(a.reservationKey);
  });
  it.each(['missing','other','request','stale claim'])('rejects a response with %s authority',async mode=>{
    const c=await claim(),a=await attempt();await bindLearningProviderAttempt(c,a);
    if(mode==='stale claim')expect(await storeLearningResponse({...c,token:randomUUID()},response(),a)).toBeNull();
    else await expect(storeLearningResponse(c,response(),mode==='missing'?undefined:mode==='other'?await attempt():{...a,requestId:randomUUID()})).rejects.toThrow();
    expect((await job()).state).toBe('dispatched');expect((await job()).response_json).toBeNull();
  });
  it('does not authorize new work from a pretransport error code once an attempt is bound',async()=>{
    const c=await claim();await bindLearningProviderAttempt(c,await attempt());await recordLearningProviderFailure(c,new AiBudgetError('budget_exceeded'));
    expect((await job()).state).toBe('dispatched');expect((await resumeLearningAnalysis(owner.merchantId)).status).toBe('blocked');
  });
  it('rejects changed sources before dispatch and does not release potentially billed funds',async()=>{
    const c=await claim(),a=await attempt();await query('UPDATE sari_learning_signals SET customer_message=? WHERE id=?',['Changed',ids[0]]);
    await expect(bindLearningProviderAttempt(c,a)).rejects.toThrow();expect((await job()).ai_reservation_key).toBeNull();expect((await ledger())[0].state).toBe('reserved');
  });
  it('preserves immutable request identity and refuses replay before hooks or transport',async()=>{
    const input={...request(),requestId:randomUUID()},order:string[]=[];
    const hooks={beforeDispatch:vi.fn(async(a:AiBudgetAttempt)=>{expect(Object.isFrozen(a)).toBe(true);order.push('bind');}),
      afterResponse:vi.fn(async(_r:string,a:AiBudgetAttempt)=>{expect(a.requestId).toBe(input.requestId);expect((await ledger())[0].state).toBe('reserved');order.push('save');})};
    const operation=vi.fn(async()=>{order.push('provider');return 'synthetic';});
    expect(await withAiBudget(input,operation,()=>({prompt_tokens:1,completion_tokens:0}),hooks)).toBe('synthetic');
    expect(order).toEqual(['bind','provider','save']);expect((await ledger())[0].state).toBe('settled');
    await expect(withAiBudget(input,operation,()=>undefined,hooks)).rejects.toMatchObject({code:'duplicate_request'});
    expect(operation).toHaveBeenCalledTimes(1);expect(hooks.beforeDispatch).toHaveBeenCalledTimes(1);expect(hooks.afterResponse).toHaveBeenCalledTimes(1);
  });
  it.each(['before','after'])('masks callback failures in %s hook and retains funds',async phase=>{
    const operation=vi.fn(async()=> 'synthetic'),fail=async()=>{throw new AiBudgetError('budget_exceeded');};
    await expect(withAiBudget(request(),operation,()=>({prompt_tokens:1,completion_tokens:0}),{
      beforeDispatch:phase==='before'?fail:async()=>{},afterResponse:phase==='after'?fail:async()=>{},
    })).rejects.toMatchObject({code:'budget_unavailable'});
    expect(operation).toHaveBeenCalledTimes(phase==='before'?0:1);expect((await ledger())[0].state).toBe('unknown');
  });
  it('does not call hooks or HTTP when budget admission is denied',async()=>{
    await query('UPDATE ai_budget_policies SET enabled=0 WHERE scope_key=?',[`merchant:${owner.merchantId}`]);
    const fetch=transport();expect((await triggerPatternAnalysis(owner.merchantId)).status).toBe('failed');
    expect(fetch).not.toHaveBeenCalled();expect(await ledger()).toHaveLength(0);expect((await job()).ai_reservation_key).toBeNull();expect((await job()).state).toBe('reserved');
  });
  it('admits one transport across five competing attempts for the same learning claim',async()=>{
    const c=await claim(),operation=vi.fn(async()=>response());
    const outcomes=await Promise.allSettled(Array.from({length:5},()=>withAiBudget(request(),operation,()=>({prompt_tokens:1,completion_tokens:0}),{
      beforeDispatch:a=>bindLearningProviderAttempt(c,a),afterResponse:async(r,a)=>{await storeLearningResponse(c,r,a);},
    })));
    expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(operation).toHaveBeenCalledTimes(1);
    expect((await ledger()).filter((r:any)=>r.state==='unknown')).toHaveLength(4);expect((await job()).state).toBe('responded');
    await recover();
  });
  it('retains a valid response without usage and keeps the budget unknown',async()=>{
    const c=await claim();await withAiBudget(request(),async()=>response(),()=>undefined,{
      beforeDispatch:a=>bindLearningProviderAttempt(c,a),afterResponse:async(r,a)=>{await storeLearningResponse(c,r,a);},
    });
    expect((await ledger())[0].state).toBe('unknown');expect((await job()).state).toBe('responded');await recover();
  });
  it('does not run the response hook after an ambiguous provider failure',async()=>{
    const c=await claim(),save=vi.fn();
    await expect(withAiBudget(request(),async()=>{throw Error('synthetic timeout');},()=>undefined,{
      beforeDispatch:a=>bindLearningProviderAttempt(c,a),afterResponse:save,
    })).rejects.toThrow('synthetic timeout');
    await recordLearningProviderFailure(c,Error('synthetic timeout'));
    expect(save).not.toHaveBeenCalled();expect((await job()).state).toBe('uncertain');expect((await ledger())[0].state).toBe('unknown');
    expect((await resumeLearningAnalysis(owner.merchantId)).status).toBe('blocked');
  });
  it.each(['responded','applied'])('acknowledges an identical normalized response in %s without changing job metadata',async state=>{
    const c=await claim(),a=await attempt();await bindLearningProviderAttempt(c,a);const result=await storeLearningResponse(c,response(),a);
    if(state==='applied')await recover();
    const before=await job();
    expect(await saveLearningProviderResponse(c,'```json\n'+JSON.stringify(JSON.parse(response()),null,2)+'\n```',a)).toEqual(result);
    expect(await job()).toEqual(before);
  });
  it.each(['responded','applied'])('rejects a different result in %s and preserves the accepted response',async state=>{
    const c=await claim(),a=await attempt();await bindLearningProviderAttempt(c,a);await storeLearningResponse(c,response(),a);if(state==='applied')await recover();
    const before=await job(),changed=JSON.parse(response());changed.updates[0].insight='A different result';
    await expect(saveLearningProviderResponse(c,JSON.stringify(changed),a)).rejects.toThrow('storage not confirmed');expect(await job()).toEqual(before);
    await expect(saveLearningProviderResponse(c,'invalid private payload',a)).rejects.toThrow('storage not confirmed');expect(await job()).toEqual(before);
  });
  it.each(['requestId','scopeKey','model','reservationKey'])('does not bypass attempt %s validation on a saved response',async field=>{
    const c=await claim(),a=await attempt();await bindLearningProviderAttempt(c,a);await storeLearningResponse(c,response(),a);const before=await job();
    await expect(saveLearningProviderResponse(c,response(),{...a,[field]:field==='reservationKey'?'b'.repeat(64):'forged'})).rejects.toThrow('storage not confirmed');expect(await job()).toEqual(before);
  });
  it('does not turn a stale owner into an acknowledgement of a replacement job',async()=>{
    const c=await claim(),a=await attempt();await bindLearningProviderAttempt(c,a);await storeLearningResponse(c,response(),a);
    await query('UPDATE ai_learning_analysis_jobs SET claim_token=? WHERE merchant_id=?',[randomUUID(),owner.merchantId]);const before=await job();
    expect(await saveLearningProviderResponse(c,response(),a)).toBeNull();expect(await job()).toEqual(before);
  });
  it('invalidates source changes between a committed save and its retry',async()=>{
    const fetch=transport();await responseFault('after',1,'ECONNRESET',async()=>{
      await query('UPDATE sari_learning_signals SET customer_message=? WHERE merchant_id=?',['Updated source',owner.merchantId]);
    });
    expect((await triggerPatternAnalysis(owner.merchantId)).status).toBe('failed');expect((await job()).state).toBe('stale');
    expect(await query('SELECT id FROM ai_learning_proposals WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);expect(fetch).toHaveBeenCalledTimes(1);expect((await ledger())[0].state).toBe('settled');
  });
  it('does not overwrite a new claim installed during the retry wait',async()=>{
    const fetch=transport(),token=randomUUID();await responseFault('after',1,'ECONNRESET',async()=>{
      await query('UPDATE ai_learning_analysis_jobs SET claim_token=? WHERE merchant_id=?',[token,owner.merchantId]);
    });
    expect((await triggerPatternAnalysis(owner.merchantId)).status).toBe('failed');expect((await job()).claim_token).toBe(token);
    expect((await job()).state).toBe('responded');expect(fetch).toHaveBeenCalledTimes(1);expect(config.notify).not.toHaveBeenCalled();
  });
  it('does not repeat projection or notification when the recovery worker wins before the retry',async()=>{
    const fetch=transport();await responseFault('after',1,'ECONNRESET',recover);
    expect((await triggerPatternAnalysis(owner.merchantId)).status).toBe('not_applied');
    expect(fetch).toHaveBeenCalledTimes(1);expect((await job()).state).toBe('applied');expect((await ledger())[0].state).toBe('settled');
    expect(await query('SELECT id FROM ai_learning_proposals WHERE merchant_id=?',[owner.merchantId])).toHaveLength(1);expect(config.notify).not.toHaveBeenCalled();
  });
  it('rejects a corrupted saved payload instead of acknowledging it by its stored hash alone',async()=>{
    const c=await claim(),a=await attempt();await bindLearningProviderAttempt(c,a);await storeLearningResponse(c,response(),a);
    await query('UPDATE ai_learning_analysis_jobs SET response_json=? WHERE merchant_id=?',['{}',owner.merchantId]);
    expect(await saveLearningProviderResponse(c,response(),a)).toBeNull();expect((await job()).state).toBe('invalid');
  });
  it('keeps an active recovery lease and schedule unchanged on duplicate acknowledgement',async()=>{
    const c=await claim(),a=await attempt();await bindLearningProviderAttempt(c,a);await storeLearningResponse(c,response(),a);
    await query(`UPDATE ai_learning_analysis_jobs SET recovery_token=?,recovery_lease_until=TIMESTAMPADD(MINUTE,3,UTC_TIMESTAMP(3)),
      recovery_next_at=TIMESTAMPADD(MINUTE,3,UTC_TIMESTAMP(3)),recovery_attempts=2,recovery_last_error='projection_unavailable' WHERE merchant_id=?`,[randomUUID(),owner.merchantId]);
    const before=await job();expect(await saveLearningProviderResponse(c,response(),a)).not.toBeNull();expect(await job()).toEqual(before);
  });
  it('allows concurrent identical saves without changing a previously scheduled response',async()=>{
    const c=await claim(),a=await attempt();await bindLearningProviderAttempt(c,a);const results=await Promise.all(Array.from({length:5},()=>saveLearningProviderResponse(c,response(),a)));
    expect(results.every(r=>r!==null)).toBe(true);expect((await job()).state).toBe('responded');
    expect(await query('SELECT id FROM ai_learning_proposals WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);await recover();
  });
  it('recovers from a real MySQL lock wait timeout after the competing transaction releases',async()=>{
    const c=await claim(),a=await attempt();await bindLearningProviderAttempt(c,a);
    const pool=(await getPool())!,get=pool.getConnection.bind(pool),blocker=await get();let held=true,observed=0;
    await blocker.beginTransaction();await blocker.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[owner.merchantId]);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const connection=await get();return new Proxy(connection,{get(t,k){
      if(k==='execute')return async(...args:any[])=>{
        if(!String(args[0]).includes('SELECT id FROM merchants WHERE id=? FOR UPDATE'))return(t.execute as any)(...args);
        const [[previous]]=await t.query<any[]>('SELECT @@SESSION.innodb_lock_wait_timeout AS timeout');
        await t.query('SET SESSION innodb_lock_wait_timeout=1');
        try{return await(t.execute as any)(...args);}
        catch(error){if((error as any).code==='ER_LOCK_WAIT_TIMEOUT'){observed++;await blocker.rollback();held=false;}throw error;}
        finally{await t.query('SET SESSION innodb_lock_wait_timeout=?',[previous.timeout]);}
      };
      const value=(t as any)[k];return typeof value==='function'?value.bind(t):value;
    }})as any;});
    try{expect(await saveLearningProviderResponse(c,response(),a)).not.toBeNull();expect(observed).toBe(1);expect((await job()).state).toBe('responded');}
    finally{if(held)await blocker.rollback();blocker.release();}
  });
});
