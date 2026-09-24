import { randomUUID } from 'node:crypto';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { AiBudgetError, settleAiBudget, type AiBudgetAttempt } from './budget-ledger';

export type AiProviderUsage = Readonly<{ prompt_tokens:number; completion_tokens:number }>;
export type AiSettlementClaim = Readonly<{ reservationKey:string; scopeKey:string; requestId:string; token:string; usage:AiProviderUsage }>;
const transientCodes = new Set(['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT','PROTOCOL_CONNECTION_LOST','ECONNRESET',
  'ECONNREFUSED','ETIMEDOUT','EPIPE','PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR','PROTOCOL_ENQUEUE_AFTER_QUIT']);
export async function assertAiSettlementSchema() {
  await assertRuntimeSchema('AI usage settlement', [{table:'ai_usage_reservations',
    columns:['usage_prompt_tokens','usage_completion_tokens','usage_received_at','settlement_token','settlement_lease_until',
      'settlement_next_at','settlement_attempts','settlement_last_error'],uniqueIndexes:[{name:'PRIMARY',columns:['reservation_key']}]}]);
}
function checkedUsage(value: AiProviderUsage): AiProviderUsage {
  const prompt=value?.prompt_tokens,completion=value?.completion_tokens;
  if (!value || ![prompt,completion].every(n=>typeof n==='number' && Number.isSafeInteger(n) && n>=0)) {
    throw new AiBudgetError('invalid_usage');
  }
  return Object.freeze({prompt_tokens:prompt,completion_tokens:completion});
}
function checkedAttempt(value: AiBudgetAttempt): AiBudgetAttempt {
  if (!value || !/^[a-f0-9]{64}$/.test(value.reservationKey)
    || !Object.entries({scopeKey:160,requestId:160,provider:40,model:128,taskType:96}).every(([k,max])=>{
      const text=value[k as keyof AiBudgetAttempt];return typeof text==='string' && text.length>0 && text.length<=max;
    })) {
    throw new AiBudgetError('reservation_conflict');
  }
  return Object.freeze({...value});
}
async function recordUsage(attempt: AiBudgetAttempt, usage: AiProviderUsage) {
  await assertAiSettlementSchema();
  const pool=await getPool();if(!pool)throw new AiBudgetError('budget_unavailable');
  const c=await pool.getConnection();
  try {
    await c.beginTransaction();
    const [rows]=await c.execute<any[]>('SELECT * FROM ai_usage_reservations WHERE reservation_key=? FOR UPDATE',[attempt.reservationKey]);
    const row=rows[0];
    if(!row || row.scope_key!==attempt.scopeKey || row.request_id!==attempt.requestId || row.provider!==attempt.provider
      || row.model!==attempt.model || row.task_type!==attempt.taskType || !['reserved','unknown','settled'].includes(row.state)) {
      throw new AiBudgetError('reservation_conflict');
    }
    if(row.usage_received_at!==null) {
      if(Number(row.usage_prompt_tokens)!==usage.prompt_tokens || Number(row.usage_completion_tokens)!==usage.completion_tokens) throw new AiBudgetError('reservation_conflict');
    } else {
      if(row.usage_prompt_tokens!==null || row.usage_completion_tokens!==null) throw new AiBudgetError('reservation_conflict');
      await c.execute(`UPDATE ai_usage_reservations SET usage_prompt_tokens=?,usage_completion_tokens=?,usage_received_at=UTC_TIMESTAMP(3),
        settlement_next_at=IF(state='settled',NULL,TIMESTAMPADD(SECOND,60,UTC_TIMESTAMP(3))) WHERE reservation_key=?`,
      [usage.prompt_tokens,usage.completion_tokens,attempt.reservationKey]);
    }
    await c.commit();return row.state==='settled';
  } catch(error) {try{await c.rollback();}catch{/* A lost acknowledgement can only repeat this immutable receipt. */}throw error;}
  finally{c.release();}
}
/** Persist usage independently of the replaceable learning slot. No response text or credential is retained. */
export async function persistAiProviderUsage(attemptValue: AiBudgetAttempt, usageValue: AiProviderUsage) {
  const attempt=checkedAttempt(attemptValue),usage=checkedUsage(usageValue),delays=[100,300];
  for(let index=0;;index++) {
    try{return await recordUsage(attempt,usage);}
    catch(error){
      const code=error instanceof Error?(error as Error & {code?:unknown}).code:undefined;
      if(index>=delays.length || typeof code!=='string' || !transientCodes.has(code)) {
        if(error instanceof AiBudgetError)throw error;
        throw new AiBudgetError('budget_unavailable');
      }
      await new Promise<void>(resolve=>setTimeout(resolve,delays[index]));
    }
  }
}
export async function settleAiProviderUsage(attemptValue: AiBudgetAttempt, usageValue: AiProviderUsage) {
  const attempt=checkedAttempt(attemptValue),usage=checkedUsage(usageValue);
  // A previously reconciled reservation is authoritative, including a different billed amount.
  if(!await persistAiProviderUsage(attempt,usage))await settleAiBudget(attempt,usage);
}
export async function claimAiSettlements(limit=20):Promise<AiSettlementClaim[]> {
  if(!Number.isSafeInteger(limit)||limit<1||limit>20)throw new AiBudgetError('invalid_usage');
  await assertAiSettlementSchema();
  const pool=await getPool();if(!pool)throw new AiBudgetError('budget_unavailable');
  const c=await pool.getConnection();
  try{
    await c.beginTransaction();
    const [rows]=await c.execute<any[]>(`SELECT reservation_key,scope_key,request_id,usage_prompt_tokens,usage_completion_tokens FROM ai_usage_reservations
      WHERE state IN ('reserved','unknown') AND usage_received_at IS NOT NULL AND settlement_next_at<=UTC_TIMESTAMP(3)
      AND (settlement_lease_until IS NULL OR settlement_lease_until<=UTC_TIMESTAMP(3))
      ORDER BY settlement_next_at,reservation_key LIMIT ${limit} FOR UPDATE SKIP LOCKED`);
    const claims:AiSettlementClaim[]=[];
    for(const row of rows){
      const token=randomUUID();
      await c.execute(`UPDATE ai_usage_reservations SET settlement_token=?,settlement_lease_until=TIMESTAMPADD(MINUTE,3,UTC_TIMESTAMP(3)),
        settlement_next_at=TIMESTAMPADD(MINUTE,3,UTC_TIMESTAMP(3)),settlement_attempts=LEAST(settlement_attempts+1,1000000) WHERE reservation_key=?`,[token,row.reservation_key]);
      claims.push({reservationKey:row.reservation_key,scopeKey:row.scope_key,requestId:row.request_id,token,
        usage:{prompt_tokens:row.usage_prompt_tokens,completion_tokens:row.usage_completion_tokens}});
    }
    await c.commit();return claims;
  }catch(error){try{await c.rollback();}catch{/* Expiry recovers a lost claim; no money was changed. */}throw error;}
  finally{c.release();}
}
export async function recoverAiSettlement(claim:AiSettlementClaim) {
  claim=Object.freeze({...claim,usage:Object.freeze({...claim.usage})});
  try {
    const usage=checkedUsage(claim.usage);
    await settleAiBudget(claim,usage,undefined,{token:claim.token,requestId:claim.requestId});
    return 'settled' as const;
  }catch{
    const pool=await getPool();if(!pool)throw new AiBudgetError('budget_unavailable');
    const [changed]=await pool.execute<any>(`UPDATE ai_usage_reservations SET settlement_token=NULL,settlement_lease_until=NULL,
      settlement_next_at=TIMESTAMPADD(SECOND,LEAST(3600,30*POW(2,LEAST(settlement_attempts,7))),UTC_TIMESTAMP(3)),
      settlement_last_error='settlement_deferred' WHERE reservation_key=? AND scope_key=? AND request_id=? AND settlement_token=?
      AND state IN ('reserved','unknown') AND settlement_lease_until>UTC_TIMESTAMP(3)`,[claim.reservationKey,claim.scopeKey,claim.requestId,claim.token]);
    return changed.affectedRows===1?'deferred' as const:'skipped' as const;
  }
}
export async function runAiSettlementBatch(){
  const claims=await claimAiSettlements(),result={claimed:claims.length,settled:0,deferred:0,skipped:0};
  for(const claim of claims){try{result[await recoverAiSettlement(claim)]++;}catch{result.deferred++;}}
  return result;
}
export async function startAiSettlementWorker(){
  await assertAiSettlementSchema();
  let stopped=false,active:Promise<unknown>|undefined;
  const tick=()=>{if(stopped||active)return;active=runAiSettlementBatch().catch(()=>console.error('[AiSettlement] Usage remains pending'))
    .finally(()=>{active=undefined;});};
  const timer=setInterval(tick,60_000);timer.unref();tick();
  return async()=>{stopped=true;clearInterval(timer);await active;};
}
