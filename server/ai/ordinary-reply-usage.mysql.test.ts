import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const provider = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../channels/whatsapp/providers', () => ({ getWhatsAppProvider: () => provider }));
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, createDisposableTrialSubscription, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { buildReplyPlan, dispatchReplyPlan, type ReplyPlan } from '../messaging/reply-plan';
import { stageInteraction } from './interaction-jobs';
import { ordinaryReplyDigest } from './reply-reservation';
import { reconcileOrdinaryReplyUsage, runOrdinaryReplyUsageRecoveryBatch } from './ordinary-reply-usage';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import { purgeCompletedInboundPayloads } from '../messaging/retention';
import { hasReachedMessageLimit } from '../usage-tracking';
import { withInboundExecution } from '../messaging/inbound-context';

describe.skipIf(!process.env.DATABASE_URL)('ordinary reply capacity and recovery with MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  let subscriptionId: number, planId: number, instanceId: number, conversationId: number, incomingMessageId: number;
  const query = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql,args))[0];
  const usage = async () => (await query('SELECT * FROM ai_interaction_jobs WHERE merchant_id=? ORDER BY id LIMIT 1',[owner.merchantId]))[0];
  const used = async () => Number((await query('SELECT messages_used FROM merchant_subscriptions WHERE id=?',[subscriptionId]))[0]?.messages_used ?? 0);
  const plan = (extra: Partial<Parameters<typeof buildReplyPlan>[0]> = {}) => buildReplyPlan({ merchantId:owner.merchantId,instanceId,providerAccount:'fixture',
    eventId:randomUUID(),conversationId,incomingMessageId,to:'966500000982',text:'عرض مناسب للاختبار فقط',...extra });
  const guarded = (p: ReplyPlan, ordinal=0) => ({...p.effects[ordinal],replyGuard:{conversationId:p.conversationId,incomingMessageId:p.incomingMessageId,
    version:p.ownershipVersion!,reservationDigest:ordinaryReplyDigest(p)}});
  const send = async (p=plan()) => { await stageInteraction(p); return sendMerchantWhatsApp(guarded(p)); };
  const reconcile = () => reconcileOrdinaryReplyUsage(owner.merchantId,incomingMessageId);
  const unknown = () => provider.send.mockResolvedValue({accepted:false,outcome:'unknown',status:'failed',errorCode:'provider_unreachable'});
  const confirm = async (status='sent') => query("UPDATE whatsapp_message_deliveries SET status=?,provider_message_id=?,error_code=NULL WHERE merchant_id=?",[status,randomUUID(),owner.merchantId]);
  beforeEach(async()=>{
    owner=await createDisposableMerchant('ordinary-usage');other=await createDisposableMerchant('ordinary-other');
    subscriptionId=await createDisposableTrialSubscription(owner.merchantId);
    planId=Number((await query("INSERT INTO subscription_plans (name,name_en,monthly_price,yearly_price,max_customers,message_limit) VALUES ('Synthetic','Synthetic',1,10,100,2)")).insertId);
    await query("UPDATE merchant_subscriptions SET plan_id=?,status='active' WHERE id=?",[planId,subscriptionId]);
    instanceId=Number((await query("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,is_primary) VALUES (?,?,'fixture','green_api','active',1)",[owner.merchantId,randomUUID()])).insertId);
    conversationId=Number((await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,'966500000982','active')",[owner.merchantId])).insertId);
    incomingMessageId=Number((await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','استفسار')",[conversationId])).insertId);
    provider.send.mockReset().mockImplementation(async()=>({accepted:true,status:'sent',providerMessageId:randomUUID()}));
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId,other.userId]);await query('DELETE FROM subscription_plans WHERE id=?',[planId]);});
  afterAll(closeDb);
  it('holds two units before IO and charges once across duplicate dispatch and process restart',async()=>{
    const p=plan();provider.send.mockImplementation(async()=>{expect(await used()).toBe(0);expect(await usage()).toMatchObject({usage_state:'held',usage_units:2});return {accepted:true,status:'sent',providerMessageId:randomUUID()};});
    expect(await dispatchReplyPlan(p)).toBe('sent');expect(await used()).toBe(2);await closeDb();
    await Promise.all([sendMerchantWhatsApp(guarded(p)),reconcile(),reconcile()]);expect(await used()).toBe(2);expect(provider.send).toHaveBeenCalledOnce();
  });
  it.each([0,1])('blocks a complete turn with only %s available units before IO',async limit=>{
    await query('UPDATE subscription_plans SET message_limit=? WHERE id=?',[limit,planId]);
    expect(await send()).toMatchObject({accepted:false});expect(provider.send).not.toHaveBeenCalled();expect(await usage()).toMatchObject({usage_state:'pending'});expect(await used()).toBe(0);
  });
  it.each(['unlimited','trial'])('preserves %s subscription semantics',async mode=>{
    if(mode==='unlimited')await query('UPDATE subscription_plans SET message_limit=-1 WHERE id=?',[planId]);
    else await query("UPDATE merchant_subscriptions SET status='trial',plan_id=NULL WHERE id=?",[subscriptionId]);
    expect(await send()).toMatchObject({accepted:true});expect(await used()).toBe(2);
  });
  it.each(['expired','future','cancelled','wrong-pointer','negative-used','overflow','bad-limit','future-period','trial-expired'])('fails closed on %s subscription evidence',async mode=>{
    if(mode==='expired')await query('UPDATE merchant_subscriptions SET end_date=TIMESTAMPADD(DAY,-1,UTC_TIMESTAMP()) WHERE id=?',[subscriptionId]);
    if(mode==='future')await query('UPDATE merchant_subscriptions SET start_date=TIMESTAMPADD(DAY,1,UTC_TIMESTAMP()) WHERE id=?',[subscriptionId]);
    if(mode==='cancelled')await query("UPDATE merchant_subscriptions SET status='cancelled' WHERE id=?",[subscriptionId]);
    if(mode==='wrong-pointer'){const otherSub=await createDisposableTrialSubscription(other.merchantId);await query('UPDATE merchants SET current_subscription_id=? WHERE id=?',[otherSub,owner.merchantId]);}
    if(mode==='negative-used'||mode==='overflow')await query('UPDATE merchant_subscriptions SET messages_used=? WHERE id=?',[mode==='overflow'?2147483646:-1,subscriptionId]);
    if(mode==='bad-limit')await query('UPDATE subscription_plans SET message_limit=-2 WHERE id=?',[planId]);
    if(mode==='future-period')await query('UPDATE merchant_subscriptions SET last_reset_at=TIMESTAMPADD(DAY,1,UTC_TIMESTAMP()) WHERE id=?',[subscriptionId]);
    if(mode==='trial-expired')await query("UPDATE merchant_subscriptions SET status='trial',trial_ends_at=TIMESTAMPADD(DAY,-1,UTC_TIMESTAMP()) WHERE id=?",[subscriptionId]);
    expect(await send()).toMatchObject({accepted:false});expect(provider.send).not.toHaveBeenCalled();expect((await usage()).usage_state).toBe('pending');
  });
  it('serializes distinct conversations competing for the final turn',async()=>{
    unknown();const p=plan();const conv=Number((await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,'966500000982','active')",[owner.merchantId])).insertId);
    const msg=Number((await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','آخر')",[conv])).insertId);
    await Promise.allSettled([dispatchReplyPlan(p),dispatchReplyPlan(plan({conversationId:conv,incomingMessageId:msg}))]);
    expect(provider.send).toHaveBeenCalledOnce();expect(await used()).toBe(0);
    const rows=await query("SELECT usage_state FROM ai_interaction_jobs WHERE merchant_id=? ORDER BY usage_state",[owner.merchantId]);
    expect(rows.map((r:any)=>r.usage_state)).toEqual(['held','pending']);
  });
  it('counts welcome, split text and media as one turn without blocking its later parts at the quota limit',async()=>{
    const p=plan({welcome:'مرحبا',text:'س'.repeat(5000),media:[{type:'image',url:'https://example.test/image.jpg'}]});
    expect(await dispatchReplyPlan(p)).toBe('sent');expect(provider.send).toHaveBeenCalledTimes(4);expect(await used()).toBe(2);
  });
  it.each(['unknown','rejected'])('does not send later parts after first-part %s',async mode=>{
    if(mode==='unknown')unknown();else provider.send.mockResolvedValue({accepted:false,outcome:'rejected',status:'failed',errorCode:'http_400'});
    const p=plan({welcome:'مرحبا'});await expect(dispatchReplyPlan(p)).rejects.toThrow('delivery review');
    expect(await sendMerchantWhatsApp(guarded(p,1))).toMatchObject({accepted:false});expect(provider.send).toHaveBeenCalledOnce();expect(await used()).toBe(0);
    expect((await usage()).usage_state).toBe(mode==='unknown'?'held':'released');
  });
  it('charges a partially accepted turn once even if a later media part is rejected',async()=>{
    provider.send.mockResolvedValueOnce({accepted:true,status:'sent',providerMessageId:randomUUID()}).mockResolvedValueOnce({accepted:false,status:'failed',errorCode:'http_400'});
    await expect(dispatchReplyPlan(plan({media:[{type:'image',url:'https://example.test/a.jpg'}]}))).rejects.toThrow('delivery review');
    expect(await used()).toBe(2);expect((await usage()).state).toBe('waiting_delivery');expect((await usage()).usage_state).toBe('charged');
  });
  it.each(['http_400','http_429','invalid_request','configuration_missing','unsupported_template'])('releases definitive rejection %s and never retries it',async errorCode=>{
    provider.send.mockResolvedValue({accepted:false,status:'failed',outcome:'rejected',errorCode});const p=plan();await send(p);
    expect((await usage()).usage_state).toBe('released');expect(await used()).toBe(0);
    await sendMerchantWhatsApp({...guarded(p),retryFailed:true});expect(provider.send).toHaveBeenCalledOnce();
    const {replyGuard:_,...unguarded}=guarded(p);await sendMerchantWhatsApp({...unguarded,retryFailed:true});expect(provider.send).toHaveBeenCalledOnce();
  });
  it.each(['provider_unreachable','http_408','http_500','unexpected'])('keeps ambiguous %s reserved without inventing a charge',async errorCode=>{
    provider.send.mockResolvedValue({accepted:false,status:'failed',errorCode});await send();expect((await usage()).usage_state).toBe('held');expect(await used()).toBe(0);
  });
  it.each(['sent','delivered','read','failed'])('recovers accepted %s evidence exactly once without sending or enabling learning',async status=>{
    unknown();await send();await confirm(status);await Promise.all([runOrdinaryReplyUsageRecoveryBatch(),runOrdinaryReplyUsageRecoveryBatch(),reconcile()]);
    expect(await used()).toBe(2);expect(await usage()).toMatchObject({usage_state:'charged',state:'waiting_delivery'});expect(provider.send).toHaveBeenCalledOnce();
  });
  it.each(['reset','deleted','replacement','cancelled'])('settles against the original %s subscription only',async mode=>{
    unknown();await send();await confirm();let replacement=0;
    if(mode==='reset')await query("UPDATE merchant_subscriptions SET messages_used=7,last_reset_at=TIMESTAMPADD(DAY,1,last_reset_at) WHERE id=?",[subscriptionId]);
    if(mode==='deleted')await query('DELETE FROM merchant_subscriptions WHERE id=?',[subscriptionId]);
    if(mode==='cancelled'||mode==='replacement')await query("UPDATE merchant_subscriptions SET status='cancelled' WHERE id=?",[subscriptionId]);
    if(mode==='replacement')replacement=await createDisposableTrialSubscription(owner.merchantId);
    await reconcile();await reconcile();expect((await usage()).usage_state).toBe(['reset','deleted'].includes(mode)?'historical':'charged');
    expect(await used()).toBe(mode==='reset'?7:mode==='deleted'?0:2);
    if(replacement)expect((await query('SELECT messages_used FROM merchant_subscriptions WHERE id=?',[replacement]))[0].messages_used).toBe(0);
  });
  it.each(['usage_digest','usage_subscription_id','usage_period_start','usage_outbox_id','usage_request_digest','reply_plan','request_json','instance_id','provider','recipient'])('refuses corrupted %s settlement evidence',async mode=>{
    unknown();await send();await confirm();
    if(mode.startsWith('usage_'))await query(`UPDATE ai_interaction_jobs SET ${mode}=? WHERE merchant_id=?`,
      [mode==='usage_subscription_id'||mode==='usage_outbox_id'?999999:mode==='usage_period_start'?'2030-01-01':'f'.repeat(64),owner.merchantId]);
    else if(mode==='reply_plan')await query("UPDATE ai_interaction_jobs SET reply_plan=JSON_OBJECT('version',1) WHERE merchant_id=?",[owner.merchantId]);
    else if(mode==='instance_id')await query('UPDATE whatsapp_message_deliveries SET instance_id=NULL WHERE merchant_id=?',[owner.merchantId]);
    else if(mode==='provider')await query("UPDATE whatsapp_message_deliveries SET provider='meta_cloud' WHERE merchant_id=?",[owner.merchantId]);
    else if(mode==='recipient')await query("UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.to','966599999999') WHERE merchant_id=?",[owner.merchantId]);
    else await query("UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.inboundJobId',1234) WHERE merchant_id=?",[owner.merchantId]);
    await expect(reconcile()).rejects.toThrow();expect(await used()).toBe(0);expect((await usage()).usage_state).toBe('held');
  });
  it('rolls the counter back when reservation settlement fails after its increment',async()=>{
    unknown();await send();await confirm();const pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){if(key==='execute')return async(...args:any[])=>{
      if(String(args[0]).includes('SET usage_state=?,usage_settled_at='))throw Error('Synthetic settlement failure');return (target.execute as any)(...args);};
      const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;}}) as any;});
    await expect(reconcile()).rejects.toThrow('Synthetic');vi.restoreAllMocks();expect(await used()).toBe(0);expect((await usage()).usage_state).toBe('held');await reconcile();expect(await used()).toBe(2);
  });
  it('does not charge twice after a lost transaction commit acknowledgement',async()=>{
    unknown();await send();await confirm();const pool=(await getPool())!,original=pool.getConnection.bind(pool);let injected=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){if(key==='commit')return async()=>{await target.commit();if(!injected){injected=true;throw Error('Lost commit acknowledgement');}};
      const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;}}) as any;});
    await expect(reconcile()).rejects.toThrow('Lost commit');vi.restoreAllMocks();await reconcile();expect(await used()).toBe(2);
  });
  it('recovers persisted provider evidence after a lost outbox update acknowledgement',async()=>{
    const pool=(await getPool())!,execute=pool.execute.bind(pool);let injected=false;
    vi.spyOn(pool,'execute').mockImplementation(async(...args:any[])=>{const result=await (execute as any)(...args);
      if(!injected&&String(args[0]).includes('SET provider_message_id = ?')){injected=true;throw Error('Lost receipt acknowledgement');}return result;});
    await expect(send()).rejects.toThrow('persisted safely');vi.restoreAllMocks();expect(await used()).toBe(0);
    await runOrdinaryReplyUsageRecoveryBatch();expect(await used()).toBe(2);expect(provider.send).toHaveBeenCalledOnce();
  });
  it('retains unresolved evidence through retention and releases bodies after settlement',async()=>{
    unknown();await send();await confirm();await query('UPDATE whatsapp_message_deliveries SET status_updated_at=TIMESTAMPADD(DAY,-31,UTC_TIMESTAMP()) WHERE merchant_id=?',[owner.merchantId]);
    await purgeCompletedInboundPayloads();expect((await query('SELECT request_json FROM whatsapp_message_deliveries WHERE merchant_id=?',[owner.merchantId]))[0].request_json).not.toBeNull();
    await reconcile();await purgeCompletedInboundPayloads();expect((await query('SELECT request_json FROM whatsapp_message_deliveries WHERE merchant_id=?',[owner.merchantId]))[0].request_json).toBeNull();
    await reconcile();expect(await used()).toBe(2);
  });
  it('parks unknown reservations after eight checks without freeing capacity or resending',async()=>{
    unknown();await send();for(let i=0;i<8;i++){await query('UPDATE ai_interaction_jobs SET usage_recovery_at=UTC_TIMESTAMP(3) WHERE merchant_id=?',[owner.merchantId]);await runOrdinaryReplyUsageRecoveryBatch();}
    expect(await usage()).toMatchObject({usage_state:'held',usage_attempts:8,usage_recovery_at:null,usage_last_error:'transport_unknown'});
    expect((await runOrdinaryReplyUsageRecoveryBatch()).checked).toBe(0);expect(await used()).toBe(0);expect(provider.send).toHaveBeenCalledOnce();
  });
  it('keeps historical ordinary rows unbilled and unable to create a fresh transport attempt',async()=>{
    const p=plan();await stageInteraction(p);await query("UPDATE ai_interaction_jobs SET usage_state='legacy' WHERE merchant_id=?",[owner.merchantId]);
    expect(await sendMerchantWhatsApp(guarded(p))).toMatchObject({accepted:false});await reconcile();expect(await used()).toBe(0);expect(provider.send).not.toHaveBeenCalled();
  });
  it('does not settle another tenant or another incoming message',async()=>{
    unknown();await send();await confirm();expect(await reconcileOrdinaryReplyUsage(other.merchantId,incomingMessageId)).toBe('skipped');
    expect(await reconcileOrdinaryReplyUsage(owner.merchantId,incomingMessageId+100000)).toBe('skipped');expect(await used()).toBe(0);await reconcile();expect(await used()).toBe(2);
  });
  it('early admission includes held capacity and reserves room for the entire two-unit turn',async()=>{
    expect(await hasReachedMessageLimit(owner.merchantId)).toBe(false);unknown();await send();expect(await hasReachedMessageLimit(owner.merchantId)).toBe(true);
    await query("UPDATE whatsapp_message_deliveries SET status='failed',error_code='http_400' WHERE merchant_id=?",[owner.merchantId]);await reconcile();
    expect(await hasReachedMessageLimit(owner.merchantId)).toBe(false);await query('UPDATE subscription_plans SET message_limit=1 WHERE id=?',[planId]);
    expect(await hasReachedMessageLimit(owner.merchantId)).toBe(true);
  });
  it('rechecks subscription expiry in the reservation write after quota locks',async()=>{
    const pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){if(key==='execute')return async(...args:any[])=>{
      if(String(args[0]).includes("SET usage_state='held'"))await target.execute('UPDATE merchant_subscriptions SET end_date=TIMESTAMPADD(DAY,-1,UTC_TIMESTAMP()) WHERE id=?',[subscriptionId]);
      return (target.execute as any)(...args);};const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;}}) as any;});
    expect(await send()).toMatchObject({accepted:false});vi.restoreAllMocks();expect(provider.send).not.toHaveBeenCalled();expect((await usage()).usage_state).toBe('pending');
    expect((await query('SELECT end_date>UTC_TIMESTAMP() AS valid FROM merchant_subscriptions WHERE id=?',[subscriptionId]))[0].valid).toBe(1);
  });
  it('releases a committed reservation only after a recorded no-send suppression following lost acknowledgement',async()=>{
    const p=plan();await stageInteraction(p);const pool=(await getPool())!,original=pool.getConnection.bind(pool);let injected=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){if(key==='commit')return async()=>{
      await target.commit();if(!injected){injected=true;throw Error('Lost reservation acknowledgement');}};
      const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;}}) as any;});
    expect(await sendMerchantWhatsApp(guarded(p))).toMatchObject({accepted:false});vi.restoreAllMocks();
    // The channel recorded a definitive local suppression, so the confirmed no-send releases the hold.
    expect((await usage()).usage_state).toBe('released');expect(await used()).toBe(0);expect(provider.send).not.toHaveBeenCalled();
  });
  it('blocks out-of-order parts and duplicate effect keys without reserving capacity',async()=>{
    const p=plan({welcome:'مرحبا'});await stageInteraction(p);expect(await sendMerchantWhatsApp(guarded(p,1))).toMatchObject({accepted:false});
    expect(provider.send).not.toHaveBeenCalled();expect((await usage()).usage_state).toBe('pending');
    const q=plan({welcome:'أهلا'});q.effects[1].idempotencyKey=q.effects[0].idempotencyKey;
    const source=Number((await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','التالي')",[conversationId])).insertId);
    q.incomingMessageId=source;expect(await send(q)).toMatchObject({accepted:false});expect(provider.send).not.toHaveBeenCalled();
  });
  it('does not send remaining parts after the subscription period changes during the first provider call',async()=>{
    provider.send.mockImplementationOnce(async()=>{await query('UPDATE merchant_subscriptions SET last_reset_at=TIMESTAMPADD(DAY,1,last_reset_at) WHERE id=?',[subscriptionId]);
      return {accepted:true,status:'sent',providerMessageId:randomUUID()};});
    expect(await dispatchReplyPlan(plan({welcome:'مرحبا'}))).toBe('human_takeover');expect(provider.send).toHaveBeenCalledOnce();
    expect((await usage()).usage_state).toBe('historical');expect(await used()).toBe(0);
  });
  it('does not send after the inbound lease expires during quota acquisition and retains the unresolved hold',async()=>{
    const assertOwned=vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValue(Error('Inbound lease lost'));
    await expect(withInboundExecution({id:123,merchantId:owner.merchantId,instanceId,token:randomUUID(),eventKey:'fixture',partitionKey:'fixture',sendOrdinal:0,assertOwned},()=>send())).rejects.toThrow('lease lost');
    expect(provider.send).not.toHaveBeenCalled();expect((await usage()).usage_state).toBe('held');expect(await used()).toBe(0);
    await runOrdinaryReplyUsageRecoveryBatch();expect((await usage()).usage_state).toBe('held');expect(provider.send).not.toHaveBeenCalled();
  });
});
