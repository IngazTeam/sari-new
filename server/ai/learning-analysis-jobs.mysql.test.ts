import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { snapshotLearningSignals } from './learning-analysis-contract';
import { claimLearningAnalysis, dispatchLearningAnalysis, storeLearningResponse, resumeLearningAnalysis,
  markLearningDispatchUncertain, type LearningAnalysisClaim } from './learning-analysis-jobs';
import { recordLearningProviderFailure } from './learning-analysis-jobs';
import { AiBudgetError } from './budget-ledger';
import { persistLearningAnalysis } from './learning-analysis';
const provider = vi.hoisted(()=>({ call:vi.fn(),notify:vi.fn(),digest:vi.fn() }));
vi.mock('./openai',()=>({ callGPT4:provider.call }));
vi.mock('../_core/notificationService',()=>({ sendNotification:provider.notify }));
vi.mock('./smart-escalation',()=>({ sendKnowledgeGapDigest:provider.digest }));
import { triggerPatternAnalysis } from './learning-engine';

describe.skipIf(!process.env.DATABASE_URL)('durable learning dispatch and recovery on MySQL',()=>{
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, userIds:number[], conversationId:number, ids:number[];
  const query=async(sql:string,args:any[]=[]):Promise<any> => (await (await getPool())!.execute(sql,args))[0];
  const snapshot=async()=>snapshotLearningSignals(owner.merchantId,await query('SELECT * FROM sari_learning_signals WHERE merchant_id=? ORDER BY id',[owner.merchantId]));
  const response=()=>JSON.stringify({ updates:[{dimension:'objection_handling',insight:'Explain relevant value',confidence:0.7,supporting_signal_ids:ids.slice(0,3),contrary_signal_ids:[]}],knowledge_gaps:[] });
  const job=async()=> (await query('SELECT * FROM ai_learning_analysis_jobs WHERE merchant_id=?',[owner.merchantId]))[0];
  beforeEach(async()=>{
    vi.clearAllMocks();provider.digest.mockResolvedValue(undefined);provider.notify.mockResolvedValue(undefined);
    owner=await createDisposableMerchant('learning-jobs');userIds=[owner.userId];ids=[];
    conversationId=(await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000177')",[owner.merchantId])).insertId;
    for(let i=0;i<4;i++)ids.push((await query(`INSERT INTO sari_learning_signals (merchant_id,conversation_id,signal_type,customer_message)
      VALUES (?,?,'price_objection','Synthetic source')`,[owner.merchantId,conversationId])).insertId);
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants(userIds);});afterAll(closeDb);
  async function reserve(){const s=await snapshot(),result=await claimLearningAnalysis(s);if(result.status!=='claimed')throw Error('Missing fixture claim');return {s,claim:result.claim};}
  async function saved(){const r=await reserve();expect(await dispatchLearningAnalysis(r.claim)).toBe(true);const analysis=await storeLearningResponse(r.claim,response());if(!analysis)throw Error('Missing fixture response');return {...r,analysis};}
  async function untouched(){expect(await query('SELECT id FROM ai_learning_proposals WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);
    expect((await query('SELECT analyzed FROM sari_learning_signals WHERE merchant_id=?',[owner.merchantId])).every((r:any)=>!r.analyzed)).toBe(true);}
  it('admits one reservation and dispatch across concurrent workers',async()=>{
    const s=await snapshot(),results=await Promise.all(Array.from({length:6},()=>claimLearningAnalysis(s)));
    const claims=results.filter(r=>r.status==='claimed');expect(claims).toHaveLength(1);
    if(claims[0].status!=='claimed')throw Error('missing claim');
    const dispatched=await Promise.all(Array.from({length:6},()=>dispatchLearningAnalysis(claims[0].claim)));
    expect(dispatched.filter(Boolean)).toHaveLength(1);expect((await job()).state).toBe('dispatched');
  });
  it('blocks a different overlapping sample while a provider request is outstanding',async()=>{
    const {s,claim}=await reserve();await dispatchLearningAnalysis(claim);
    expect((await claimLearningAnalysis(snapshotLearningSignals(owner.merchantId,s.signals.slice(1)))).status).toBe('blocked');
    expect((await resumeLearningAnalysis(owner.merchantId)).status).toBe('blocked');
  });
  it('reclaims only an expired reservation and fences its previous owner',async()=>{
    const {s,claim}=await reserve();await query('UPDATE ai_learning_analysis_jobs SET lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE merchant_id=?',[owner.merchantId]);
    const next=await claimLearningAnalysis(s);expect(next.status).toBe('claimed');if(next.status!=='claimed')return;
    expect(next.claim.token).not.toBe(claim.token);expect(await dispatchLearningAnalysis(claim)).toBe(false);
    expect(await storeLearningResponse(claim,response())).toBeNull();expect(await dispatchLearningAnalysis(next.claim)).toBe(true);
  });
  it('never reclaims dispatched work even after a long outage',async()=>{
    const {s,claim}=await reserve();await dispatchLearningAnalysis(claim);
    await query('UPDATE ai_learning_analysis_jobs SET lease_until=TIMESTAMPADD(DAY,-7,UTC_TIMESTAMP(3)),updated_at=TIMESTAMPADD(DAY,-7,UTC_TIMESTAMP(3)) WHERE merchant_id=?',[owner.merchantId]);
    expect((await claimLearningAnalysis(s)).status).toBe('blocked');await markLearningDispatchUncertain(claim);
    expect((await job()).state).toBe('uncertain');expect((await claimLearningAnalysis(s)).status).toBe('blocked');
  });
  it('accepts a late response from the same uncertain dispatch without repeating the call',async()=>{
    const {claim}=await reserve();await dispatchLearningAnalysis(claim);await markLearningDispatchUncertain(claim);
    expect(await storeLearningResponse(claim,response())).not.toBeNull();expect((await resumeLearningAnalysis(owner.merchantId)).status).toBe('responded');
  });
  it.each(['token','merchant','digest'])('rejects forged %s on dispatch and response',async field=>{
    const {claim}=await reserve();const forged={...claim};
    if(field==='merchant'){const other=await createDisposableMerchant('learning-other');userIds.push(other.userId);forged.merchantId=other.merchantId;}
    else if(field==='token')forged.token='00000000-0000-0000-0000-000000000000';else forged.digest='0'.repeat(64);
    expect(await dispatchLearningAnalysis(forged)).toBe(false);expect(await storeLearningResponse(forged,response())).toBeNull();
    expect((await job()).state).toBe('reserved');await untouched();
  });
  it.each(['before dispatch','before saving','before recovery'])('invalidates deleted or changed sources %s',async phase=>{
    const {claim}=await reserve();if(phase!=='before dispatch')await dispatchLearningAnalysis(claim);
    if(phase==='before recovery')await storeLearningResponse(claim,response());
    await query('DELETE FROM sari_learning_signals WHERE id=?',[ids[0]]);
    if(phase==='before dispatch')expect(await dispatchLearningAnalysis(claim)).toBe(false);
    else if(phase==='before saving')expect(await storeLearningResponse(claim,response())).toBeNull();
    else expect((await resumeLearningAnalysis(owner.merchantId)).status).toBe('stale');
    expect((await job()).state).toBe('stale');expect((await job()).response_json).toBeNull();await untouched();
  });
  it('does not store raw malformed output or repeatedly pay to analyze the rejected sample',async()=>{
    const {s,claim}=await reserve();await dispatchLearningAnalysis(claim);
    expect(await storeLearningResponse(claim,'private customer data not JSON')).toBeNull();
    expect((await job()).state).toBe('invalid');expect(JSON.stringify(await job())).not.toContain('private customer data');
    expect((await claimLearningAnalysis(s)).status).toBe('blocked');await untouched();
  });
  it('recovers the original response before the signal threshold, without calling any provider',async()=>{
    await saved();await triggerPatternAnalysis(owner.merchantId);
    expect(provider.call).not.toHaveBeenCalled();expect((await job()).state).toBe('applied');
    expect((await job()).response_json).toBeNull();expect((await job()).proposal_count).toBe(1);
    expect(await query('SELECT id FROM ai_learning_proposals WHERE merchant_id=?',[owner.merchantId])).toHaveLength(1);
    expect(provider.notify).toHaveBeenCalledTimes(1);await triggerPatternAnalysis(owner.merchantId);expect(provider.notify).toHaveBeenCalledTimes(1);
  });
  it('records no-pattern completion without inventing a generation and clears response text',async()=>{
    const {s,claim}=await reserve();await dispatchLearningAnalysis(claim);
    const analysis=await storeLearningResponse(claim,JSON.stringify({updates:[],knowledge_gaps:[],no_pattern_reason:'Insufficient independent data'}));
    expect((await job()).response_json).not.toBeNull();await persistLearningAnalysis(s,analysis!,claim);
    expect(await job()).toMatchObject({state:'applied',generation:null,proposal_count:0,response_json:null});
  });
  it.each(['response','hash'])('rejects corrupted stored %s without invoking the provider',async field=>{
    await saved();await query(`UPDATE ai_learning_analysis_jobs SET ${field==='hash'?'response_hash':'response_json'}=? WHERE merchant_id=?`,
      [field==='hash'?'0'.repeat(64):'{}',owner.merchantId]);await triggerPatternAnalysis(owner.merchantId);
    expect((await job()).state).toBe('invalid');expect((await job()).response_json).toBeNull();expect(provider.call).not.toHaveBeenCalled();await untouched();
  });
  async function fault(mode:'dispatch before'|'dispatch after'|'response after'|'projection before'|'projection after'|'finish'){
    const pool=(await getPool())!,get=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();let phase='';return new Proxy(c,{get(t,k){
      if(k==='execute')return async(...args:any[])=>{const sql=String(args[0]);
        if(sql.includes("SET state='dispatched'"))phase='dispatch';
        if(sql.includes("SET state='responded'"))phase='response';
        if(sql.includes('UPDATE sari_learning_signals SET analyzed=1'))phase='projection';
        if(mode==='finish'&&sql.includes('SET state=?,generation=?'))throw Error('finish fault');
        return (t.execute as any)(...args);};
      if(k==='commit')return async()=>{if(mode===`${phase} before`)throw Error('before commit');await t.commit();if(mode===`${phase} after`)throw Error('acknowledgement lost');};
      const v=(t as any)[k];return typeof v==='function'?v.bind(t):v;
    }}) as any;});
  }
  it('allows reservation recovery when dispatch commit failed before sending',async()=>{
    const {s,claim}=await reserve();await fault('dispatch before');await expect(dispatchLearningAnalysis(claim)).rejects.toThrow('before commit');vi.restoreAllMocks();
    expect((await job()).state).toBe('reserved');await query('UPDATE ai_learning_analysis_jobs SET lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE merchant_id=?',[owner.merchantId]);
    expect((await claimLearningAnalysis(s)).status).toBe('claimed');
  });
  it('never sends after a dispatch commit acknowledgement is lost',async()=>{
    const {s,claim}=await reserve();await fault('dispatch after');await expect(dispatchLearningAnalysis(claim)).rejects.toThrow('acknowledgement');vi.restoreAllMocks();
    expect((await job()).state).toBe('dispatched');expect((await claimLearningAnalysis(s)).status).toBe('blocked');await untouched();
  });
  it('recovers a saved response when its commit acknowledgement was lost',async()=>{
    const {claim}=await reserve();await dispatchLearningAnalysis(claim);await fault('response after');
    await expect(storeLearningResponse(claim,response())).rejects.toThrow('acknowledgement');vi.restoreAllMocks();
    await triggerPatternAnalysis(owner.merchantId);expect(provider.call).not.toHaveBeenCalled();expect((await job()).state).toBe('applied');
  });
  it.each(['projection before','finish'] as const)('rolls back proposal and job completion together on %s failure, then recovers',async mode=>{
    const {s,claim,analysis}=await saved();await fault(mode);await expect(persistLearningAnalysis(s,analysis,claim)).rejects.toThrow();vi.restoreAllMocks();
    expect((await job()).state).toBe('responded');await untouched();await triggerPatternAnalysis(owner.merchantId);
    expect(provider.call).not.toHaveBeenCalled();expect((await job()).state).toBe('applied');
  });
  it('never duplicates projection or notifications after a successful commit with lost acknowledgement',async()=>{
    const {s,claim,analysis}=await saved();await fault('projection after');await expect(persistLearningAnalysis(s,analysis,claim)).rejects.toThrow('acknowledgement');vi.restoreAllMocks();
    expect((await job()).state).toBe('applied');expect((await persistLearningAnalysis(s,analysis,claim)).status).toBe('stale');
    await triggerPatternAnalysis(owner.merchantId);expect(provider.call).not.toHaveBeenCalled();expect(provider.notify).not.toHaveBeenCalled();
    expect(await query('SELECT id FROM ai_learning_proposals WHERE merchant_id=?',[owner.merchantId])).toHaveLength(1);
  });
  it('allows only one dispatch across three independent Node processes',async()=>{
    const data=JSON.stringify(await snapshot());
    const script=`import {assertDisposableDatabase} from './server/tests/helpers/disposable-merchant.ts';assertDisposableDatabase();
      const {claimLearningAnalysis,dispatchLearningAnalysis}=await import('./server/ai/learning-analysis-jobs.ts');
      const {closeDb}=await import('./server/db/connection.ts');try{const r=await claimLearningAnalysis(JSON.parse(process.argv[1]));
      console.log('RESULT:'+JSON.stringify(r.status==='claimed'&&await dispatchLearningAnalysis(r.claim)));}finally{await closeDb();}`;
    const worker=()=>new Promise<boolean>((resolve,reject)=>{const c=spawn(process.execPath,['--import','tsx','--input-type=module','-e',script,data],{env:process.env,windowsHide:true});let out='',err='';
      c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',reject);c.on('exit',code=>{const line=out.split(/\r?\n/).find(s=>s.startsWith('RESULT:'));
        if(code!==0||!line)return reject(Error(err||'Missing worker result'));resolve(JSON.parse(line.slice(7)));});});
    expect((await Promise.all([worker(),worker(),worker()])).filter(Boolean)).toHaveLength(1);
  },20000);
  it('blocks repeated real-engine calls after a provider timeout and never enables internal retries',async()=>{
    for(let i=0;i<8;i++)await query("INSERT INTO sari_learning_signals (merchant_id,conversation_id,signal_type) VALUES (?,?,'price_objection')",[owner.merchantId,conversationId]);
    provider.call.mockRejectedValue(Error('Simulated network timeout'));await triggerPatternAnalysis(owner.merchantId);await triggerPatternAnalysis(owner.merchantId);
    expect(provider.call).toHaveBeenCalledTimes(1);expect(provider.call.mock.calls[0][1]).toMatchObject({noRetry:true,merchantId:owner.merchantId,taskType:'sari.learning.pattern_analysis'});
    expect((await job()).state).toBe('uncertain');await untouched();
  });
  it('does not share a response across merchants even with a valid token',async()=>{
    const {s,claim,analysis}=await saved(),other=await createDisposableMerchant('learning-other');userIds.push(other.userId);
    await expect(persistLearningAnalysis(s,analysis,{...claim,merchantId:other.merchantId})).rejects.toThrow('scope');await untouched();
  });
  it('deletes the durable response when the merchant is deleted',async()=>{
    await saved();await cleanupDisposableMerchants(userIds);userIds=[];
    expect(await query('SELECT merchant_id FROM ai_learning_analysis_jobs WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);
  });
  it.each(['budget_exceeded','price_required','policy_required','identity_required'] as const)('defers a proven pre-transport %s rejection without permanently blocking learning',async code=>{
    const {s,claim}=await reserve();await dispatchLearningAnalysis(claim);await recordLearningProviderFailure(claim,new AiBudgetError(code));
    expect((await job()).state).toBe('reserved');expect((await job()).failure_code).toBe('budget_admission_denied');
    expect((await claimLearningAnalysis(s)).status).toBe('blocked');expect(await dispatchLearningAnalysis(claim)).toBe(false);
    await query('UPDATE ai_learning_analysis_jobs SET lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE merchant_id=?',[owner.merchantId]);
    expect((await claimLearningAnalysis(s)).status).toBe('claimed');
  });
  it.each([new AiBudgetError('budget_unavailable'),new AiBudgetError('invalid_usage'),{code:'budget_exceeded'},Error('budget_exceeded')])
   ('does not mistake ambiguous or forged budget errors for proof of no dispatch #%#',async error=>{
    const {s,claim}=await reserve();await dispatchLearningAnalysis(claim);await recordLearningProviderFailure(claim,error);
    expect((await job()).state).toBe('uncertain');expect((await claimLearningAnalysis(s)).status).toBe('blocked');
  });
  it('retires a saved result that targets a closed proposal without partially applying it or retrying the model',async()=>{
    const {s,claim,analysis}=await saved();
    const {createHash}=await import('node:crypto');
    await query(`INSERT INTO ai_learning_proposals (merchant_id,generation,dimension,insight,content_hash,evidence_count,confidence,status)
      VALUES (?,1,'objection_handling','Explain relevant value',?,0,0.7,'retired')`,[owner.merchantId,createHash('sha256').update('Explain relevant value').digest('hex')]);
    await expect(persistLearningAnalysis(s,analysis,claim)).rejects.toThrow('not open');expect((await job()).state).toBe('invalid');
    expect((await job()).response_json).toBeNull();expect((await claimLearningAnalysis(s)).status).toBe('blocked');
    expect((await query('SELECT analyzed FROM sari_learning_signals WHERE merchant_id=?',[owner.merchantId])).every((r:any)=>!r.analyzed)).toBe(true);
  });
  it('rejects duplicate canonical proposals before saving a response that cannot be projected',async()=>{
    const {claim}=await reserve();await dispatchLearningAnalysis(claim);const payload=JSON.parse(response());payload.updates.push({...payload.updates[0]});
    expect(await storeLearningResponse(claim,JSON.stringify(payload))).toBeNull();expect((await job()).state).toBe('invalid');await untouched();
  });
  it('allows a new sample after completion without retaining the prior response text',async()=>{
    const {s,claim,analysis}=await saved();await persistLearningAnalysis(s,analysis,claim);
    const id=(await query("INSERT INTO sari_learning_signals (merchant_id,conversation_id,signal_type) VALUES (?,?,'price_objection')",[owner.merchantId,conversationId])).insertId;
    const next=snapshotLearningSignals(owner.merchantId,await query('SELECT * FROM sari_learning_signals WHERE id=?',[id]));
    expect((await claimLearningAnalysis(next)).status).toBe('claimed');expect((await job()).response_json).toBeNull();expect((await job()).response_hash).toBeNull();
  });
  it('invalidates a response when its conversation changes tenant before recovery',async()=>{
    await saved();const other=await createDisposableMerchant('learning-other');userIds.push(other.userId);
    await query('UPDATE conversations SET merchantId=? WHERE id=?',[other.merchantId,conversationId]);
    expect((await resumeLearningAnalysis(owner.merchantId)).status).toBe('stale');expect((await job()).response_json).toBeNull();await untouched();
  });
});
