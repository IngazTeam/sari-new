import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction } from './checkout-agreements';
import { requireCurrentLearningPolicyCandidate } from './learning-policy-candidates';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { evaluationAdvanceInput, evaluationCompletion, evaluationRecipe, evaluationRunInput, evaluationSamples, evaluationStartInput } from './learning-policy-evaluation-contract';
import { getActiveModel, getZahyPiRuntimeMetadata } from '../db_ai_settings';
import { providerRouteFingerprint } from './provider-job-receipt';
import { resolveZahyPiRuntimeConfig, runWithZahyPiContext, type ZahyPiRuntimeConfig } from './zahypi-client';
import { callGPT4 } from './openai';
import { AiBudgetError, type AiBudgetAttempt, type AiCompletionMetadata } from './budget-ledger';
import { latestOutputReviewReceipt } from './learning-policy-output-review-store';

const identity=z.number().int().positive().safe(),decode=(value:any)=>typeof value==='string'?JSON.parse(value):value;
export class LearningPolicyEvaluationConflict extends Error {
  constructor(){super('Learning policy evaluation changed or is unavailable');}
}
const conflict=():never=>{throw new LearningPolicyEvaluationConflict();};
async function lockMerchant(c:PoolConnection,merchantId:number){
  const [rows]=await c.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE',[merchantId]);if(rows.length!==1)conflict();
}
async function loadRun(c:PoolConnection,merchantId:number,runId:number){
  const [rows]=await c.execute<any[]>('SELECT * FROM ai_learning_policy_evaluations WHERE id=? AND merchant_id=? FOR UPDATE',[runId,merchantId]);
  if(rows.length!==1)conflict();return rows[0];
}
function routeFor(config:Omit<ZahyPiRuntimeConfig,'apiKey'>,openaiModel:string){
  if(!config.enabled)conflict();
  const provider=config.provider,model=z.string().min(1).max(128).parse(provider==='zahypi'?config.model:openaiModel);
  return {provider,model,digest:policyArtifactDigest({provider,model,
    route:provider==='zahypi'?providerRouteFingerprint(config):'openai-chat-completions'})};
}
async function freshRoute(){return routeFor(await getZahyPiRuntimeMetadata(),await getActiveModel());}
async function receipt(c:PoolConnection,merchantId:number,row:any){
  const outputReview=await latestOutputReviewReceipt(c,merchantId,Number(row.id));
  return {runId:Number(row.id),candidateId:Number(row.candidate_id),state:row.state as 'running'|'completed'|'halted'|'cancelled',
    provider:row.provider as 'openai'|'zahypi',model:String(row.model),outputReview,
    assessment:outputReview?'human_review_recorded' as const:'not_assessed' as const,activationAllowed:false as const};
}

