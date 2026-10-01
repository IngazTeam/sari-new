import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from './db/connection';
import { databaseTimeEpoch } from './db/time';
import { assertRuntimeSchema } from './db/schema-readiness';
import { campaignCapacityFromRows, campaignCapacitySql, CampaignCapacityUnavailableError } from './campaign-capacity';

export type CampaignQuotaLease = { id:number; campaign_id:number; merchant_id:number; processing_token:string };
export class CampaignQuotaEvidenceError extends Error {
  constructor() { super('Campaign quota evidence unavailable'); this.name='CampaignQuotaEvidenceError'; }
}
const sqlTime=(value:string)=>value.slice(0,23).replace('T',' ');
function validate(lease:CampaignQuotaLease) {
  if (![lease.id,lease.campaign_id,lease.merchant_id].every(id=>Number.isSafeInteger(id)&&id>0)
    || typeof lease.processing_token!=='string' || !lease.processing_token || lease.processing_token.length>64) throw new CampaignQuotaEvidenceError();
}
async function schema() {
  await assertRuntimeSchema('campaign quota periods', [{table:'campaign_delivery_outbox',columns:['quota_subscription_id','quota_reserved','quota_period_start'],checkConstraints:['campaign_delivery_outbox_quota_period_check']}]);
}
async function lockLease(connection:PoolConnection,lease:CampaignQuotaLease) {
  const [rows]=await connection.execute<RowDataPacket[]>(`SELECT id,status,processing_token,quota_reserved,quota_subscription_id,quota_period_start,
    (claimed_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE)) AS leaseFresh
    FROM campaign_delivery_outbox WHERE id=? AND merchant_id=? AND campaign_id=? FOR UPDATE`,[lease.id,lease.merchant_id,lease.campaign_id]);
  const row=rows[0];
  if (!row || row.status!=='processing' || row.processing_token!==lease.processing_token) throw new CampaignQuotaEvidenceError();
  return row;
}

/** Same merchant -> delivery -> subscription order as ordinary and reviewed replies. */
export async function reserveCampaignQuota(lease:CampaignQuotaLease):Promise<{accepted:true}|{accepted:false;reason:'inactive_subscription'|'message_limit'|'provider_rate'}> {
  validate(lease);await schema();const pool=await getPool();if(!pool)throw new CampaignQuotaEvidenceError();
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [merchants]=await connection.execute<RowDataPacket[]>('SELECT id,status FROM merchants WHERE id=? FOR UPDATE',[lease.merchant_id]);
    if (!merchants[0] || merchants[0].status!=='active') {await connection.rollback();return {accepted:false,reason:'inactive_subscription'};}
    const row=await lockLease(connection,lease);
    if(Number(row.leaseFresh)!==1)throw new CampaignQuotaEvidenceError();
    // An existing reservation needs recovery/receipt evidence; never charge it twice.
    if (Number(row.quota_reserved)!==0 || row.quota_subscription_id!==null || row.quota_period_start!==null) throw new CampaignQuotaEvidenceError();
    const [subscriptions]=await connection.execute<RowDataPacket[]>(`${campaignCapacitySql} FOR UPDATE`,[lease.merchant_id]);
    if(subscriptions.length===0){await connection.rollback();return {accepted:false,reason:'inactive_subscription'};}
    let capacity:ReturnType<typeof campaignCapacityFromRows>;
    try {capacity=campaignCapacityFromRows(subscriptions);} catch(error) {
      if (!(error instanceof CampaignCapacityUnavailableError)) throw error;
      throw new CampaignQuotaEvidenceError();
    }
    if (capacity.remaining<1) {await connection.rollback();return {accepted:false,reason:'message_limit'};}
    await connection.execute(`INSERT INTO campaign_dispatch_rate_limits (merchant_id,window_started_at,reserved_count)
      VALUES (?,NOW(3),0) ON DUPLICATE KEY UPDATE merchant_id=VALUES(merchant_id)`,[lease.merchant_id]);
    const [windows]=await connection.execute<RowDataPacket[]>(`SELECT reserved_count AS reservedCount,
      TIMESTAMPDIFF(MICROSECOND,window_started_at,NOW(3)) AS windowAge FROM campaign_dispatch_rate_limits WHERE merchant_id=? FOR UPDATE`,[lease.merchant_id]);
    const count=Number(windows[0]?.reservedCount),age=Number(windows[0]?.windowAge);
    if (!Number.isInteger(count)||count<0||count>10||!Number.isFinite(age)||age<0) throw new CampaignQuotaEvidenceError();
    const expired=age>=1_000_000;
    if (!expired&&count>=10) {await connection.rollback();return {accepted:false,reason:'provider_rate'};}
    await connection.execute(`UPDATE campaign_dispatch_rate_limits SET window_started_at=IF(?=1,NOW(3),window_started_at),
      reserved_count=IF(?=1,1,reserved_count+1) WHERE merchant_id=?`,[expired?1:0,expired?1:0,lease.merchant_id]);
    const [usage]=await connection.execute<any>(`UPDATE merchant_subscriptions SET messages_used=messages_used+1
      WHERE id=? AND merchant_id=? AND last_reset_at=? AND messages_used>=0 AND messages_used<2147483647`,[capacity.subscriptionId,lease.merchant_id,sqlTime(capacity.periodStart)]);
    if (Number(usage.affectedRows)!==1) throw new CampaignQuotaEvidenceError();
    const [saved]=await connection.execute<any>(`UPDATE campaign_delivery_outbox SET quota_subscription_id=?,quota_reserved=1,quota_period_start=?
      WHERE id=? AND merchant_id=? AND status='processing' AND processing_token=? AND quota_reserved=0`,[capacity.subscriptionId,sqlTime(capacity.periodStart),lease.id,lease.merchant_id,lease.processing_token]);
    if (Number(saved.affectedRows)!==1) throw new CampaignQuotaEvidenceError();
    await connection.commit();return {accepted:true};
  }catch(error){try{await connection.rollback();}catch{}throw error;}finally{connection.release();}
}

