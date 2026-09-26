import type { PoolConnection } from 'mysql2/promise';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { databaseTimeEpoch } from '../db/time';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { salesOrderFact,salesOrderIdentity,SalesOrderEvidenceConflict } from './sales-order-fact-contract';
const decode=(v:any)=>typeof v==='string'?JSON.parse(v):v;
export async function assertSalesOrderFactSchema() {
  await assertRuntimeSchema('verified sales order facts',[{table:'ai_sales_order_facts',
    columns:['merchant_id','quotation_id','provider','local_order_id','order_key','customer_key','fact_digest','snapshot','attribution_state','attribution_digest','attribution','attempts','next_at','last_error'],
    uniqueIndexes:[{name:'uq_sales_order_quote',columns:['merchant_id','quotation_id']},{name:'uq_sales_order_identity',columns:['merchant_id','order_key']},
      {name:'uq_sales_order_local',columns:['merchant_id','local_order_id']}],checkConstraints:['ck_sales_order_attribution']}]);
}
/** Only inside a NEW accepted local order or NEW verified Zid-result transition. No historical backfill on replay.
 * Reads server-owned agreement/result; no model/caller money, customer, external identity or observation clock.
 */
export async function recordSalesOrderFact(c:PoolConnection,merchantId:number,quotationId:number,origin:'local_agreement'|'zid_create_response'|'zid_get_reconciliation') {
  const [rows]=await c.execute<any[]>(`SELECT *,UTC_TIMESTAMP(3) AS observed_at FROM sales_quotations WHERE merchant_id=? AND id=? FOR UPDATE`,[merchantId,quotationId]);
  const q=rows[0];if(rows.length!==1||q.status!=='accepted'||!q.source_message_id||!q.consent_message_id)throw new SalesOrderEvidenceConflict();
  let identity:ReturnType<typeof salesOrderIdentity>,localOrderId:number|null=null,amount:number,agreement:any;
  if(origin==='local_agreement') {
    if(q.external_provider||!q.order_id||!q.checkout_snapshot)throw new SalesOrderEvidenceConflict();
    agreement=decode(q.checkout_snapshot);localOrderId=Number(q.order_id);
    const [orders]=await c.execute<any[]>('SELECT * FROM orders WHERE merchantId=? AND id=? FOR UPDATE',[merchantId,localOrderId]);
    const o=orders[0];
    if(orders.length!==1||o.sallaOrderId||o.customerPhone!==q.customer_phone||o.currency!=='SAR'||o.status!=='pending'||o.payment_status!=='unpaid'
      ||!o.checkout_review_required||Number(o.totalAmount)!==agreement.totalMinor)throw new SalesOrderEvidenceConflict();
    amount=Number(o.totalAmount);identity=salesOrderIdentity(merchantId,'local',String(merchantId),String(localOrderId));
  } else {
    if(q.external_provider!=='zid'||q.execution_state!=='succeeded'||q.order_id||!q.execution_attempt_id||!q.external_result||!q.external_snapshot)throw new SalesOrderEvidenceConflict();
    agreement=decode(q.external_snapshot);const result=decode(q.external_result),store=agreement?.options?.storeId;
    if(q.external_order_key!==`${store}:${result.id}`)throw new SalesOrderEvidenceConflict();
    identity=salesOrderIdentity(merchantId,'zid',store,String(result.id));amount=result.totalMinor;
  }
  const phone=String(q.customer_phone||'').replace(/^\+/,'');
  const s=salesOrderFact.parse({version:'sales-order-fact.v1',merchantId,quotationId,conversationId:Number(q.conversation_id),
    sourceMessageId:Number(q.source_message_id),consentMessageId:Number(q.consent_message_id),
    customerKey:/^[0-9]{8,15}$/.test(phone)?hash({version:'sales-experiment-customer.v1',merchantId,phone}):null,
    ...identity,localOrderId,agreementDigest:hash(agreement),quotedAmountMinor:amount,currency:q.currency,
    amountBasis:origin==='local_agreement'?'catalog_requires_billing_review':'zid_reported_invoice',
    observedAt:new Date(databaseTimeEpoch(q.observed_at)).toISOString(),timeBasis:'local_verified_creation',stage:'order_created',paymentEvidence:'not_measured',origin});
  await c.execute(`INSERT INTO ai_sales_order_facts (merchant_id,quotation_id,provider,local_order_id,order_key,customer_key,fact_digest,snapshot)
    VALUES (?,?,?,?,?,?,?,?)`,[merchantId,quotationId,s.provider,localOrderId,s.orderKey,s.customerKey,hash(s),JSON.stringify(s)]);
}