export async function startLearningPolicyEvaluation(merchantId:number,actorUserId:number,value:z.infer<typeof evaluationStartInput>){
  const merchant=identity.parse(merchantId),actor=identity.parse(actorUserId),input=evaluationStartInput.parse(value);
  const payloadDigest=policyArtifactDigest({actor,input});
  return checkoutTransaction(async c=>{
    await lockMerchant(c,merchant);
    const [existing]=await c.execute<any[]>('SELECT * FROM ai_learning_policy_evaluations WHERE merchant_id=? AND request_id=? FOR UPDATE',[merchant,input.requestId]);
    if(existing.length){if(existing[0].payload_digest!==payloadDigest)conflict();return {...await receipt(c,merchant,existing[0]),reused:true};}
    const bundle=await requireCurrentLearningPolicyCandidate(c,merchant,input.candidateId,input.artifactDigest);
    const [active]=await c.execute<any[]>("SELECT id FROM ai_learning_policy_evaluations WHERE merchant_id=? AND state='running' LIMIT 1 FOR UPDATE",[merchant]);
    if(active.length)conflict();
    const route=await freshRoute(),samples=evaluationSamples(bundle);
    const [saved]=await c.execute<any>(`INSERT INTO ai_learning_policy_evaluations
      (merchant_id,candidate_id,request_id,payload_digest,artifact_digest,route_digest,provider,model,recipe,actor_user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,[merchant,input.candidateId,input.requestId,payloadDigest,input.artifactDigest,route.digest,route.provider,route.model,JSON.stringify(evaluationRecipe),actor]);
    for(const sample of samples)await c.execute(`INSERT INTO ai_learning_policy_evaluation_samples (run_id,ordinal,case_id,arm,input_digest) VALUES (?,?,?,?,?)`,
      [saved.insertId,sample.ordinal,sample.caseId,sample.arm,sample.inputDigest]);
    return {...await receipt(c,merchant,{id:saved.insertId,candidate_id:input.candidateId,state:'running',...route}),reused:false};
  });
}

export async function getLearningPolicyEvaluation(merchantId:number,value:z.infer<typeof evaluationRunInput>){
  const merchant=identity.parse(merchantId),input=evaluationRunInput.parse(value);
  return checkoutTransaction(async c=>{
    await lockMerchant(c,merchant);const run=await loadRun(c,merchant,input.runId);
    const [samples]=await c.execute<any[]>(`SELECT s.*,r.state AS cost_state,r.price_version,r.reserved_micro_usd,r.settled_micro_usd
      FROM ai_learning_policy_evaluation_samples s LEFT JOIN ai_usage_reservations r
        ON r.reservation_key=s.reservation_key AND r.scope_key=?
      WHERE s.run_id=? ORDER BY s.ordinal`,[`merchant:${merchant}`,input.runId]);
    for(const s of samples)if(s.response_digest!==null&&policyArtifactDigest({text:s.response_text,metadata:s.response_metadata===null?null:decode(s.response_metadata)})!==s.response_digest)conflict();
    return {...await receipt(c,merchant,run),artifactDigest:String(run.artifact_digest),observedModel:run.observed_model as string|null,recipe:decode(run.recipe),
      completedSamples:samples.filter(s=>s.state==='responded').length,totalSamples:evaluationRecipe.totalSamples,
      samples:samples.map(s=>({ordinal:Number(s.ordinal),caseId:String(s.case_id),arm:s.arm as 'baseline'|'candidate',state:String(s.state),
        inputDigest:String(s.input_digest),response:s.response_text as string|null,metadata:s.response_metadata===null?null:decode(s.response_metadata),
        responseDigest:s.response_digest as string|null,elapsedMs:s.elapsed_ms===null?null:Number(s.elapsed_ms),failureCode:s.failure_code as string|null,
        cost:s.reservation_key===null?null:{state:(s.cost_state??'unavailable') as string,priceVersion:s.price_version as string|null,
          heldMicroUsd:s.cost_state===null?null:s.cost_state==='settled'?0:Number(s.reserved_micro_usd),settledMicroUsd:s.settled_micro_usd===null?null:Number(s.settled_micro_usd)}}))};
  });
}

export async function cancelLearningPolicyEvaluation(merchantId:number,value:z.infer<typeof evaluationRunInput>){
  const merchant=identity.parse(merchantId),input=evaluationRunInput.parse(value);
  return checkoutTransaction(async c=>{
    await lockMerchant(c,merchant);const run=await loadRun(c,merchant,input.runId);
    if(run.state==='running'){await c.execute("UPDATE ai_learning_policy_evaluations SET state='cancelled' WHERE id=?",[input.runId]);run.state='cancelled';}
    return receipt(c,merchant,run);
  });
}

type Claim={merchantId:number;runId:number;ordinal:number;token:string};
async function claimed(c:PoolConnection,claim:Claim){
  await lockMerchant(c,claim.merchantId);const run=await loadRun(c,claim.merchantId,claim.runId);
  const [samples]=await c.execute<any[]>('SELECT * FROM ai_learning_policy_evaluation_samples WHERE run_id=? AND ordinal=? FOR UPDATE',[claim.runId,claim.ordinal]);
  const sample=samples[0];if(!sample||sample.claim_token!==claim.token)conflict();return {run,sample};
}
async function assertAttempt(c:PoolConnection,claim:Claim,attempt:AiBudgetAttempt,run:any){
  if(attempt.scopeKey!==`merchant:${claim.merchantId}`||attempt.provider!==run.provider||attempt.model!==run.model||attempt.taskType!==evaluationRecipe.taskType)conflict();
  const [rows]=await c.execute<any[]>('SELECT request_id,scope_key,provider,model,task_type,state FROM ai_usage_reservations WHERE reservation_key=? FOR SHARE',[attempt.reservationKey]);
  const row=rows[0];if(!row||row.request_id!==attempt.requestId||row.scope_key!==attempt.scopeKey||row.provider!==attempt.provider
    ||row.model!==attempt.model||row.task_type!==attempt.taskType||!['reserved','unknown','settled'].includes(row.state))conflict();
}
async function bind(claim:Claim,attempt:AiBudgetAttempt){
  return checkoutTransaction(async c=>{
    const {run,sample}=await claimed(c,claim);
    if(run.state!=='running'||sample.state!=='dispatching'||sample.reservation_key!==null)conflict();
    if((await freshRoute()).digest!==run.route_digest)conflict();
    await requireCurrentLearningPolicyCandidate(c,claim.merchantId,Number(run.candidate_id),run.artifact_digest);
    await assertAttempt(c,claim,attempt,run);
    await c.execute('UPDATE ai_learning_policy_evaluation_samples SET reservation_key=? WHERE run_id=? AND ordinal=?',[attempt.reservationKey,claim.runId,claim.ordinal]);
  });
}
async function saveResponse(claim:Claim,attempt:AiBudgetAttempt,text:string,metadata:AiCompletionMetadata|undefined,elapsedMs:number){
  // Keep the original output for review, including truncation or model drift; never score it as a pass.
  const parsed=evaluationCompletion.safeParse(metadata),validText=typeof text==='string'&&text.trim().length>0&&text.length<=16000;
  const record={text:validText?text:null,metadata:parsed.success?parsed.data:null},digest=policyArtifactDigest(record);
  return checkoutTransaction(async c=>{
    const {run,sample}=await claimed(c,claim);await assertAttempt(c,claim,attempt,run);
    if(sample.reservation_key!==attempt.reservationKey)conflict();
    if(['responded','invalid'].includes(sample.state)){if(sample.response_digest!==digest)conflict();return;}
    if(!['dispatching','uncertain'].includes(sample.state))conflict();
    const consistent=parsed.success&&(!run.observed_model||run.observed_model===parsed.data.model);
    const valid=validText&&consistent&&parsed.data!.finishReason==='stop';
    if(parsed.success&&!run.observed_model)await c.execute('UPDATE ai_learning_policy_evaluations SET observed_model=? WHERE id=?',[parsed.data.model,claim.runId]);
    await c.execute(`UPDATE ai_learning_policy_evaluation_samples SET state=?,response_text=?,response_metadata=?,response_digest=?,elapsed_ms=?,
      failure_code=?,completed_at=UTC_TIMESTAMP(3),lease_until=NULL WHERE run_id=? AND ordinal=?`,
      [valid?'responded':'invalid',record.text,record.metadata?JSON.stringify(record.metadata):null,digest,Math.max(0,Math.min(2147483647,Math.trunc(elapsedMs))),
        valid?null:'invalid_or_inconsistent_completion',claim.runId,claim.ordinal]);
    if(!valid&&run.state==='running')await c.execute("UPDATE ai_learning_policy_evaluations SET state='halted' WHERE id=?",[claim.runId]);
    else if(valid&&run.state==='running'){
      const [[count]]=await c.execute<any[]>("SELECT COUNT(*) AS n FROM ai_learning_policy_evaluation_samples WHERE run_id=? AND state='responded'",[claim.runId]);
      if(Number(count.n)===evaluationRecipe.totalSamples)await c.execute("UPDATE ai_learning_policy_evaluations SET state='completed' WHERE id=?",[claim.runId]);
    }
  });
}
async function fail(claim:Claim,error:unknown){
  await checkoutTransaction(async c=>{
    const {run,sample}=await claimed(c,claim);if(sample.state!=='dispatching')return;
    const state=sample.reservation_key?'uncertain':'blocked';
    const code=error instanceof AiBudgetError&&['budget_exceeded','price_required','policy_required'].includes(error.code)?error.code:'generation_unavailable';
    await c.execute('UPDATE ai_learning_policy_evaluation_samples SET state=?,failure_code=?,lease_until=NULL WHERE run_id=? AND ordinal=?',[state,code,claim.runId,claim.ordinal]);
    if(run.state==='running')await c.execute("UPDATE ai_learning_policy_evaluations SET state='halted' WHERE id=?",[claim.runId]);
  });
}

/** One provider invocation per administrative call. A persisted dispatch is never automatically replayed. */
export async function advanceLearningPolicyEvaluation(merchantId:number,value:z.infer<typeof evaluationAdvanceInput>){
  const merchant=identity.parse(merchantId),input=evaluationAdvanceInput.parse(value);
  const work=await checkoutTransaction(async c=>{
    await lockMerchant(c,merchant);const run=await loadRun(c,merchant,input.runId);
    if(run.state!=='running')return null;
    if(policyArtifactDigest(decode(run.recipe))!==policyArtifactDigest(evaluationRecipe))conflict();
    const [active]=await c.execute<any[]>("SELECT ordinal,lease_until>UTC_TIMESTAMP(3) AS valid FROM ai_learning_policy_evaluation_samples WHERE run_id=? AND state='dispatching' FOR UPDATE",[input.runId]);
    if(active.length){
      if(!active[0].valid){await c.execute("UPDATE ai_learning_policy_evaluation_samples SET state='uncertain',failure_code='dispatch_acknowledgement_unknown',lease_until=NULL WHERE run_id=? AND state='dispatching'",[input.runId]);
        await c.execute("UPDATE ai_learning_policy_evaluations SET state='halted' WHERE id=?",[input.runId]);}
      return null;
    }
    const [pending]=await c.execute<any[]>("SELECT * FROM ai_learning_policy_evaluation_samples WHERE run_id=? AND state='queued' ORDER BY ordinal LIMIT 1 FOR UPDATE",[input.runId]);
    if(!pending.length)return null;
    if(Number(pending[0].ordinal)>input.expectedOrdinal)return null;
    if(Number(pending[0].ordinal)!==input.expectedOrdinal)conflict();
    const bundle=await requireCurrentLearningPolicyCandidate(c,merchant,Number(run.candidate_id),run.artifact_digest);
    const route=await freshRoute();if(route.digest!==run.route_digest)conflict();
    const sample=pending[0],frozen=evaluationSamples(bundle)[Number(sample.ordinal)];
    if(!frozen||frozen.caseId!==sample.case_id||frozen.arm!==sample.arm||frozen.inputDigest!==sample.input_digest)conflict();
    const claim:Claim={merchantId:merchant,runId:input.runId,ordinal:Number(sample.ordinal),token:randomUUID()};
    await c.execute("UPDATE ai_learning_policy_evaluation_samples SET state='dispatching',claim_token=?,lease_until=TIMESTAMPADD(SECOND,90,UTC_TIMESTAMP(3)) WHERE run_id=? AND ordinal=?",[claim.token,claim.runId,claim.ordinal]);
    return {claim,messages:frozen.messages,route};
  });
  if(work){
    try{
      await runWithZahyPiContext({merchantId:merchant,conversationId:`policy-eval-${work.claim.token}`,taskType:evaluationRecipe.taskType},async()=>{
        const actual=routeFor(await resolveZahyPiRuntimeConfig(undefined,{refresh:true}),await getActiveModel());
        if(actual.digest!==work.route.digest)conflict();
        const started=Date.now();
        await callGPT4(work.messages,{merchantId:merchant,model:work.route.model,taskType:'sari.reply',
          temperature:evaluationRecipe.temperature,maxTokens:evaluationRecipe.maxTokens,noRetry:true,lifecycle:{
            beforeDispatch:attempt=>bind(work.claim,attempt),
            afterResponse:(text,attempt,metadata)=>saveResponse(work.claim,attempt,text,metadata,Date.now()-started),
          }});
      });
    }catch(error){await fail(work.claim,error);}
  }
  return getLearningPolicyEvaluation(merchant,{runId:input.runId});
}
