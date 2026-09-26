import type { Pool,PoolConnection } from 'mysql2/promise';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { databaseTimeEpoch } from '../db/time';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { parseStaffJson,readStaffRelayBasis,readStaffAcceptance,staffRelayBasis,staffAcceptanceSnapshot,staffPhoneKey,staffReceiptDigest,staffRelayTransport,staffAccountDigest } from './sales-staff-acceptance-contract';
import { decryptSecret } from '../security/secrets';
import type { WhatsAppProviderConfig } from '../channels/whatsapp/types';
import type { StaffRelayBasis } from './sales-staff-acceptance-contract';

const unavailable=():never=>{throw Error('Staff transport evidence unavailable');};
function accountConfig(account:any):WhatsAppProviderConfig{
  if(!account||account.status!=='active')return unavailable();
  return {provider:account.provider||'green_api',instanceId:String(account.instance_id),token:decryptSecret(account.token),
    apiUrl:account.api_url,phoneNumberId:account.phone_number_id,providerAccountId:account.provider_account_id};
}
/** Recheck storage as well as the config already loaded by the transport. Never expose credentials. */
export async function staffRelayAccountIsCurrent(pool:Pick<Pool,'execute'>,basis:Pick<StaffRelayBasis,'merchantId'|'instanceRecordId'|'accountDigest'>,config:WhatsAppProviderConfig){
  const [rows]=await pool.execute<any[]>('SELECT * FROM whatsapp_instances WHERE id=? AND merchant_id=?',[basis.instanceRecordId,basis.merchantId]);
  if(rows.length!==1)return false;
  try{return staffAccountDigest(config)===basis.accountDigest&&staffAccountDigest(accountConfig(rows[0]))===basis.accountDigest;}catch{return false;}
}
export async function assertSalesStaffAcceptanceSchema(){
  await assertRuntimeSchema('staff transport acceptance',[
    {table:'sales_escalation_relays',columns:['staff_basis','staff_basis_digest']},
    {table:'ai_sales_staff_acceptances',columns:['merchant_id','source_kind','source_id','customer_key','outbox_id','provider_message_digest','acceptance_digest','snapshot','acceptance_observed_at'],
      uniqueIndexes:[{name:'uq_staff_acceptance_source',columns:['merchant_id','source_kind','source_id']},
        {name:'uq_staff_acceptance_outbox',columns:['merchant_id','outbox_id']},
        {name:'uq_staff_acceptance_receipt',columns:['merchant_id','provider_message_digest']}]},
  ],{cacheSuccess:false});
}
/** Before the first transport call, under the caller's merchant/conversation reservation locks. */
export async function freezeStaffRelayBasis(c:PoolConnection,r:any,alertId:number){
  const [accounts]=await c.execute<any[]>('SELECT * FROM whatsapp_instances WHERE id=? AND merchant_id=? FOR SHARE',[r.instance_id,r.merchant_id]);
  const account=accounts[0];if(accounts.length!==1)return unavailable();
  const accountDigest=staffAccountDigest(accountConfig(account));
  const [alerts]=await c.execute<any[]>('SELECT * FROM whatsapp_message_deliveries WHERE id=? AND merchant_id=? FOR SHARE',[alertId,r.merchant_id]);
  const a=alerts[0],request=parseStaffJson(a?.request_json),g=request?.escalationGuard;
  if(alerts.length!==1||a.instance_id!==r.instance_id||a.direction!=='outgoing'||!['sent','delivered','read'].includes(a.status)
    ||!['green_api','meta_cloud',...(process.env.NODE_ENV==='test'?['mock']:[])].includes(a.provider)||a.provider!==(account.provider||'green_api')
    ||a.provider_message_id!==r.quoted_message_id||!new RegExp(`^escalation_alert:${r.merchant_id}:${r.escalation_id}:[0-4]$`).test(a.idempotency_key)
    ||request?.kind!=='text'||g?.mode!=='alert'||g?.id!==r.escalation_id||g?.sourceMessageId!==r.source_message_id||g?.version+1!==r.ownership_version
    ||staffPhoneKey(r.merchant_id,request?.to,true)!==staffPhoneKey(r.merchant_id,r.author_phone,true))return unavailable();
  const [[clock]]=await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
  const b=staffRelayBasis.parse({version:'sales-staff-relay-basis.v1',source:'escalation_relay',sourceId:r.id,merchantId:r.merchant_id,
    escalationId:r.escalation_id,conversationId:r.conversation_id,incomingMessageId:r.source_message_id,ownershipVersion:r.ownership_version,
    instanceRecordId:r.instance_id,provider:a.provider,accountDigest,customerKey:staffPhoneKey(r.merchant_id,r.customer_phone),authorKey:staffPhoneKey(r.merchant_id,r.author_phone,true),
    authorBasis:'sourced_escalation_chain_phone',replyDigest:hash(r.reply_text),quotedMessageDigest:staffReceiptDigest(r.merchant_id,r.instance_id,a.provider,r.quoted_message_id),
    alertOutboxId:Number(a.id),alertRequestDigest:hash(request),reservedAt:new Date(databaseTimeEpoch(clock.now)).toISOString(),scope:'staff_reply_attempt_only'});
  const [saved]=await c.execute<any>('UPDATE sales_escalation_relays SET staff_basis=?,staff_basis_digest=? WHERE id=? AND merchant_id=? AND staff_basis IS NULL AND staff_basis_digest IS NULL',
    [JSON.stringify(b),hash(b),r.id,r.merchant_id]);
  if(saved.affectedRows!==1)return unavailable();return b;
}
/** Caller serializes the relay and outbox. SQL-only, atomic with message projection and review. */
export async function recordStaffRelayAcceptance(c:PoolConnection,r:any,d:any){
  const b=readStaffRelayBasis(r);
  const [previous]=await c.execute<any[]>("SELECT * FROM ai_sales_staff_acceptances WHERE merchant_id=? AND source_kind='escalation_relay' AND source_id=?",[r.merchant_id,r.id]);
  if(previous.length>1||previous.length&&!b)return unavailable();
  if(!b)return null; // Pre-migration attempts remain unmeasured, even if reconciled today.
  const transport=staffRelayTransport(b,d);
  if(previous.length){
    const s=readStaffAcceptance(previous[0]);
    if(s.basisDigest!==hash(b)||s.outboxId!==transport.outboxId||s.requestDigest!==transport.requestDigest||s.providerMessageDigest!==transport.providerMessageDigest)return unavailable();
    return s;
  }
  // A failed or queued outbox with a receipt alone cannot establish first acceptance.
  if(!['sent','delivered','read'].includes(d.status))return null;
  const [[clock]]=await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
  const observed=new Date(databaseTimeEpoch(clock.now)).toISOString();
  const s=staffAcceptanceSnapshot.parse({version:'sales-staff-transport-acceptance.v1',basis:b,basisDigest:hash(b),...transport,
    acceptanceObservedAt:observed,observationTiming:observed<b.reservedAt?'clock_regression':'ordered',timeBasis:'local_receipt_verification',scope:'provider_acceptance_only'});
  await c.execute(`INSERT INTO ai_sales_staff_acceptances
    (merchant_id,source_kind,source_id,customer_key,outbox_id,provider_message_digest,acceptance_digest,snapshot,acceptance_observed_at)
    VALUES (?,'escalation_relay',?,?,?,?,?,?,?)`,[b.merchantId,b.sourceId,b.customerKey,s.outboxId,s.providerMessageDigest,hash(s),JSON.stringify(s),observed.slice(0,23).replace('T',' ')]);
  return s;
}
