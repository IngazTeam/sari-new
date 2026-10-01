import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { getPool,closeDb } from './db/connection';
import { createDisposableMerchant,createDisposableTrialSubscription,cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { reserveCampaignQuota,releaseCampaignQuota,CampaignQuotaEvidenceError,type CampaignQuotaLease } from './campaign-quota';
import { lockReplyUsageCapacity } from './ai/reply-usage-quota';

describe.skipIf(!process.env.DATABASE_URL)('campaign quota reservation and period-bound refund in local MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,subscriptionId:number,planId:number,campaignId:number,lease:CampaignQuotaLease;
  const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
  const used=async(id=subscriptionId)=>Number((await q('SELECT messages_used FROM merchant_subscriptions WHERE id=?',[id]))[0].messages_used);
  const row=async()=> (await q('SELECT * FROM campaign_delivery_outbox WHERE id=?',[lease.id]))[0];
  const addLease=async(phone='99900000001')=>({id:Number((await q(`INSERT INTO campaign_delivery_outbox (campaign_id,merchant_id,customer_phone,status,processing_token,claimed_at)
    VALUES (?, ?, ?, 'processing', 'quota-fixture-token', UTC_TIMESTAMP(3))`,[campaignId,owner.merchantId,phone])).insertId),campaign_id:campaignId,merchant_id:owner.merchantId,processing_token:'quota-fixture-token'});
  beforeEach(async()=>{owner=await createDisposableMerchant('campaign-quota');other=await createDisposableMerchant('quota-other');subscriptionId=await createDisposableTrialSubscription(owner.merchantId);
    planId=Number((await q("INSERT INTO subscription_plans (name,name_en,monthly_price,yearly_price,max_customers,message_limit) VALUES ('Quota fixture','Quota fixture',1,10,100,100)")).insertId);
    await q("UPDATE merchant_subscriptions SET status='active',plan_id=?,messages_used=7,last_reset_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id=?",[planId,subscriptionId]);
    campaignId=Number((await q("INSERT INTO campaigns (merchantId,name,message,status) VALUES (?,'Quota fixture','Fixture','sending')",[owner.merchantId])).insertId);lease=await addLease();
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId,other.userId]);await q('DELETE FROM subscription_plans WHERE id=?',[planId]);});afterAll(closeDb);
  it('reserves once in the selected period and refunds that period only once',async()=>{
    expect(await reserveCampaignQuota(lease)).toEqual({accepted:true});expect(await used()).toBe(8);expect(await row()).toMatchObject({quota_reserved:1,quota_subscription_id:subscriptionId,quota_period_start:expect.any(Date)});
    await expect(reserveCampaignQuota(lease)).rejects.toBeInstanceOf(CampaignQuotaEvidenceError);expect(await used()).toBe(8);
    await releaseCampaignQuota(lease);await releaseCampaignQuota(lease);expect(await used()).toBe(7);expect(await row()).toMatchObject({quota_reserved:0,quota_subscription_id:null,quota_period_start:null});
  });
  it('does not deduct from a new period after counters reset',async()=>{
    await reserveCampaignQuota(lease);await q('UPDATE merchant_subscriptions SET last_reset_at=UTC_TIMESTAMP(),messages_used=5 WHERE id=?',[subscriptionId]);
    await releaseCampaignQuota(lease);expect(await used()).toBe(5);expect((await row()).quota_reserved).toBe(0);
  });
  it('never refunds an unbound legacy reservation automatically',async()=>{
    await q('UPDATE campaign_delivery_outbox SET quota_reserved=1,quota_subscription_id=? WHERE id=?',[subscriptionId,lease.id]);
    await expect(releaseCampaignQuota(lease)).rejects.toBeInstanceOf(CampaignQuotaEvidenceError);expect(await used()).toBe(7);expect((await row()).quota_reserved).toBe(1);
  });
  it('refunds the original subscription rather than a replacement selected later',async()=>{
    await reserveCampaignQuota(lease);const replacement=await createDisposableTrialSubscription(owner.merchantId);await q('UPDATE merchant_subscriptions SET messages_used=3 WHERE id=?',[replacement]);
    await releaseCampaignQuota(lease);expect(await used()).toBe(7);expect(await used(replacement)).toBe(3);
  });
  it.each(['trial','unlimited','archived-plan'])('reserves under canonical %s policy',async mode=>{
    if(mode==='trial')await q("UPDATE merchant_subscriptions SET status='trial',plan_id=NULL WHERE id=?",[subscriptionId]);if(mode==='unlimited')await q('UPDATE subscription_plans SET message_limit=-1 WHERE id=?',[planId]);if(mode==='archived-plan')await q('UPDATE subscription_plans SET is_active=0 WHERE id=?',[planId]);
    expect(await reserveCampaignQuota(lease)).toEqual({accepted:true});expect(await used()).toBe(8);
  });
  it('allows only one of two campaigns competing for the last unit',async()=>{
    await q('UPDATE subscription_plans SET message_limit=8 WHERE id=?',[planId]);const second=await addLease('99900000002');
    const results=await Promise.all([reserveCampaignQuota(lease),reserveCampaignQuota(second)]);expect(results.filter(r=>r.accepted)).toHaveLength(1);expect(results.filter(r=>!r.accepted)).toEqual([{accepted:false,reason:'message_limit'}]);expect(await used()).toBe(8);
  });
  it('counts a real outstanding reply hold before reserving a campaign unit',async()=>{
    const conv=Number((await q("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'99900000002')",[owner.merchantId])).insertId);
    const msg=Number((await q("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','Fixture')",[conv])).insertId);
    await q(`INSERT INTO ai_interaction_jobs (merchant_id,conversation_id,incoming_message_id,reply_text,reply_origin,reply_digest,reply_plan,
      usage_state,usage_subscription_id,usage_period_start,usage_units,usage_reserved_at,usage_digest,usage_outbox_id,usage_provider,usage_request_digest)
      SELECT ?,?,?,'Fixture','ordinary',REPEAT('a',64),'{}','held',id,last_reset_at,2,UTC_TIMESTAMP(3),REPEAT('b',64),1,'mock',REPEAT('c',64)
      FROM merchant_subscriptions WHERE id=?`,[owner.merchantId,conv,msg,subscriptionId]);
    await q('UPDATE subscription_plans SET message_limit=9 WHERE id=?',[planId]);
    expect(await reserveCampaignQuota(lease)).toEqual({accepted:false,reason:'message_limit'});expect(await used()).toBe(7);
  });
  it('makes campaign reservations visible to the actual reply quota guard',async()=>{
    await q('UPDATE subscription_plans SET message_limit=9 WHERE id=?',[planId]);await reserveCampaignQuota(lease);
    const connection=await (await getPool())!.getConnection();try{await connection.beginTransaction();await connection.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[owner.merchantId]);
      await expect(lockReplyUsageCapacity(connection,owner.merchantId)).rejects.toThrow('Reply usage evidence unavailable');
    }finally{await connection.rollback();connection.release();}expect(await used()).toBe(8);
  });
  it.each(['foreign-tenant','wrong-campaign','lost-token'])('rejects %s lease evidence without consuming quota',async mode=>{
    const forged={...lease,...(mode==='foreign-tenant'?{merchant_id:other.merchantId}:mode==='wrong-campaign'?{campaign_id:campaignId+1}:{processing_token:'old-token'})};
    await expect(reserveCampaignQuota(forged)).rejects.toBeInstanceOf(CampaignQuotaEvidenceError);await expect(releaseCampaignQuota(forged)).rejects.toBeInstanceOf(CampaignQuotaEvidenceError);expect(await used()).toBe(7);
  });
  it('preserves the provider window without consuming subscription quota when full',async()=>{
    await q('INSERT INTO campaign_dispatch_rate_limits (merchant_id,window_started_at,reserved_count) VALUES (?,UTC_TIMESTAMP(3),10)',[owner.merchantId]);
    expect(await reserveCampaignQuota(lease)).toEqual({accepted:false,reason:'provider_rate'});expect(await used()).toBe(7);expect((await row()).quota_reserved).toBe(0);
  });
  it('does not reserve quota for an expired processing lease',async()=>{
    await q('UPDATE campaign_delivery_outbox SET claimed_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 6 MINUTE) WHERE id=?',[lease.id]);await expect(reserveCampaignQuota(lease)).rejects.toBeInstanceOf(CampaignQuotaEvidenceError);expect(await used()).toBe(7);
  });
  it('enforces the migration check against an orphaned period with no reserved unit',async()=>{
    await expect(q('UPDATE campaign_delivery_outbox SET quota_period_start=UTC_TIMESTAMP(3) WHERE id=?',[lease.id])).rejects.toThrow();expect((await row()).quota_period_start).toBeNull();
  });
  it('fails closed on corrupt quota numbers rather than granting an unlimited plan',async()=>{
    await q('UPDATE subscription_plans SET message_limit=-2 WHERE id=?',[planId]);await expect(reserveCampaignQuota(lease)).rejects.toBeInstanceOf(CampaignQuotaEvidenceError);expect(await used()).toBe(7);
  });
  it('does not refund a held marker if its same-period counter has already vanished',async()=>{
    await reserveCampaignQuota(lease);await q('UPDATE merchant_subscriptions SET messages_used=0 WHERE id=?',[subscriptionId]);await expect(releaseCampaignQuota(lease)).rejects.toBeInstanceOf(CampaignQuotaEvidenceError);expect((await row()).quota_reserved).toBe(1);
  });
  it('rolls back usage and provider capacity if saving the reservation fails',async()=>{
    const pool=(await getPool())!,connection=await pool.getConnection(),native=connection.execute.bind(connection);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(connection);
    vi.spyOn(connection,'execute').mockImplementation((async(...args:any[])=>{if(String(args[0]).includes('SET quota_subscription_id='))throw Error('Injected reservation failure');return native(...args as [any,any]);}) as any);
    await expect(reserveCampaignQuota(lease)).rejects.toThrow('Injected reservation failure');vi.restoreAllMocks();expect(await used()).toBe(7);expect((await row()).quota_reserved).toBe(0);expect(await q('SELECT * FROM campaign_dispatch_rate_limits WHERE merchant_id=?',[owner.merchantId])).toEqual([]);
  });
  it('rolls back a refund if its reservation marker cannot be cleared',async()=>{
    await reserveCampaignQuota(lease);const pool=(await getPool())!,connection=await pool.getConnection(),native=connection.execute.bind(connection);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(connection);
    vi.spyOn(connection,'execute').mockImplementation((async(...args:any[])=>{if(String(args[0]).includes('SET quota_reserved=0'))throw Error('Injected refund failure');return native(...args as [any,any]);}) as any);
    await expect(releaseCampaignQuota(lease)).rejects.toThrow('Injected refund failure');vi.restoreAllMocks();expect(await used()).toBe(8);expect((await row()).quota_reserved).toBe(1);
  });
});
