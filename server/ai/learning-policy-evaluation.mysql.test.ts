import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { getPool,closeDb } from '../db/connection';
import { createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { upsertDNA } from '../db/learning';
import { attachLearningEvidence } from './learning-evidence';
import { getLearningPolicyReview,recordLearningPolicyReview } from './learning-policy-review';
import { learningPolicyReviewSuite,learningPolicyReviewSuiteDigest } from './learning-policy-review-contract';
import { createLearningPolicyCandidate,getLearningPolicyCandidate } from './learning-policy-candidates';
import { startLearningPolicyEvaluation,getLearningPolicyEvaluation,advanceLearningPolicyEvaluation,cancelLearningPolicyEvaluation } from './learning-policy-evaluation';
import { clearZahyPiRuntimeConfigCache } from './zahypi-client';
import { resolveSariTaskType } from './task-catalog';
import { runAiSettlementBatch } from './budget-settlement';
import { getLearningPolicyOutputReview, recordLearningPolicyOutputReview } from './learning-policy-output-review';
import { outputReviewRubricDigest } from './learning-policy-output-review-contract';
import * as settings from '../db_ai_settings';
const config=vi.hoisted(()=>({provider:'openai' as 'openai'|'zahypi',enabled:true,model:'',actualModel:'fixture-snapshot',finish:'stop',usage:true}));
vi.mock('../db_ai_settings',()=>({getOpenAiApiKey:async()=>'synthetic-key',getActiveModel:async()=>config.model,logAiUsage:async()=>{},estimateCost:()=>0,
  getZahyPiRuntimeConfig:async()=>({enabled:config.enabled,provider:config.provider,model:config.model,apiKey:'synthetic-key',baseUrl:'https://api.zahypi.test/v1',projectId:'sari',source:'database'}),
  getZahyPiRuntimeMetadata:async()=>({enabled:config.enabled,provider:config.provider,model:config.model,baseUrl:'https://api.zahypi.test/v1',projectId:'sari',source:'database'})}));
describe.skipIf(!process.env.DATABASE_URL)('durable evaluation through real adapters and budget on MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,users:number[],proposalId:number,candidateId:number,artifactDigest:string,signalId:number,initialModel:string;
  const query=async(sql:string,args:any[]=[]):Promise<any>=>(await (await getPool())!.execute(sql,args))[0];
  const input=()=>({candidateId,artifactDigest,requestId:randomUUID()});
  const start=(value=input())=>startLearningPolicyEvaluation(owner.merchantId,owner.userId,value);
  const get=(runId:number)=>getLearningPolicyEvaluation(owner.merchantId,{runId});
  const advance=(runId:number,expectedOrdinal=0)=>advanceLearningPolicyEvaluation(owner.merchantId,{runId,expectedOrdinal});
  const ledger=()=>query('SELECT * FROM ai_usage_reservations WHERE scope_key=?',[`merchant:${owner.merchantId}`]);
  beforeEach(async()=>{
    owner=await createDisposableMerchant('policy-eval');users=[owner.userId];config.provider='openai';config.enabled=true;
    initialModel=config.model=`eval-fixture-${randomUUID()}`;config.actualModel='fixture-snapshot';config.finish='stop';config.usage=true;clearZahyPiRuntimeConfigCache();
    vi.stubEnv('ZAHYPI_ALLOWED_ORIGINS','https://api.zahypi.test');
    const subscription=(await query("INSERT INTO merchant_subscriptions (merchant_id,status,billing_cycle,start_date,end_date,trial_ends_at) VALUES (?,'trial','monthly',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY))",[owner.merchantId])).insertId;
    await query('UPDATE merchants SET current_subscription_id=? WHERE id=?',[subscription,owner.merchantId]);
    await query("INSERT INTO ai_budget_policies (scope_key,version,daily_limit_micro_usd,enabled) VALUES (?,'fixture',100000000,1)",[`merchant:${owner.merchantId}`]);
    for(const provider of ['openai','zahypi'])await query("INSERT INTO ai_price_cards (provider,model,version,input_micro_usd_per_million,output_micro_usd_per_million,flat_micro_usd,max_input_tokens,enabled) VALUES (?,?,'eval-fixture',1,1,1,1000000,1)",[provider,config.model]);
    const conversationId=(await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000286')",[owner.merchantId])).insertId;
    signalId=(await query("INSERT INTO sari_learning_signals (merchant_id,conversation_id,signal_type,customer_message) VALUES (?,?,'price_objection','Private synthetic source')",[owner.merchantId,conversationId])).insertId;
    const proposal={merchantId:owner.merchantId,generation:1,dimension:'objection_handling' as const,insight:'Explain relevant value first',evidenceCount:1,confidence:0.7};
    await upsertDNA(proposal);proposalId=Number((await query('SELECT id FROM ai_learning_proposals WHERE merchant_id=?',[owner.merchantId]))[0].id);
    await attachLearningEvidence({...proposal,observedSignalIds:[signalId]});const source=await getLearningPolicyReview(owner.merchantId,{proposalId});
    await recordLearningPolicyReview(owner.merchantId,owner.userId,{proposalId,requestId:randomUUID(),sourceDigest:source.sourceDigest,suiteDigest:learningPolicyReviewSuiteDigest,expectedRevision:0,styleOnly:true,
      cases:learningPolicyReviewSuite.cases.map(c=>({caseId:c.id as any,baselineResponse:'Baseline',candidateResponse:'Candidate',baselineVerdict:'pass',candidateVerdict:'pass',reason:'Synthetic human assessment for the fixture.'}))});
    const basis=await getLearningPolicyCandidate(owner.merchantId,{proposalId}),candidate=await createLearningPolicyCandidate(owner.merchantId,owner.userId,{proposalId,reviewId:basis.reviewId!,sourceDigest:basis.sourceDigest,baselineDigest:basis.baselineDigest,expectedVersion:0,requestId:randomUUID()});
    candidateId=candidate.id;artifactDigest=candidate.artifactDigest;
    transport();
  });
  afterEach(async()=>{
    vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();clearZahyPiRuntimeConfigCache();
    for(const p of await query('SELECT * FROM ai_budget_periods WHERE scope_key=?',[`merchant:${owner.merchantId}`]))
      await query("UPDATE ai_budget_periods SET reserved_micro_usd=reserved_micro_usd-?,spent_micro_usd=spent_micro_usd-? WHERE scope_key='global' AND period_start=?",[p.reserved_micro_usd,p.spent_micro_usd,p.period_start]);
    for(const table of ['ai_usage_reservations','ai_budget_periods','ai_budget_policies'])await query(`DELETE FROM ${table} WHERE scope_key=?`,[`merchant:${owner.merchantId}`]);
    await query('DELETE FROM ai_price_cards WHERE model=?',[initialModel]);await cleanupDisposableMerchants(users);
  });afterAll(closeDb);
  function transport(){
    const mock=vi.fn(async(_url:any,init:any)=>{
      expect(init.method).toBe('POST');const h=init.headers as Record<string,string>;
      const [sample]=await query("SELECT s.* FROM ai_learning_policy_evaluation_samples s JOIN ai_learning_policy_evaluations e ON e.id=s.run_id WHERE e.merchant_id=? AND s.state='dispatching'",[owner.merchantId]);
      const reservation=(await ledger()).find((r:any)=>r.reservation_key===sample.reservation_key);expect(reservation).toBeTruthy();
      expect(h['X-Client-Request-Id']??h['X-Trace-Id']).toBe(reservation.request_id);expect(reservation.state).toBe('reserved');
      const content=`Synthetic reply for ${sample.case_id} ${sample.arm}`,usage={prompt_tokens:5,completion_tokens:7,total_tokens:12};
      if(config.provider==='openai')return Response.json({id:`chatcmpl-${sample.ordinal}`,model:config.actualModel,system_fingerprint:'fp-fixture',choices:[{message:{content},finish_reason:config.finish}],...(config.usage?{usage}:{})});
      const contract=resolveSariTaskType('sari.reply');return Response.json({job_id:randomUUID(),status:'completed',project_id:'sari',tenant_id:h['X-ZahyPi-Tenant'],task_type:'sari.reply',trace_id:h['X-Trace-Id'],
        run_manifest_id:randomUUID(),route:config.actualModel,usage,structured_output:{...contract.sampleOutput,traceId:h['X-Trace-Id'],applicationResponse:content}});
    });vi.stubGlobal('fetch',mock);return mock;
  }
  it.each(['openai','zahypi'] as const)('generates all 64 paired outputs through %s with persisted usage and no automatic approval',async provider=>{
    config.provider=provider;clearZahyPiRuntimeConfigCache();const before=await query('SELECT * FROM ai_learning_proposals WHERE id=?',[proposalId]),run=await start();
    let view=await get(run.runId);expect(view.samples).toHaveLength(64);expect(fetch).not.toHaveBeenCalled();
    for(let ordinal=0;ordinal<64;ordinal++)view=await advance(run.runId,ordinal);
    expect(view).toMatchObject({state:'completed',completedSamples:64,assessment:'not_assessed',activationAllowed:false,observedModel:'fixture-snapshot'});
    expect(fetch).toHaveBeenCalledTimes(64);expect(await ledger()).toHaveLength(64);
    for(const s of view.samples){expect(s.state).toBe('responded');expect(s.cost).toMatchObject({state:'settled',heldMicroUsd:0,priceVersion:'eval-fixture'});expect(s.metadata.usage).toEqual({prompt_tokens:5,completion_tokens:7});}
    expect(JSON.stringify(view)).not.toContain('synthetic-key');expect(JSON.stringify(view)).not.toContain('Private synthetic source');
    expect(await query('SELECT * FROM ai_learning_proposals WHERE id=?',[proposalId])).toEqual(before);
    await advance(run.runId,0);expect(fetch).toHaveBeenCalledTimes(64);
    const packet=await getLearningPolicyOutputReview(owner.merchantId,{runId:run.runId});
    expect(packet.pairs).toHaveLength(32);
    const reviewed=await recordLearningPolicyOutputReview(owner.merchantId,owner.userId,{runId:run.runId,requestId:randomUUID(),runDigest:packet.runDigest!,
      rubricDigest:outputReviewRubricDigest,expectedRevision:0,reviewedAllOutputs:true,cases:packet.pairs.map(pair=>({caseId:pair.caseId,
        baseline:{verdict:'pass',quote:pair.baseline.response,reason:'Synthetic human judgment for the stored provider fixture.'},
        candidate:{verdict:'pass',quote:pair.candidate.response,reason:'Synthetic human judgment for the stored provider fixture.'},preference:'tie'}))});
    expect(reviewed).toMatchObject({outcome:'inconclusive',ties:32,activationAllowed:false});
    expect(await get(run.runId)).toMatchObject({assessment:'human_review_recorded',outputReview:{id:reviewed.id}});
    expect(fetch).toHaveBeenCalledTimes(64);expect(await query('SELECT * FROM ai_learning_proposals WHERE id=?',[proposalId])).toEqual(before);
  },30000);
  it('deduplicates run creation, rejects changed identity and allows only one active run',async()=>{
    const request=input(),runs=await Promise.all(Array.from({length:4},()=>start(request)));expect(new Set(runs.map(r=>r.runId)).size).toBe(1);
    await expect(start()).rejects.toThrow();await expect(start({...request,artifactDigest:'b'.repeat(64)})).rejects.toThrow();
    const other=await createDisposableMerchant('eval-actor');users.push(other.userId);await expect(startLearningPolicyEvaluation(owner.merchantId,other.userId,request)).rejects.toThrow();
    config.enabled=false;expect(await start({...request,requestId:request.requestId.toUpperCase()})).toMatchObject({reused:true});expect(fetch).not.toHaveBeenCalled();
  });
  it('deduplicates concurrent and delayed replay of the same sample ordinal',async()=>{
    const run=await start();await Promise.all(Array.from({length:5},()=>advance(run.runId)));await advance(run.runId);
    expect(fetch).toHaveBeenCalledOnce();expect((await get(run.runId)).completedSamples).toBe(1);await expect(advance(run.runId,3)).rejects.toThrow();expect(fetch).toHaveBeenCalledOnce();
  });
  it('lists runs on the candidate so a restarted administrative session can inspect and cancel them',async()=>{
    const run=await start();expect((await getLearningPolicyCandidate(owner.merchantId,{proposalId})).evaluationRuns).toEqual([
      expect.objectContaining({runId:run.runId,candidateId,state:'running',assessment:'not_assessed',activationAllowed:false})]);
    await cancelLearningPolicyEvaluation(owner.merchantId,{runId:run.runId});
    expect((await getLearningPolicyCandidate(owner.merchantId,{proposalId})).evaluationRuns[0].state).toBe('cancelled');
  });
  it('rechecks the administrator stop after budget reservation but before HTTP',async()=>{
    const run=await start(),original=settings.getZahyPiRuntimeMetadata;let calls=0;
    vi.spyOn(settings,'getZahyPiRuntimeMetadata').mockImplementation(async()=>{if(++calls===2)config.enabled=false;return original();});
    const result=await advance(run.runId);expect(result.state).toBe('halted');expect(fetch).not.toHaveBeenCalled();
    expect(await ledger()).toHaveLength(1);expect((await ledger())[0].state).toBe('unknown');
  });
  it('retains a historical in-flight answer but blocks the next sample after source drift',async()=>{
    const run=await start(),original=vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async(...args)=>{await query("UPDATE sari_learning_signals SET customer_message='changed in flight' WHERE id=?",[signalId]);return original(...args);});
    expect((await advance(run.runId)).samples[0].state).toBe('responded');await expect(advance(run.runId,1)).rejects.toThrow();expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(['provider','model','disabled','source','artifact','recipe','input'])('blocks %s drift before transport',async mode=>{
    const run=await start();if(mode==='provider')config.provider='zahypi';if(mode==='model')config.model+='-changed';if(mode==='disabled')config.enabled=false;
    if(mode==='source')await query("UPDATE sari_learning_signals SET customer_message='changed' WHERE id=?",[signalId]);
    if(mode==='artifact')await query('UPDATE ai_learning_policy_candidates SET artifact_digest=? WHERE id=?',['c'.repeat(64),candidateId]);
    if(mode==='recipe')await query("UPDATE ai_learning_policy_evaluations SET recipe=JSON_SET(recipe,'$.maxTokens',999999) WHERE id=?",[run.runId]);
    if(mode==='input')await query('UPDATE ai_learning_policy_evaluation_samples SET input_digest=? WHERE run_id=? AND ordinal=0',['c'.repeat(64),run.runId]);
    await expect(advance(run.runId)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();expect(await ledger()).toHaveLength(0);
  });
  it.each(['price_required','budget_exceeded'] as const)('halts on %s without HTTP',async reason=>{
    const run=await start();if(reason==='price_required')await query('DELETE FROM ai_price_cards WHERE model=?',[config.model]);
    else await query('UPDATE ai_budget_policies SET daily_limit_micro_usd=0 WHERE scope_key=?',[`merchant:${owner.merchantId}`]);
    const result=await advance(run.runId);expect(result).toMatchObject({state:'halted',completedSamples:0});expect(result.samples[0]).toMatchObject({state:'blocked',failureCode:reason});
    expect(fetch).not.toHaveBeenCalled();await advance(run.runId);expect(fetch).not.toHaveBeenCalled();
  });
  it('halts uncertainty after HTTP failure and never repeats an accepted or possibly billed request',async()=>{
    const run=await start(),mock=vi.fn(async()=>{throw Error('private upstream details');});vi.stubGlobal('fetch',mock);
    expect(await advance(run.runId)).toMatchObject({state:'halted',samples:[expect.objectContaining({state:'uncertain',failureCode:'generation_unavailable'}),...Array.from({length:63},()=>expect.anything())]});
    await advance(run.runId);expect(mock).toHaveBeenCalledOnce();expect((await ledger())[0].state).toBe('unknown');
    expect(JSON.stringify(await get(run.runId))).not.toContain('private upstream');
  });
  it('does not replay a dead process dispatch after its lease expires',async()=>{
    const run=await start();await query("UPDATE ai_learning_policy_evaluation_samples SET state='dispatching',claim_token=?,lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE run_id=? AND ordinal=0",[randomUUID(),run.runId]);
    const result=await advance(run.runId);expect(result.state).toBe('halted');expect(result.samples[0].state).toBe('uncertain');expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['length','missing usage','model drift'])('keeps but does not accept %s output',async mode=>{
    const run=await start();if(mode==='model drift'){await advance(run.runId);config.actualModel='another-snapshot';}else if(mode==='length')config.finish='length';else config.usage=false;
    const ordinal=mode==='model drift'?1:0,result=await advance(run.runId,ordinal);expect(result.state).toBe('halted');
    expect(result.samples[ordinal]).toMatchObject({state:'invalid',failureCode:'invalid_or_inconsistent_completion'});expect(result.samples[ordinal].response).toContain('Synthetic reply');
    expect(result.assessment).toBe('not_assessed');
  });
  it('cancels future dispatches, retains a late paid answer, and permits a new explicit run',async()=>{
    const run=await start(),original=vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async(...args)=>{await cancelLearningPolicyEvaluation(owner.merchantId,{runId:run.runId});return original(...args);});
    const result=await advance(run.runId);expect(result.state).toBe('cancelled');expect(result.completedSamples).toBe(1);
    await advance(run.runId,1);expect(fetch).toHaveBeenCalledOnce();expect((await start()).runId).not.toBe(run.runId);
  });
  it('isolates all run operations and candidate creation across merchants',async()=>{
    const run=await start(),other=await createDisposableMerchant('eval-foreign');users.push(other.userId);
    await expect(startLearningPolicyEvaluation(other.merchantId,other.userId,input())).rejects.toThrow();
    await expect(getLearningPolicyEvaluation(other.merchantId,{runId:run.runId})).rejects.toThrow();
    await expect(advanceLearningPolicyEvaluation(other.merchantId,{runId:run.runId,expectedOrdinal:0})).rejects.toThrow();
    await expect(cancelLearningPolicyEvaluation(other.merchantId,{runId:run.runId})).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
  });
  function failCommit(phase:'save'|'settle'|'start'|'dispatch'|'bind',when:'before'|'after'){
    return (async()=>{const pool=(await getPool())!,getConnection=pool.getConnection.bind(pool);vi.spyOn(pool,'getConnection').mockImplementation(async()=>{
      const c=await getConnection();let matched=false;return new Proxy(c,{get(target,key){
        if(key==='execute')return async(...args:any[])=>{const sql=String(args[0]);
          const marker={save:'response_text=?',settle:"SET state = 'settled'",start:'INSERT INTO ai_learning_policy_evaluations',dispatch:"SET state='dispatching'",bind:'SET reservation_key=?'}[phase];
          if(sql.includes(marker))matched=true;return (target.execute as any)(...args);};
        if(key==='commit')return async()=>{if(matched&&when==='before')throw Error('lost save acknowledgment');await target.commit();if(matched&&when==='after')throw Error('lost save acknowledgment');};
        const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;
      }}) as any;});})();
  }
  it.each(['before','after'] as const)('recovers run creation commit lost %s persistence without duplicating samples',async when=>{
    const request=input();await failCommit('start',when);await expect(start(request)).rejects.toThrow();vi.restoreAllMocks();
    const result=await start(request);expect(result.reused).toBe(when==='after');expect((await get(result.runId)).samples).toHaveLength(64);expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['before','after'] as const)('does not dispatch after claim acknowledgement fails %s persistence',async when=>{
    const run=await start();await failCommit('dispatch',when);await expect(advance(run.runId)).rejects.toThrow();vi.restoreAllMocks();expect(fetch).not.toHaveBeenCalled();
    const result=await advance(run.runId);expect(result.completedSamples).toBe(when==='before'?1:0);expect(fetch).toHaveBeenCalledTimes(when==='before'?1:0);
  });
  it.each(['before','after'] as const)('does not send HTTP when budget binding acknowledgement fails %s persistence',async when=>{
    const run=await start();await failCommit('bind',when);const result=await advance(run.runId);vi.restoreAllMocks();
    expect(result.state).toBe('halted');expect(fetch).not.toHaveBeenCalled();expect((await ledger())[0].state).toBe('unknown');
    expect(result.samples[0].state).toBe(when==='before'?'blocked':'uncertain');
  });
  it.each(['before','after'] as const)('preserves dispatch safety when response commit fails %s persistence',async when=>{
    const run=await start();await failCommit('save',when);await advance(run.runId);vi.restoreAllMocks();
    const view=await get(run.runId);expect(view.samples[0].state).toBe(when==='before'?'uncertain':'responded');
    await advance(run.runId,0);expect(fetch).toHaveBeenCalledOnce();expect(await ledger()).toHaveLength(1);
  });
  it('preserves an answer through settlement failure and recovers cost without another generation',async()=>{
    const run=await start();await failCommit('settle','before');const result=await advance(run.runId);vi.restoreAllMocks();
    expect(result.samples[0].state).toBe('responded');expect((await ledger())[0].state).toBe('unknown');
    await query('UPDATE ai_usage_reservations SET settlement_next_at=UTC_TIMESTAMP(3) WHERE scope_key=?',[`merchant:${owner.merchantId}`]);
    await runAiSettlementBatch();expect((await get(run.runId)).samples[0].cost!.state).toBe('settled');await advance(run.runId);expect(fetch).toHaveBeenCalledOnce();
  });
  it('detects stored response corruption before exposing it as evaluation evidence',async()=>{
    const run=await start();await advance(run.runId);await query("UPDATE ai_learning_policy_evaluation_samples SET response_text='tampered' WHERE run_id=? AND ordinal=0",[run.runId]);
    await expect(get(run.runId)).rejects.toThrow('changed');
  });
});
