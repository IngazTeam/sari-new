import { z } from 'zod';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { databaseTimeEpoch } from '../db/time';
import { normalizeZidPhone,requireZidOrderStoreId,zidOrderProjectionId } from '../integrations/zid-commerce-normalization';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { readSalesOrderFact,salesOrderIdentity,SalesOrderEvidenceConflict } from './sales-order-fact-contract';
import { readSalesOrderLink,salesOrderLink } from './sales-order-link-contract';

export async function assertSalesOrderLinkSchema() {
  await assertRuntimeSchema('verified sales order projection links',[{table:'ai_sales_order_links',
    columns:['merchant_id','order_fact_id','order_fact_digest','order_key','source_row_id','local_order_id','link_digest','snapshot'],
    uniqueIndexes:[{name:'uq_sales_link_fact',columns:['merchant_id','order_fact_id']},
      {name:'uq_sales_link_order',columns:['merchant_id','order_key']},{name:'uq_sales_link_local',columns:['merchant_id','local_order_id']}]}]);
}

/** Invoked after a durable Zid result and source projection. Never creates orders,
 * payments or missing facts; a failed/uncertain link leaves projection repair pending.
 */
export async function linkZidOrderProjection(merchantId:number,quotationId:number,storeIdValue:unknown,orderReference:string) {
  z.number().int().positive().safe().parse(merchantId);z.number().int().positive().safe().parse(quotationId);
  const storeId=requireZidOrderStoreId(storeIdValue),identity=salesOrderIdentity(merchantId,'zid',storeId,orderReference);
  await assertSalesOrderLinkSchema();
  const pool=await getPool();if(!pool)throw Error('Order link storage unavailable');
  const c=await pool.getConnection();let reusable=true;
  try {
    await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');await c.beginTransaction();
    const [facts]=await c.execute<any[]>('SELECT * FROM ai_sales_order_facts WHERE merchant_id=? AND quotation_id=? FOR UPDATE',[merchantId,quotationId]);
    // Replaying a pre-evidence accepted quote must not manufacture a creation fact.
    if(!facts.length){await c.rollback();return {kind:'not_recorded' as const};}
    const f=readSalesOrderFact(facts[0]);
    if(f.snapshot.provider!=='zid'||f.snapshot.orderKey!==identity.orderKey)throw new SalesOrderEvidenceConflict();
    const [existing]=await c.execute<any[]>('SELECT * FROM ai_sales_order_links WHERE merchant_id=? AND order_fact_id=? FOR UPDATE',[merchantId,f.factId]);
    if(existing.length){const link=readSalesOrderLink(existing[0],facts[0]);await c.commit();return {kind:'linked' as const,linkId:link.linkId};}
    const [sources]=await c.execute<any[]>(`SELECT * FROM zid_orders WHERE merchant_id=? AND zid_store_id=? AND zid_order_id=?
      AND BINARY zid_order_id=BINARY ? FOR UPDATE`,[merchantId,storeId,orderReference,orderReference]);
    const s=sources[0];if(sources.length!==1||!s.sari_order_id)throw new SalesOrderEvidenceConflict();
    const [legacy]=await c.execute<any[]>("SELECT id FROM zid_orders WHERE merchant_id=? AND zid_order_id=? AND zid_store_id='' FOR SHARE",[merchantId,orderReference]);
    if(legacy.length)throw new SalesOrderEvidenceConflict();
    const [orders]=await c.execute<any[]>('SELECT * FROM orders WHERE merchantId=? AND id=? FOR UPDATE',[merchantId,s.sari_order_id]);
    const o=orders[0],projectionId=zidOrderProjectionId(storeId,orderReference);
    const customerKey=(v:unknown)=>{const phone=normalizeZidPhone(v);return phone?hash({version:'sales-experiment-customer.v1',merchantId,phone}):null;};
    if(orders.length!==1||o.sallaOrderId!==projectionId||!f.snapshot.customerKey
      ||customerKey(s.customer_phone)!==f.snapshot.customerKey||customerKey(o.customerPhone)!==f.snapshot.customerKey
      ||s.currency!==f.snapshot.currency||o.currency!==f.snapshot.currency
      ||Math.round(Number(s.total_amount)*100)!==f.snapshot.quotedAmountMinor||Number(o.totalAmount)!==f.snapshot.quotedAmountMinor)throw new SalesOrderEvidenceConflict();
    const [localFacts]=await c.execute<any[]>('SELECT id FROM ai_sales_order_facts WHERE merchant_id=? AND local_order_id=? FOR SHARE',[merchantId,o.id]);
    if(localFacts.length)throw new SalesOrderEvidenceConflict();
    const [[clock]]=await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
    const snapshot=salesOrderLink.parse({version:'zid-order-projection-link.v1',merchantId,orderFactId:f.factId,orderFactDigest:f.factDigest,
      orderKey:f.snapshot.orderKey,sourceRowId:Number(s.id),storeId,orderReference,localOrderId:Number(o.id),projectionId,
      linkedAt:new Date(databaseTimeEpoch(clock.now)).toISOString(),identityBasis:'verified_zid_store_projection'});
    const row={merchant_id:merchantId,order_fact_id:f.factId,order_fact_digest:f.factDigest,order_key:f.snapshot.orderKey,
      source_row_id:Number(s.id),local_order_id:Number(o.id),snapshot,link_digest:hash(snapshot)};
    readSalesOrderLink({id:1,...row},facts[0]);
    const [insert]=await c.execute<any>(`INSERT INTO ai_sales_order_links
      (merchant_id,order_fact_id,order_fact_digest,order_key,source_row_id,local_order_id,link_digest,snapshot) VALUES (?,?,?,?,?,?,?,?)`,
      [merchantId,f.factId,f.factDigest,f.snapshot.orderKey,s.id,o.id,row.link_digest,JSON.stringify(snapshot)]);
    await c.commit();return {kind:'linked' as const,linkId:Number(insert.insertId)};
  }catch(error){try{await c.rollback();}catch{reusable=false;c.destroy();}throw error;}
  finally{if(reusable)c.release();}
}