/** Refund only the original subscription and period. Legacy unbound holds require review. */
export async function releaseCampaignQuota(lease:CampaignQuotaLease):Promise<void> {
  validate(lease);await schema();const pool=await getPool();if(!pool)throw new CampaignQuotaEvidenceError();
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [merchants]=await connection.execute<RowDataPacket[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE',[lease.merchant_id]);
    if(!merchants[0])throw new CampaignQuotaEvidenceError();
    const row=await lockLease(connection,lease);
    if(Number(row.quota_reserved)===0){
      if(row.quota_subscription_id!==null||row.quota_period_start!==null)throw new CampaignQuotaEvidenceError();
      await connection.commit();return;
    }
    const subscriptionId=Number(row.quota_subscription_id),period=databaseTimeEpoch(row.quota_period_start);
    if(Number(row.quota_reserved)!==1||!Number.isSafeInteger(subscriptionId)||subscriptionId<=0||!Number.isFinite(period))throw new CampaignQuotaEvidenceError();
    const [subscriptions]=await connection.execute<RowDataPacket[]>('SELECT merchant_id,last_reset_at,messages_used FROM merchant_subscriptions WHERE id=? FOR UPDATE',[subscriptionId]);
    const subscription=subscriptions[0];
    if(subscription){
      const currentPeriod=databaseTimeEpoch(subscription.last_reset_at),used=Number(subscription.messages_used);
      if(Number(subscription.merchant_id)!==lease.merchant_id||!Number.isFinite(currentPeriod)||currentPeriod<period||!Number.isSafeInteger(used)||used<0)throw new CampaignQuotaEvidenceError();
      if(currentPeriod===period){
        if(used===0)throw new CampaignQuotaEvidenceError();
        const [refunded]=await connection.execute<any>(`UPDATE merchant_subscriptions SET messages_used=messages_used-1
          WHERE id=? AND merchant_id=? AND last_reset_at=? AND messages_used>0`,[subscriptionId,lease.merchant_id,sqlTime(new Date(period).toISOString())]);
        if(Number(refunded.affectedRows)!==1)throw new CampaignQuotaEvidenceError();
      }
    }
    const [cleared]=await connection.execute<any>(`UPDATE campaign_delivery_outbox SET quota_reserved=0,quota_subscription_id=NULL,quota_period_start=NULL
      WHERE id=? AND merchant_id=? AND status='processing' AND processing_token=? AND quota_reserved=1`,[lease.id,lease.merchant_id,lease.processing_token]);
    if(Number(cleared.affectedRows)!==1)throw new CampaignQuotaEvidenceError();
    await connection.commit();
  }catch(error){try{await connection.rollback();}catch{}throw error;}finally{connection.release();}
}
