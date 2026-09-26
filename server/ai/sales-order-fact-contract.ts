import { z } from 'zod';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
const id=z.number().int().positive().safe(), digest=z.string().regex(/^[a-f0-9]{64}$/);
const utc=z.string().datetime({precision:3}).refine(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s);
const reference=z.string().regex(/^[1-9][0-9]*$/).refine(s=>Number.isSafeInteger(Number(s)));
export class SalesOrderEvidenceConflict extends Error { constructor(){super('Sales order evidence unavailable');} }
export function salesOrderIdentity(merchantId:number,provider:'local'|'zid',account:string,orderReference:string) {
  id.parse(merchantId);z.enum(['local','zid']).parse(provider);reference.parse(orderReference);
  z.string().min(1).max(100).refine(s=>s.trim()===s&&!/[\u0000-\u001f\u007f]/.test(s)).parse(account);
  if(provider==='local'&&account!==String(merchantId))throw new SalesOrderEvidenceConflict();
  const accountKey=hash({version:'sales-order-account.v1',merchantId,provider,account});
  return {provider,accountKey,orderReference,orderKey:hash({version:'sales-order-identity.v1',merchantId,provider,accountKey,orderReference})};
}
export const salesOrderFact=z.object({
  version:z.literal('sales-order-fact.v1'),merchantId:id,quotationId:id,conversationId:id,sourceMessageId:id,consentMessageId:id,
  customerKey:digest.nullable(),provider:z.enum(['local','zid']),accountKey:digest,orderReference:reference,orderKey:digest,
  localOrderId:id.nullable(),agreementDigest:digest,quotedAmountMinor:z.number().int().nonnegative().safe(),currency:z.literal('SAR'),
  amountBasis:z.enum(['catalog_requires_billing_review','zid_reported_invoice']),observedAt:utc,
  timeBasis:z.literal('local_verified_creation'),stage:z.literal('order_created'),paymentEvidence:z.literal('not_measured'),
  origin:z.enum(['local_agreement','zid_create_response','zid_get_reconciliation']),
}).strict().superRefine((s,c)=>{
  const key=hash({version:'sales-order-identity.v1',merchantId:s.merchantId,provider:s.provider,accountKey:s.accountKey,orderReference:s.orderReference});
  if(s.orderKey!==key||s.sourceMessageId>=s.consentMessageId
    ||s.provider==='local'&&(s.localOrderId===null||String(s.localOrderId)!==s.orderReference||s.origin!=='local_agreement'||s.amountBasis!=='catalog_requires_billing_review'
      ||s.accountKey!==salesOrderIdentity(s.merchantId,'local',String(s.merchantId),s.orderReference).accountKey)
    ||s.provider==='zid'&&(s.localOrderId!==null||s.origin==='local_agreement'||s.amountBasis!=='zid_reported_invoice')) c.addIssue({code:'custom',message:'Invalid order identity evidence'});
});
export function readSalesOrderFact(row:any) {
  try {
    const raw=typeof row.snapshot==='string'?JSON.parse(row.snapshot):row.snapshot,s=salesOrderFact.parse(raw);
    if(hash(raw)!==row.fact_digest||hash(s)!==row.fact_digest||s.merchantId!==Number(row.merchant_id)||s.quotationId!==Number(row.quotation_id)
      ||s.orderKey!==row.order_key||s.customerKey!==row.customer_key||s.provider!==row.provider
      ||s.localOrderId!==(row.local_order_id===null?null:Number(row.local_order_id)))throw Error();
    return {factId:id.parse(Number(row.id)),factDigest:String(row.fact_digest),snapshot:s};
  }catch{throw new SalesOrderEvidenceConflict();}
}
export const salesOrderAttribution=z.object({
  version:z.literal('sales-order-attribution.v1'),merchantId:id,factId:id,factDigest:digest,quotationId:id,orderKey:digest,
  assignmentId:id,assignmentDigest:digest,protocolId:id,protocolDigest:digest,customerKey:digest,arm:z.enum(['baseline','candidate']),
  artifactDigest:digest,baselineDigest:digest,sectorDigest:digest,assignedAt:utc,observedAt:utc,observationEndsAt:utc,
  scope:z.literal('intention_to_treat_only'),outcome:z.literal('order_created_only'),revenueMinor:z.null(),humanAssistance:z.literal('unmeasured'),winner:z.null(),
}).strict().superRefine((s,c)=>{
  if(Date.parse(s.observedAt)<Date.parse(s.assignedAt)||Date.parse(s.observedAt)>=Date.parse(s.observationEndsAt))c.addIssue({code:'custom',message:'Order outside observation window'});
});
export function readSalesOrderAttribution(row:any) {
  try {
    const f=readSalesOrderFact(row),raw=typeof row.attribution==='string'?JSON.parse(row.attribution):row.attribution,a=salesOrderAttribution.parse(raw);
    if(row.attribution_state!=='attributed'||hash(raw)!==row.attribution_digest||hash(a)!==row.attribution_digest||a.factId!==f.factId||a.factDigest!==f.factDigest)throw Error();
    for(const key of ['merchantId','quotationId','orderKey','customerKey','observedAt'] as const)if(a[key]!==f.snapshot[key])throw Error();
    return a;
  }catch{throw new SalesOrderEvidenceConflict();}
}
