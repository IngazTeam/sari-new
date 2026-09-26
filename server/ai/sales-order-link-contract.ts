import { z } from 'zod';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { readSalesOrderFact, salesOrderIdentity, SalesOrderEvidenceConflict } from './sales-order-fact-contract';
import { zidOrderProjectionId } from '../integrations/zid-commerce-normalization';
const id=z.number().int().positive().safe(),digest=z.string().regex(/^[a-f0-9]{64}$/);
export const salesOrderLink=z.object({
  version:z.literal('zid-order-projection-link.v1'),merchantId:id,orderFactId:id,orderFactDigest:digest,
  orderKey:digest,sourceRowId:id,storeId:z.string().regex(/^[1-9]\d{0,19}$/),orderReference:z.string().regex(/^[1-9]\d*$/),
  localOrderId:id,projectionId:z.string().regex(/^zid:v2:[a-f0-9]{64}$/),
  linkedAt:z.string().datetime({precision:3}).refine(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s),
  identityBasis:z.literal('verified_zid_store_projection'),
}).strict();

/** A separate immutable identity attestation; it cannot rewrite creation or financial facts. */
export function readSalesOrderLink(row:any,orderRow:unknown) {
  try {
    const order=readSalesOrderFact(orderRow),f=order.snapshot;
    const raw=typeof row.snapshot==='string'?JSON.parse(row.snapshot):row.snapshot,s=salesOrderLink.parse(raw);
    const identity=salesOrderIdentity(s.merchantId,'zid',s.storeId,s.orderReference);
    if(hash(raw)!==row.link_digest||hash(s)!==row.link_digest||f.provider!=='zid'
      ||s.merchantId!==f.merchantId||s.orderFactId!==order.factId||s.orderFactDigest!==order.factDigest||s.orderKey!==f.orderKey
      ||identity.orderKey!==f.orderKey||identity.accountKey!==f.accountKey||s.orderReference!==f.orderReference
      ||s.projectionId!==zidOrderProjectionId(s.storeId,s.orderReference)||Date.parse(s.linkedAt)<Date.parse(f.observedAt)
      ||Number(row.merchant_id)!==s.merchantId||Number(row.order_fact_id)!==s.orderFactId||row.order_key!==s.orderKey
      ||Number(row.local_order_id)!==s.localOrderId||Number(row.source_row_id)!==s.sourceRowId||row.order_fact_digest!==s.orderFactDigest)throw Error();
    return {linkId:id.parse(Number(row.id)),linkDigest:String(row.link_digest),snapshot:s};
  }catch{throw new SalesOrderEvidenceConflict();}
}
