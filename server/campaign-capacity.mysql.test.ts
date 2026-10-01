import { afterAll,afterEach,beforeEach,describe,expect,it } from 'vitest';
import { getPool,closeDb } from './db/connection';
import { createDisposableMerchant,createDisposableTrialSubscription,cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { readCampaignCapacity,CampaignCapacityUnavailableError } from './campaign-capacity';

describe.skipIf(!process.env.DATABASE_URL)('campaign subscription availability on local MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,subscriptionId:number,planId:number;
  const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
  const read=()=>readCampaignCapacity(owner.merchantId);
  beforeEach(async()=>{owner=await createDisposableMerchant('campaign-capacity');other=await createDisposableMerchant('capacity-other');subscriptionId=await createDisposableTrialSubscription(owner.merchantId);
    planId=Number((await q("INSERT INTO subscription_plans (name,name_en,monthly_price,yearly_price,max_customers,message_limit) VALUES ('Capacity fixture','Capacity fixture',1,10,100,1000)")).insertId);
    await q("UPDATE merchant_subscriptions SET status='active',plan_id=?,messages_used=7 WHERE id=?",[planId,subscriptionId]);
  });
  afterEach(async()=>{await cleanupDisposableMerchants([owner.userId,other.userId]);await q('DELETE FROM subscription_plans WHERE id=?',[planId]);});afterAll(closeDb);
  it('reads real remaining messages above the removed process-local 500 ceiling',async()=>expect(await read()).toMatchObject({subscriptionId,used:7,held:0,limit:1000,remaining:993}));
  it('uses the selected subscription even if a newer unrelated valid subscription exists',async()=>{
    await q("INSERT INTO merchant_subscriptions (merchant_id,plan_id,status,billing_cycle,start_date,end_date,messages_used) VALUES (?,?,'active','monthly',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 DAY),999)",[owner.merchantId,planId]);expect((await read()).remaining).toBe(993);
  });
  it.each(['trial','unlimited','archived-plan'])('preserves %s subscription policy',async mode=>{
    if(mode==='trial')await q("UPDATE merchant_subscriptions SET status='trial',plan_id=NULL WHERE id=?",[subscriptionId]);
    if(mode==='unlimited')await q('UPDATE subscription_plans SET message_limit=-1 WHERE id=?',[planId]);
    if(mode==='archived-plan')await q('UPDATE subscription_plans SET is_active=0 WHERE id=?',[planId]);
    expect((await read()).unlimited).toBe(mode!=='archived-plan');
  });
  it.each(['expired','future','cancelled','foreign-pointer','missing-pointer','negative-used','bad-limit','future-period','trial-expired','active-no-plan'])('fails closed on %s evidence',async mode=>{
    if(mode==='expired')await q('UPDATE merchant_subscriptions SET end_date=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id=?',[subscriptionId]);
    if(mode==='future')await q('UPDATE merchant_subscriptions SET start_date=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id=?',[subscriptionId]);
    if(mode==='cancelled')await q("UPDATE merchant_subscriptions SET status='cancelled' WHERE id=?",[subscriptionId]);
    if(mode==='foreign-pointer'){const theirs=await createDisposableTrialSubscription(other.merchantId);await q('UPDATE merchants SET current_subscription_id=? WHERE id=?',[theirs,owner.merchantId]);}
    if(mode==='missing-pointer')await q('UPDATE merchants SET current_subscription_id=NULL WHERE id=?',[owner.merchantId]);
    if(mode==='negative-used')await q('UPDATE merchant_subscriptions SET messages_used=-1 WHERE id=?',[subscriptionId]);
    if(mode==='bad-limit')await q('UPDATE subscription_plans SET message_limit=-2 WHERE id=?',[planId]);
    if(mode==='future-period')await q('UPDATE merchant_subscriptions SET last_reset_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id=?',[subscriptionId]);
    if(mode==='trial-expired')await q("UPDATE merchant_subscriptions SET status='trial',trial_ends_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id=?",[subscriptionId]);
    if(mode==='active-no-plan')await q('UPDATE merchant_subscriptions SET plan_id=NULL WHERE id=?',[subscriptionId]);
    await expect(read()).rejects.toBeInstanceOf(CampaignCapacityUnavailableError);
  });
  it('deducts only held ordinary replies from the same tenant, subscription and period',async()=>{
    const conv=Number((await q("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'99900000001')",[owner.merchantId])).insertId);
    const msg=Number((await q("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','Fixture')",[conv])).insertId);
    const held=Number((await q(`INSERT INTO ai_interaction_jobs (merchant_id,conversation_id,incoming_message_id,reply_text,reply_origin,reply_digest,reply_plan,
      usage_state,usage_subscription_id,usage_period_start,usage_units,usage_reserved_at,usage_digest,usage_outbox_id,usage_provider,usage_request_digest)
      SELECT ?,?,?,'Fixture','ordinary',REPEAT('a',64),'{}','held',id,last_reset_at,2,UTC_TIMESTAMP(3),REPEAT('b',64),1,'mock',REPEAT('c',64)
      FROM merchant_subscriptions WHERE id=?`,[owner.merchantId,conv,msg,subscriptionId])).insertId);
    expect(await read()).toMatchObject({used:7,held:2,remaining:991});
    await q('UPDATE ai_interaction_jobs SET usage_period_start=DATE_SUB(usage_period_start,INTERVAL 1 DAY) WHERE id=?',[held]);expect((await read()).held).toBe(0);
    await q('UPDATE ai_interaction_jobs SET usage_period_start=(SELECT last_reset_at FROM merchant_subscriptions WHERE id=?),merchant_id=? WHERE id=?',[subscriptionId,other.merchantId,held]);expect((await read()).held).toBe(0);
    await q('UPDATE ai_interaction_jobs SET merchant_id=?,usage_subscription_id=? WHERE id=?',[owner.merchantId,subscriptionId+100000,held]);expect((await read()).held).toBe(0);
    await q("UPDATE ai_interaction_jobs SET usage_subscription_id=?,usage_state='released',usage_settled_at=UTC_TIMESTAMP(3) WHERE id=?",[subscriptionId,held]);expect((await read()).held).toBe(0);
  });
});
