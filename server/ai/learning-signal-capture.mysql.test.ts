import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {spawn} from 'node:child_process';
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {captureSignal,captureSignals} from '../db/learning';
import {captureConversationSignals} from './learning-engine';
import {stageInteraction,finishInteractionDelivery,runInteractionJob} from './interaction-jobs';
import {buildReplyPlan} from '../messaging/reply-plan';
const model=vi.hoisted(()=>vi.fn());vi.mock('./openai',()=>({callGPT4:model}));
describe.skipIf(!process.env.DATABASE_URL)('transactional learning source admission on MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,conversation:number,users:number[];
  const query=async(sql:string,args:any[]=[]):Promise<any>=>(await(await getPool())!.execute(sql,args))[0];
  beforeEach(async()=>{vi.clearAllMocks();owner=await createDisposableMerchant('signal-admission');users=[owner.userId];conversation=(await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000199')",[owner.merchantId])).insertId;});
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants(users);});afterAll(closeDb);
  const input=(sourceKey='message:1')=>({merchantId:owner.merchantId,conversationId:conversation,signalType:'price_objection' as const,signalWeight:1,customerMessage:'Synthetic objection',sourceKey,strict:true});
  const signals=()=>query('SELECT * FROM sari_learning_signals WHERE merchant_id=? ORDER BY id',[owner.merchantId]);
  async function fill(count:number){if(!count)return;await query(`INSERT INTO sari_learning_signals (merchant_id,conversation_id,signal_type,analyzed,source_key) VALUES ${Array.from({length:count},()=>"(?,?,'price_objection',1,?)").join(',')}`,Array.from({length:count},(_,i)=>[owner.merchantId,conversation,`seed:${i}`]).flat());}
  async function foreign(){const other=await createDisposableMerchant('signal-other');users.push(other.userId);return{...other,conversationId:(await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000198')",[other.merchantId])).insertId};}
  it('commits every detected signal from one accepted message with the correct preceding reply',async()=>{
    await captureConversationSignals({merchantId:owner.merchantId,conversationId:conversation,customerMessage:'شكرا ولكن السعر غالي',botResponse:'ما عندي معلومات',previousBotResponse:'السعر الحالي',sourceKey:'message:batch',strict:true});
    const rows=await signals();expect(rows.map((r:any)=>r.signal_type).sort()).toEqual(['knowledge_gap','positive_feedback','price_objection']);
    expect(rows.find((r:any)=>r.signal_type==='price_objection').bot_message).toBe('السعر الحالي');expect(rows.find((r:any)=>r.signal_type==='knowledge_gap').bot_message).toBe('ما عندي معلومات');expect(model).not.toHaveBeenCalled();
  });
  it('replays identical keyed evidence without changing analyzed or timestamps',async()=>{
    await captureSignal(input());await query('UPDATE sari_learning_signals SET analyzed=1 WHERE merchant_id=?',[owner.merchantId]);const before=await signals();await captureSignal(input());expect(await signals()).toEqual(before);
  });
  it('checks an existing event before the full daily quota',async()=>{
    await fill(499);await captureSignal(input());await captureSignal(input());expect(await signals()).toHaveLength(500);
    await expect(captureSignal(input('new'))).rejects.toMatchObject({code:'daily_limit'});expect(await signals()).toHaveLength(500);
  });
  it('admits only one of eight concurrent candidates at the daily boundary',async()=>{
    await fill(499);const results=await Promise.allSettled(Array.from({length:8},(_,i)=>captureSignal(input(`race:${i}`))));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected').every(r=>r.status==='rejected'&&r.reason.code==='daily_limit')).toBe(true);expect(await signals()).toHaveLength(500);
  });
  it('shares quota and event identity across three independent worker processes',async()=>{
    await fill(499);const worker=(key:string)=>new Promise<string>((resolve,reject)=>{
      const script=`import {assertDisposableDatabase} from './server/tests/helpers/disposable-merchant.ts';assertDisposableDatabase();const {captureSignal}=await import('./server/db/learning.ts');const {closeDb}=await import('./server/db/connection.ts');try{await captureSignal(${JSON.stringify(input(key))});console.log('RESULT:admitted');}catch(e){console.log('RESULT:'+e.code);}finally{await closeDb();}`;
      const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',script],{env:process.env,windowsHide:true});let out='';child.stdout.on('data',b=>out+=b);child.on('error',reject);child.on('exit',code=>{const result=out.split(/\r?\n/).find(s=>s.startsWith('RESULT:'));if(code||!result)return reject(Error('Admission worker failed'));resolve(result.slice(7));});
    });
    const results=await Promise.all(['one','two','three'].map(worker));expect(results.filter(r=>r==='admitted')).toHaveLength(1);expect(results.filter(r=>r==='daily_limit')).toHaveLength(2);expect(await signals()).toHaveLength(500);
  },20000);
  it('deduplicates concurrent identical replays and duplicates within the same batch',async()=>{
    await Promise.all(Array.from({length:6},()=>captureSignals([input(),input()])));expect(await signals()).toHaveLength(1);
  });
  it.each(['customerMessage','botMessage','merchantCorrection','contextSummary','signalWeight','conversationId','sourceKey'])('rejects changed %s behind the same event identity',async field=>{
    await captureSignal(input());const changed:any={...input(),[field]:field==='signalWeight'?2:'changed'};
    if(field==='conversationId')changed.conversationId=(await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000197')",[owner.merchantId])).insertId;
    if(field==='sourceKey')changed.sourceKey='MESSAGE:1';
    await expect(captureSignal(changed)).rejects.toMatchObject({code:'source_conflict'});expect(await signals()).toHaveLength(1);expect((await signals())[0].customer_message).toBe('Synthetic objection');
  });
  it('allows independent signal types and distinct tenant ownership for the same source string',async()=>{
    await captureSignals([input(),{...input(),signalType:'positive_feedback'}]);const other=await foreign();
    await captureSignal({...input(),merchantId:other.merchantId,conversationId:other.conversationId});expect(await signals()).toHaveLength(2);
  });
  it('rolls back the whole batch if only one quota slot remains',async()=>{
    await fill(499);await expect(captureSignals([input(),{...input(),signalType:'positive_feedback'}])).rejects.toMatchObject({code:'daily_limit'});expect(await signals()).toHaveLength(499);
  });
  it('rolls back a new event when a later event conflicts',async()=>{
    await captureSignal(input());await expect(captureSignals([input('new'),{...input(),customerMessage:'changed'}])).rejects.toMatchObject({code:'source_conflict'});expect(await signals()).toHaveLength(1);
  });
  it('rejects foreign or reassigned conversation ownership even on a replay',async()=>{
    const other=await foreign();await expect(captureSignal({...input(),conversationId:other.conversationId})).rejects.toMatchObject({code:'ownership'});
    await captureSignal(input());await query('UPDATE conversations SET merchantId=? WHERE id=?',[other.merchantId,conversation]);await expect(captureSignal(input())).rejects.toMatchObject({code:'ownership'});
  });
  it('keeps independent merchants available when one merchant reaches its cap',async()=>{
    await fill(500);const other=await foreign();await captureSignal({...input(),merchantId:other.merchantId,conversationId:other.conversationId});await expect(captureSignal(input())).rejects.toMatchObject({code:'daily_limit'});
  });
  it('uses the current UTC day and does not count prior-day or future rows',async()=>{
    await fill(500);await query('UPDATE sari_learning_signals SET created_at=TIMESTAMPADD(DAY,-1,UTC_DATE()) WHERE merchant_id=?',[owner.merchantId]);await captureSignal(input());
    await query("UPDATE sari_learning_signals SET created_at=TIMESTAMPADD(DAY,1,UTC_DATE()) WHERE source_key='message:1' AND merchant_id=?",[owner.merchantId]);await captureSignal(input('today'));expect(await signals()).toHaveLength(502);
  });
  it('preserves normalized text boundaries on a replay',async()=>{
    const long={...input(),customerMessage:'x'.repeat(2100),contextSummary:'y'.repeat(600)};await captureSignal(long);await captureSignal(long);const [row]=await signals();expect(row.customer_message).toHaveLength(2000);expect(row.context_summary).toHaveLength(500);
  });
  async function fault(mode:'count'|'insert'|'commit'){
    const pool=(await getPool())!,get=pool.getConnection.bind(pool);let inserts=0;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();return new Proxy(c,{get(t,k){
      if(k==='execute')return async(...args:any[])=>{if(mode==='count'&&String(args[0]).includes('created_at>=UTC_DATE()'))throw Error('private customer and SQL password');
        if(mode==='insert'&&String(args[0]).includes('INSERT INTO sari_learning_signals')&&++inserts===2)throw Error('private source');return(t.execute as any)(...args);};
      if(k==='commit'&&mode==='commit')return async()=>{await t.commit();throw Error('lost acknowledgement with private source');};
      const v=(t as any)[k];return typeof v==='function'?v.bind(t):v;}}) as any;});
  }
  it.each(['count','insert'] as const)('fails closed and redacts a %s failure without partial evidence',async mode=>{
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});await fault(mode);await expect(captureSignals([input(),input('second')])).rejects.toMatchObject({code:'storage_unavailable'});
    expect(await signals()).toHaveLength(0);expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  });
  it('recovers a lost commit acknowledgement by replaying the same identity without duplication',async()=>{
    await fault('commit');await expect(captureSignal(input())).rejects.toMatchObject({code:'storage_unavailable'});vi.restoreAllMocks();await captureSignal(input());expect(await signals()).toHaveLength(1);
  });
  it('preserves best-effort compatibility without exposing a storage failure',async()=>{
    await fault('count');await expect(captureSignal({...input(),strict:false})).resolves.toBeUndefined();expect(await signals()).toHaveLength(0);
  });
  async function interaction(){
    const id=(await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','شكرا ولكن السعر غالي')",[conversation])).insertId;
    const plan=buildReplyPlan({merchantId:owner.merchantId,instanceId:1,providerAccount:'fixture',eventId:`admission:${id}`,conversationId:conversation,incomingMessageId:id,to:'966500000199',text:'أوضح لك المزايا'});
    await stageInteraction(plan);await finishInteractionDelivery(plan,true);return id;
  }
  it.each([0,7])('defers a durable interaction to next UTC day preserving %i prior failed attempts and atomic signals',async attempts=>{
    await fill(499);await interaction();await query('UPDATE ai_interaction_jobs SET attempts=? WHERE merchant_id=?',[attempts,owner.merchantId]);await runInteractionJob();const [job]=await query("SELECT *,available_at=TIMESTAMPADD(DAY,1,UTC_DATE()) AS next_day FROM ai_interaction_jobs WHERE merchant_id=?",[owner.merchantId]);
    expect(job).toMatchObject({state:'pending',attempts,last_error:'learning_daily_limit',lease_token:null,lease_until:null,next_day:1});expect(await signals()).toHaveLength(499);expect(model).not.toHaveBeenCalled();expect(await runInteractionJob()).toBe(false);
  });
  it('resumes a deferred source on a later admission window and completes it once',async()=>{
    await fill(500);await interaction();await runInteractionJob();await query('UPDATE sari_learning_signals SET created_at=TIMESTAMPADD(DAY,-1,UTC_DATE()) WHERE merchant_id=?',[owner.merchantId]);
    await query('UPDATE ai_interaction_jobs SET available_at=UTC_TIMESTAMP(3) WHERE merchant_id=?',[owner.merchantId]);await runInteractionJob();expect((await query('SELECT state,attempts FROM ai_interaction_jobs WHERE merchant_id=?',[owner.merchantId]))[0]).toMatchObject({state:'completed',attempts:1});expect(await signals()).toHaveLength(502);expect(model).not.toHaveBeenCalled();
  });
  it.each(['expired','replaced'])('does not let an %s worker postpone the current interaction owner',async mode=>{
    await fill(500);await interaction();const pool=(await getPool())!,get=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();return new Proxy(c,{get(t,k){
      if(k==='execute')return async(...args:any[])=>{if(String(args[0]).includes('created_at>=UTC_DATE()'))await query(mode==='expired'
        ?'UPDATE ai_interaction_jobs SET lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE merchant_id=?'
        :"UPDATE ai_interaction_jobs SET lease_token='new-owner' WHERE merchant_id=?",[owner.merchantId]);return(t.execute as any)(...args);};
      const v=(t as any)[k];return typeof v==='function'?v.bind(t):v;}}) as any;});
    await runInteractionJob();const [job]=await query('SELECT * FROM ai_interaction_jobs WHERE merchant_id=?',[owner.merchantId]);expect(job.state).toBe('processing');expect(job.attempts).toBe(1);expect(job.last_error).toBeNull();if(mode==='replaced')expect(job.lease_token).toBe('new-owner');expect(await signals()).toHaveLength(500);
  });
});
