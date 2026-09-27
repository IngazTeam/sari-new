import { z } from 'zod';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { parseStaffJson } from './sales-staff-acceptance-contract';
import {compatibilitySettlement,assertCompatibilitySettlement} from './staff-compatibility-settlement-contract';

const id=z.number().int().positive().safe(),digest=z.string().regex(/^[a-f0-9]{64}$/);
export const staffCompatibilityResult=z.object({success:z.literal(true),status:z.literal('accepted'),persisted:z.boolean()}).strict();
const legacySnapshot=z.object({
  version:z.literal('staff-text-compatibility.v1'),sourceId:id,merchantId:id,actorUserId:id,conversationId:id,
  requestId:z.string().uuid(),ownershipVersion:z.number().int().nonnegative().safe(),customerKey:digest,replyDigest:digest,
  scope:z.literal('unmeasured_compatibility'),result:staffCompatibilityResult.nullable(),
}).strict();
export const staffCompatibilityAuthority=z.object({source:z.enum(['registered','legacy']),recordId:id,accountDigest:digest}).strict();
export const staffCompatibilitySnapshot=z.discriminatedUnion('version',[
  legacySnapshot,legacySnapshot.extend({version:z.literal('staff-text-compatibility.v2'),ownershipVersion:id,authority:staffCompatibilityAuthority,
    reservedAt:z.string().datetime({precision:3}).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v),settlement:compatibilitySettlement.optional()}).strict(),
]);
export const staffCompatibilityCustomer=(merchantId:number,phone:string)=>hash({version:'staff-compatibility-customer.v1',merchantId,phone});
export function isStaffTextCompatibility(row:any){return ['staff-text-compatibility.v1','staff-text-compatibility.v2'].includes(parseStaffJson(row.basis)?.version);}
/** A compatibility result records the old sender's response, never verified provider acceptance. */
export function readStaffTextCompatibility(row:any){
  const raw=parseStaffJson(row.basis),s=staffCompatibilitySnapshot.parse(raw);
  if(hash(raw)!==row.basis_digest||hash(s)!==row.basis_digest||s.sourceId!==Number(row.id)||s.merchantId!==Number(row.merchant_id)
    ||s.actorUserId!==Number(row.actor_user_id)||s.conversationId!==Number(row.conversation_id)||s.requestId!==row.request_id
    ||s.ownershipVersion!==Number(row.ownership_version)||Number(row.instance_id)!==0||typeof row.customer_phone!=='string'
    ||s.customerKey!==staffCompatibilityCustomer(s.merchantId,row.customer_phone)||s.replyDigest!==hash(row.reply_text)
    ||row.next_reconcile_at!=null||row.provider_message_id!=null||row.projected_message_id!=null
    ||row.status!==(s.result?'accepted':'reserved'))throw Error('Staff compatibility evidence unavailable');
  if(s.version==='staff-text-compatibility.v2'&&s.settlement){
    if(!s.result||s.authority.source!=='registered')throw Error('Unsupported text settlement');
    const {settlement,...basis}=s;
    assertCompatibilitySettlement(settlement,{kind:'text',merchantId:s.merchantId,sourceId:s.sourceId,instanceRecordId:s.authority.recordId,
      basisDigest:hash({...basis,result:null}),phone:row.customer_phone,text:row.reply_text});
  }
  return s;
}
