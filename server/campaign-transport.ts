import {lockCampaignOccasionAuthority,validOccasionAuthorityWindow,OccasionAuthorizationDenied} from './occasion-worker-authority';
import {OCCASION_AUTHORIZATION_REQUIREMENTS} from './occasion-authorization';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from './db/connection';
import { assertRuntimeSchema } from './db/schema-readiness';
import { databaseTimeEpoch } from './db/time';
import { decryptSecret } from './security/secrets';
import { hasActiveCampaignConsent, isQuietHours, withCampaignOptOutNotice } from './automation/campaign-guard';
import type { SendMerchantWhatsAppInput, WhatsAppProviderConfig } from './channels/whatsapp/types';

export type CampaignTransportGuard = { campaignId:number; deliveryId:number; token:string };
export function validCampaignTransportInput(input:SendMerchantWhatsAppInput):boolean {
  const guard=input.campaignGuard;
  return !!guard && [input.merchantId,guard.campaignId,guard.deliveryId].every(id=>Number.isSafeInteger(id)&&id>0)
    && typeof guard.token==='string' && /^[a-f0-9]{64}$/.test(guard.token)
    && input.idempotencyKey===`campaign:${guard.campaignId}:${guard.deliveryId}`
    && ['text','image'].includes(input.kind) && !input.template && !input.messageId
    && !Object.keys(input).some(key=>key.endsWith('Guard') && key!=='campaignGuard' && input[key as keyof typeof input]!=null);
}

/** Payload identity is stable across a safe retry; only the current processing token changes. */
export function canRetryCampaignTransport(input:SendMerchantWhatsAppInput, prior:unknown):boolean {
  if (!validCampaignTransportInput(input) || !prior || typeof prior!=='object') return false;
  const p=prior as Partial<SendMerchantWhatsAppInput>;
  return p.campaignGuard?.campaignId===input.campaignGuard!.campaignId
    && p.campaignGuard?.deliveryId===input.campaignGuard!.deliveryId
    && ['to','kind','text','mediaUrl','fileName','template'].every(key=>
      (p[key as keyof typeof p]??null)===(input[key as keyof typeof input]??null));
}

/** The durable channel row is reserved before entering here. Hold the lease until the
 * bounded provider call and receipt write finish, so recovery cannot revoke it mid-send.
 * No new subscription unit is charged here: the original period-bound unit must exist. */
