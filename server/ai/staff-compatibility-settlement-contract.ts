import {z} from 'zod';
import {policyArtifactDigest as hash} from './learning-policy-evaluation-bundle';
import {parseStaffJson,staffReceiptDigest} from './sales-staff-acceptance-contract';

const id=z.number().int().positive().safe(),digest=z.string().regex(/^[a-f0-9]{64}$/);
export const compatibilitySettlement=z.object({version:z.literal('staff-compatibility-settlement.v1'),kind:z.enum(['text','voice']),
  outboxId:id,instanceRecordId:id,basisDigest:digest,requestDigest:digest,providerMessageDigest:digest,
  observedAt:z.string().datetime({precision:3}).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v),
  scope:z.literal('compatibility_result_only')}).strict();
export type CompatibilityDeliveryBasis={kind:'text'|'voice';merchantId:number;sourceId:number;instanceRecordId:number;basisDigest:string;
  phone:string;text?:string;mediaUrl?:string;fileName?:string};
export function compatibilityDeliveryKey(b:CompatibilityDeliveryBasis){return `staff_compat_${b.kind}:${b.merchantId}:${b.sourceId}`;}
export function compatibilityDeliveryRequest(b:CompatibilityDeliveryBasis){
  const guard={id:b.sourceId,basisDigest:b.basisDigest};
  return b.kind==='text'?{to:b.phone,kind:'text',text:b.text,staffCompatibilityGuard:guard}
    :{to:b.phone,kind:'audio',mediaUrl:b.mediaUrl,fileName:b.fileName,staffCompatibilityVoiceGuard:guard};
}
/** Match every stored request field; queued/failed receipts are never promoted by inference. */
export function readCompatibilityDelivery(b:CompatibilityDeliveryBasis,d:any,observedAt:string){
  const request=parseStaffJson(d.request_json),expected=compatibilityDeliveryRequest(b);
  if(!id.safeParse(Number(d.id)).success||Number(d.merchant_id)!==b.merchantId||Number(d.instance_id)!==b.instanceRecordId||d.provider!=='green_api'
    ||d.direction!=='outgoing'||d.idempotency_key!==compatibilityDeliveryKey(b)||hash(request)!==hash(expected))throw Error('Compatibility delivery mismatch');
  if(!['sent','delivered','read'].includes(d.status)||d.error_code!=null)return null;
  const receipt=typeof d.provider_message_id==='string'?d.provider_message_id:'';
  const proof=compatibilitySettlement.parse({version:'staff-compatibility-settlement.v1',kind:b.kind,outboxId:Number(d.id),instanceRecordId:b.instanceRecordId,
    basisDigest:b.basisDigest,requestDigest:hash(request),providerMessageDigest:staffReceiptDigest(b.merchantId,b.instanceRecordId,'green_api',receipt),observedAt,scope:'compatibility_result_only'});
  return {proof,receipt};
}
export function assertCompatibilitySettlement(value:unknown,b:CompatibilityDeliveryBasis){
  const proof=compatibilitySettlement.parse(value);
  if(proof.kind!==b.kind||proof.instanceRecordId!==b.instanceRecordId||proof.basisDigest!==b.basisDigest||proof.requestDigest!==hash(compatibilityDeliveryRequest(b)))throw Error('Compatibility settlement mismatch');
}
