import {z} from 'zod';
import {policyArtifactDigest as hash} from './learning-policy-evaluation-bundle';

const id=z.number().int().positive().safe(),digest=z.string().regex(/^[a-f0-9]{64}$/);
const receipt=z.string().regex(/^[^\s<>\x00-\x1f\x7f]{1,255}$/);
export const legacyStaffDelivery=z.object({version:z.literal('staff-legacy-delivery.v1'),kind:z.enum(['text','voice']),
  merchantId:id,sourceId:id,connectionId:id,accountDigest:digest,basisDigest:digest,requestDigest:digest,
  provider:z.literal('green_api'),providerMessageId:receipt,
  observedAt:z.string().datetime({precision:3}).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v),
  scope:z.literal('compatibility_result_only')}).strict();
export type LegacyStaffDeliveryBasis={kind:'text'|'voice';merchantId:number;sourceId:number;connectionId:number;accountDigest:string;
  basisDigest:string;phone:string;text?:string;mediaUrl?:string;fileName?:string};
const request=(b:LegacyStaffDeliveryBasis)=>b.kind==='text'?{kind:'text',to:b.phone,text:b.text}
  :{kind:'audio',to:b.phone,mediaUrl:b.mediaUrl,fileName:b.fileName};
/** Accept only an unambiguous provider acknowledgement, never a truthy flag or receipt alone. */
export function acceptedLegacyReceipt(value:unknown):string|null{
  const result=z.object({accepted:z.literal(true),status:z.enum(['sent','delivered','read']),providerMessageId:receipt,
    outcome:z.literal('accepted').optional(),errorCode:z.null().optional(),errorMessage:z.null().optional()}).safeParse(value);
  return result.success?result.data.providerMessageId:null;
}
export function createLegacyStaffDelivery(b:LegacyStaffDeliveryBasis,providerMessageId:string,observedAt:string){
  return legacyStaffDelivery.parse({version:'staff-legacy-delivery.v1',kind:b.kind,merchantId:b.merchantId,sourceId:b.sourceId,
    connectionId:b.connectionId,accountDigest:b.accountDigest,basisDigest:b.basisDigest,requestDigest:hash(request(b)),
    provider:'green_api',providerMessageId,observedAt,scope:'compatibility_result_only'});
}
/** Consistency binding, not a signature against a database administrator rewriting every field. */
export function assertLegacyStaffDelivery(value:unknown,b:LegacyStaffDeliveryBasis){
  const proof=legacyStaffDelivery.parse(value);
  if(hash(proof)!==hash(createLegacyStaffDelivery(b,proof.providerMessageId,proof.observedAt)))throw Error('Legacy delivery mismatch');
  return proof;
}