export async function withCampaignTransportAuthority<T>(input:SendMerchantWhatsAppInput, config:WhatsAppProviderConfig,
  instanceId:number, dispatch:(connection:PoolConnection)=>Promise<T>):Promise<{allowed:false}|{allowed:true;result:T}> {
  if(!validCampaignTransportInput(input))return {allowed:false};
  await assertRuntimeSchema('campaign transport authority',[
    ...OCCASION_AUTHORIZATION_REQUIREMENTS,
    {table:'campaign_delivery_outbox',columns:['processing_token','claimed_at','quota_reserved','quota_subscription_id','quota_period_start']},
    {table:'whatsapp_message_deliveries',columns:['request_json','provider_message_id']},
  ]);
  const pool=await getPool();if(!pool)throw new Error('Campaign transport authority unavailable');
  const c=await pool.getConnection(),guard=input.campaignGuard!;
  let committing=false,reusable=true;
  const denied=async()=>{try{await c.rollback();}catch{reusable=false;}return {allowed:false} as const;};
  try {
    await c.beginTransaction();
    const [merchants]=await c.execute<RowDataPacket[]>('SELECT id,userId,status,businessName,current_subscription_id,timezone FROM merchants WHERE id=? FOR UPDATE',[input.merchantId]);
    const merchant=merchants[0];if(!merchant || merchant.status!=='active')return await denied();
    // Campaign precedes its recipients, matching admission and deletion.
    const [campaigns]=await c.execute<RowDataPacket[]>('SELECT id,merchantId,name,status,message,imageUrl,targetAudience,scheduledAt FROM campaigns WHERE id=? AND merchantId=? FOR SHARE',[guard.campaignId,input.merchantId]);
    const campaign=campaigns[0];
    if(!campaign || campaign.status!=='sending' || input.text!==withCampaignOptOutNotice(campaign.message)
      || input.kind!==(campaign.imageUrl?'image':'text') || (input.mediaUrl??null)!==(campaign.imageUrl||null)
      || (input.fileName??null)!==(campaign.imageUrl?'campaign.jpg':null))return await denied();
    const occasionAuthority=await lockCampaignOccasionAuthority(c,merchant,campaign,'dispatch');
    const [leases]=await c.execute<RowDataPacket[]>(`SELECT status,processing_token,customer_phone,quota_reserved,quota_subscription_id,quota_period_start
      FROM campaign_delivery_outbox WHERE id=? AND campaign_id=? AND merchant_id=? FOR UPDATE`,[guard.deliveryId,guard.campaignId,input.merchantId]);
    const lease=leases[0];
    if(!lease || lease.status!=='processing' || lease.processing_token!==guard.token || lease.customer_phone!==input.to
      || Number(lease.quota_reserved)!==1 || lease.quota_subscription_id!==merchant.current_subscription_id
      || !Number.isFinite(databaseTimeEpoch(lease.quota_period_start)))return await denied();
    const [subscriptions]=await c.execute<RowDataPacket[]>(`SELECT last_reset_at,messages_used FROM merchant_subscriptions
      WHERE id=? AND merchant_id=? AND status IN ('active','trial') AND start_date<=UTC_TIMESTAMP(3) AND end_date>UTC_TIMESTAMP(3)
        AND (status<>'trial' OR trial_ends_at>UTC_TIMESTAMP(3)) FOR SHARE`,[lease.quota_subscription_id,input.merchantId]);
    const subscription=subscriptions[0];
    if(!subscription || databaseTimeEpoch(subscription.last_reset_at)!==databaseTimeEpoch(lease.quota_period_start)
      || !Number.isSafeInteger(Number(subscription.messages_used)) || Number(subscription.messages_used)<1)return await denied();
    const [instances]=await c.execute<RowDataPacket[]>('SELECT * FROM whatsapp_instances WHERE id=? AND merchant_id=? FOR SHARE',[instanceId,input.merchantId]);
    const instance=instances[0];
    if(!instance || instance.status!=='active' || instance.provider!==config.provider || String(instance.instance_id)!==config.instanceId
      || decryptSecret(instance.token)!==config.token || (instance.api_url??null)!==(config.apiUrl??null)
      || (instance.phone_number_id??null)!==(config.phoneNumberId??null) || (instance.provider_account_id??null)!==(config.providerAccountId??null))return await denied();
    const [receipts]=await c.execute<RowDataPacket[]>(`SELECT status,provider_message_id,request_json,instance_id,provider FROM whatsapp_message_deliveries
      WHERE merchant_id=? AND idempotency_key=? FOR UPDATE`,[input.merchantId,input.idempotencyKey]);
    const receipt=receipts[0];
    const request=typeof receipt?.request_json==='string'?JSON.parse(receipt.request_json):receipt?.request_json;
    if(!receipt || receipt.status!=='queued' || receipt.provider_message_id || Number(receipt.instance_id)!==instanceId
      || receipt.provider!==config.provider || request?.campaignGuard?.token!==guard.token || !canRetryCampaignTransport(input,request))return await denied();
    if(!await hasActiveCampaignConsent(input.merchantId,input.to) || isQuietHours(22,8,merchant.timezone||'Asia/Riyadh'))return await denied();
    // SQL/consent checks may have waited. Recheck database time immediately before I/O.
    const [fresh]=await c.execute<RowDataPacket[]>(`SELECT id FROM campaign_delivery_outbox WHERE id=? AND processing_token=?
      AND claimed_at BETWEEN DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) AND UTC_TIMESTAMP(3)`,[guard.deliveryId,guard.token]);
    if(fresh.length!==1)return await denied();
    if(occasionAuthority&&!validOccasionAuthorityWindow(occasionAuthority.contract,new Date()))return await denied();
    const result=await dispatch(c);
    committing=true;await c.commit();return {allowed:true,result};
  }catch(error){if(committing)reusable=false;else try{await c.rollback();}catch{reusable=false;}if(error instanceof OccasionAuthorizationDenied)return {allowed:false};throw error;}finally{if(reusable)c.release();else c.destroy();}
}
