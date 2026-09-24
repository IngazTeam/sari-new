import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {spawn} from 'node:child_process';
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {snapshotLearningSignals} from './learning-analysis-contract';
import {claimLearningAnalysis,dispatchLearningAnalysis,storeLearningResponse,resumeLearningAnalysis} from './learning-analysis-jobs';
import {persistLearningAnalysis} from './learning-analysis';
import {claimLearningRecoveries,recoverClaimedLearningAnalysis,runLearningRecoveryBatch,getLearningAnalysisStatus} from './learning-analysis-recovery';
const mocks=vi.hoisted(()=>({provider:vi.fn(),notify:vi.fn(),digest:vi.fn()}));
vi.mock('./openai',()=>({callGPT4:mocks.provider}));vi.mock('../_core/notificationService',()=>({sendNotification:mocks.notify}));vi.mock('./smart-escalation',()=>({sendKnowledgeGapDigest:mocks.digest}));
import {triggerPatternAnalysis} from './learning-engine';

describe.skipIf(!process.env.DATABASE_URL)('saved learning result autonomous recovery on MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,users:number[];
  const query=async(sql:string,args:any[]=[]):Promise<any>=>(await(await getPool())!.execute(sql,args))[0];
  beforeEach(async()=>{vi.clearAllMocks();owner=await createDisposableMerchant('learning-recovery');users=[owner.userId];});
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants(users);});afterAll(closeDb);
  async function fixture(merchantId=owner.merchantId){
    const c=(await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000178')",[merchantId])).insertId;
    const id=(await query("INSERT INTO sari_learning_signals (merchant_id,conversation_id,signal_type,customer_message) VALUES (?,?,'price_objection','Synthetic recovery source')",[merchantId,c])).insertId;
    const s=snapshotLearningSignals(merchantId,await query('SELECT * FROM sari_learning_signals WHERE id=?',[id]));
    const claimed=await claimLearningAnalysis(s);if(claimed.status!=='claimed')throw Error('fixture claim missing');
    await dispatchLearningAnalysis(claimed.claim);
    const analysis=await storeLearningResponse(claimed.claim,JSON.stringify({updates:[],knowledge_gaps:[],no_pattern_reason:'Not enough independent evidence'}));
    if(!analysis)throw Error('fixture response missing');return{s,claim:claimed.claim,analysis,id,c};
  }
  const job=async(merchantId=owner.merchantId)=>(await query('SELECT * FROM ai_learning_analysis_jobs WHERE merchant_id=?',[merchantId]))[0];
  const due=async(merchantId=owner.merchantId)=>query('UPDATE ai_learning_analysis_jobs SET recovery_next_at=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE merchant_id=?',[merchantId]);
  const untouched=async()=>expect((await query('SELECT analyzed FROM sari_learning_signals WHERE merchant_id=?',[owner.merchantId])).every((r:any)=>r.analyzed===0)).toBe(true);
  it('leaves a grace period for foreground projection, then recovers without a new message, model or notification',async()=>{
    await fixture();expect(await claimLearningRecoveries()).toEqual([]);await due();
    expect(await runLearningRecoveryBatch()).toEqual({claimed:1,applied:1,skipped:0,deferred:0});
    expect(await job()).toMatchObject({state:'applied',proposal_count:0,response_json:null,recovery_token:null,recovery_next_at:null});
    expect((await job()).recovered_at).not.toBeNull();expect(mocks.provider).not.toHaveBeenCalled();expect(mocks.notify).not.toHaveBeenCalled();expect(mocks.digest).not.toHaveBeenCalled();
  });
  it('claims one response across competing workers and applies it at most once',async()=>{
    await fixture();await due();const claims=(await Promise.all(Array.from({length:6},()=>claimLearningRecoveries()))).flat();expect(claims).toHaveLength(1);
    const outcomes=await Promise.all([recoverClaimedLearningAnalysis(claims[0]),recoverClaimedLearningAnalysis(claims[0])]);
    expect(outcomes.sort()).toEqual(['applied','skipped']);expect((await job()).recovery_attempts).toBe(1);
  });
  it('reclaims a crashed worker after lease expiry and fences the former owner before projection',async()=>{
    await fixture();await due();const [old]=await claimLearningRecoveries();
    const ready=await resumeLearningAnalysis(owner.merchantId,old);if(ready.status!=='responded')throw Error('missing result');
    await query('UPDATE ai_learning_analysis_jobs SET recovery_lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE merchant_id=?',[owner.merchantId]);await due();
    const [current]=await claimLearningRecoveries();expect(current.token).not.toBe(old.token);
    expect((await persistLearningAnalysis(ready.snapshot,ready.analysis,ready.claim)).status).toBe('stale');await untouched();
    expect(await recoverClaimedLearningAnalysis(old)).toBe('skipped');expect(await recoverClaimedLearningAnalysis(current)).toBe('applied');
  });
  it.each(['reserved','dispatched','uncertain','applied','stale','invalid'])('never schedules %s jobs, even when due',async state=>{
    await fixture();await query('UPDATE ai_learning_analysis_jobs SET state=? WHERE merchant_id=?',[state,owner.merchantId]);await due();
    expect(await runLearningRecoveryBatch()).toEqual({claimed:0,applied:0,skipped:0,deferred:0});expect(mocks.provider).not.toHaveBeenCalled();
  });
  it.each(['deleted','edited','consumed','moved'])('discards a saved response with %s sources and clears its retry schedule',async mode=>{
    const f=await fixture();await due();
    if(mode==='deleted')await query('DELETE FROM sari_learning_signals WHERE id=?',[f.id]);
    if(mode==='edited')await query("UPDATE sari_learning_signals SET customer_message='Changed' WHERE id=?",[f.id]);
    if(mode==='consumed')await query('UPDATE sari_learning_signals SET analyzed=1 WHERE id=?',[f.id]);
    if(mode==='moved'){const other=await createDisposableMerchant('recovery-other');users.push(other.userId);await query('UPDATE conversations SET merchantId=? WHERE id=?',[other.merchantId,f.c]);}
    expect((await runLearningRecoveryBatch()).skipped).toBe(1);expect(await job()).toMatchObject({state:'stale',response_json:null,recovery_token:null,recovery_next_at:null});
  });
  it('rejects corrupt saved responses without repeatedly retrying them',async()=>{
    await fixture();await due();await query("UPDATE ai_learning_analysis_jobs SET response_hash=REPEAT('0',64) WHERE merchant_id=?",[owner.merchantId]);
    await runLearningRecoveryBatch();expect(await job()).toMatchObject({state:'invalid',response_json:null,recovery_next_at:null});expect(await claimLearningRecoveries()).toEqual([]);await untouched();
  });
  async function faultProjection(merchantId:number,afterCommit=false){
    const pool=(await getPool())!,get=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();let projection=false;return new Proxy(c,{get(t,k){
      if(k==='execute')return async(...args:any[])=>{const sql=String(args[0]);if(sql.includes('UPDATE sari_learning_signals SET analyzed=1')&&args[1][0]===merchantId){projection=true;if(!afterCommit)throw Error('private SQL credential');}return(t.execute as any)(...args);};
      if(k==='commit')return async()=>{await t.commit();if(projection&&afterCommit)throw Error('commit acknowledgement lost');};
      const v=(t as any)[k];return typeof v==='function'?v.bind(t):v;
    }}) as any;});
  }
  it('backs off a failed projection durably, preserves its response and does not starve the next merchant',async()=>{
    await fixture();await due();const other=await createDisposableMerchant('recovery-other');users.push(other.userId);await fixture(other.merchantId);await due(other.merchantId);
    await faultProjection(owner.merchantId);const result=await runLearningRecoveryBatch();
    expect(result).toEqual({claimed:2,applied:1,skipped:0,deferred:1});expect(await job()).toMatchObject({state:'responded',recovery_last_error:'projection_unavailable',recovery_token:null});
    expect((await job()).response_json).not.toBeNull();expect(JSON.stringify(await job())).not.toContain('private');expect(await claimLearningRecoveries()).toEqual([]);await untouched();
    vi.restoreAllMocks();await due();expect((await runLearningRecoveryBatch()).applied).toBe(1);
  });
  it('caps backoff at an hour for persistent errors',async()=>{
    await fixture();await due();await query('UPDATE ai_learning_analysis_jobs SET recovery_attempts=1000 WHERE merchant_id=?',[owner.merchantId]);await faultProjection(owner.merchantId);await runLearningRecoveryBatch();
    const [row]=await query('SELECT TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(3),recovery_next_at) AS delay_seconds FROM ai_learning_analysis_jobs WHERE merchant_id=?',[owner.merchantId]);expect(row.delay_seconds).toBeGreaterThan(3590);expect(row.delay_seconds).toBeLessThanOrEqual(3600);
  });
  it('does not reschedule or duplicate a committed projection when its acknowledgement is lost',async()=>{
    await fixture();await due();await faultProjection(owner.merchantId,true);expect((await runLearningRecoveryBatch()).skipped).toBe(1);vi.restoreAllMocks();
    expect(await job()).toMatchObject({state:'applied',recovery_token:null,recovery_next_at:null,response_json:null});expect((await runLearningRecoveryBatch()).claimed).toBe(0);
  });
  it('does not let an old claim apply or postpone a newer analysis',async()=>{
    const f=await fixture();await due();const [old]=await claimLearningRecoveries();await persistLearningAnalysis(f.s,f.analysis,f.claim);
    await fixture();await due();const current=await job();expect(await recoverClaimedLearningAnalysis(old)).toBe('skipped');
    const after=await job();expect(after.claim_token).toBe(current.claim_token);expect(after.recovery_next_at).toEqual(current.recovery_next_at);expect(after.state).toBe('responded');
  });
  it.each(['merchantId','token','claimToken','digest'])('rejects a forged recovery %s',async field=>{
    await fixture();await due();const [claim]=await claimLearningRecoveries();const forged={...claim};
    if(field==='merchantId'){const other=await createDisposableMerchant('recovery-other');users.push(other.userId);forged.merchantId=other.merchantId;}else(forged as any)[field]='forged';
    expect(await recoverClaimedLearningAnalysis(forged)).toBe('skipped');await untouched();
  });
  it('bounds batch size and leaves remaining merchants eligible',async()=>{
    for(let i=0;i<3;i++){const other=await createDisposableMerchant('recovery-batch');users.push(other.userId);await fixture(other.merchantId);await due(other.merchantId);}
    expect(await claimLearningRecoveries(2)).toHaveLength(2);expect(await claimLearningRecoveries(2)).toHaveLength(1);
    await expect(claimLearningRecoveries(21)).rejects.toThrow('batch size');
  });
  it('shares the claim across three independent Node processes',async()=>{
    await fixture();await due();
    const script=`import {assertDisposableDatabase} from './server/tests/helpers/disposable-merchant.ts';assertDisposableDatabase();const {runLearningRecoveryBatch}=await import('./server/ai/learning-analysis-recovery.ts');const {closeDb}=await import('./server/db/connection.ts');try{console.log('RESULT:'+JSON.stringify(await runLearningRecoveryBatch()));}finally{await closeDb();}`;
    const worker=()=>new Promise<any>((resolve,reject)=>{const c=spawn(process.execPath,['--import','tsx','--input-type=module','-e',script],{env:process.env,windowsHide:true});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',reject);c.on('exit',code=>{const line=out.split(/\r?\n/).find(s=>s.startsWith('RESULT:'));if(code!==0||!line)return reject(Error(err||'No result'));resolve(JSON.parse(line.slice(7)));});});
    const results=await Promise.all([worker(),worker(),worker()]);expect(results.reduce((n,r)=>n+r.claimed,0)).toBe(1);expect(results.reduce((n,r)=>n+r.applied,0)).toBe(1);
  },20000);
  it('returns only the current merchant operational metadata without exposing response or tokens',async()=>{
    await fixture();const other=await createDisposableMerchant('recovery-status');users.push(other.userId);
    expect((await getLearningAnalysisStatus(other.merchantId)).state).toBe('idle');const status=await getLearningAnalysisStatus(owner.merchantId);
    expect(Object.keys(status).sort()).toEqual(['state','updatedAt','nextAttemptAt','recoveryAttempts','proposalCount'].sort());expect(status.state).toBe('saved');
    expect(JSON.stringify(status)).not.toContain('Not enough');expect(JSON.stringify(status)).not.toContain((await job()).claim_token);
  });
  it.each([['reserved','preparing'],['dispatched','awaiting_result'],['uncertain','uncertain'],['applied','applied'],['stale','stale'],['invalid','invalid']])('maps stored %s to truthful status %s',async(stored,expected)=>{
    await fixture();await query('UPDATE ai_learning_analysis_jobs SET state=? WHERE merchant_id=?',[stored,owner.merchantId]);expect((await getLearningAnalysisStatus(owner.merchantId)).state).toBe(expected);
  });
  it('distinguishes budget deferral, active recovery and scheduled retry',async()=>{
    await fixture();await query("UPDATE ai_learning_analysis_jobs SET state='reserved',failure_code='budget_admission_denied' WHERE merchant_id=?",[owner.merchantId]);expect((await getLearningAnalysisStatus(owner.merchantId)).state).toBe('budget_wait');
    await query("UPDATE ai_learning_analysis_jobs SET state='responded' WHERE merchant_id=?",[owner.merchantId]);await due();const [claim]=await claimLearningRecoveries();expect((await getLearningAnalysisStatus(owner.merchantId)).state).toBe('recovering');
    await faultProjection(owner.merchantId);await recoverClaimedLearningAnalysis(claim);expect((await getLearningAnalysisStatus(owner.merchantId)).state).toBe('retry_scheduled');
  });
  it('does not claim analysis started below the actual ten-signal threshold',async()=>{
    const c=(await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000188')",[owner.merchantId])).insertId;
    for(let i=0;i<7;i++)await query("INSERT INTO sari_learning_signals (merchant_id,conversation_id,signal_type) VALUES (?,?,'price_objection')",[owner.merchantId,c]);
    expect(await triggerPatternAnalysis(owner.merchantId)).toEqual({status:'insufficient_signals',signalCount:7});expect(mocks.provider).not.toHaveBeenCalled();expect(await job()).toBeUndefined();
  });
});
