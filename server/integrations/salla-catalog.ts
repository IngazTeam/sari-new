import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { decryptSecret } from '../security/secrets';
import { assertSallaOrderAuthority,sallaAuthoritySchema,type SallaOrderAuthority } from './salla-order-projection';
import { sallaProductProjectionId,type NormalizedSallaProduct } from './salla-product-normalization';
import { sallaExternalId } from '../../shared/salla-sales-observations';
import { sallaExtractionProductSchema } from '../automation/salla-order-contract';
import { sallaOrderSku } from './salla-order-items';

const internal=z.number().int().positive().max(2147483647);
export type SallaCatalogReceipt={id:number;storeId:string;productId:string;token:string};
export type SallaCatalogGuard=(tx?:PoolConnection)=>Promise<void>;
const receiptSchema=z.object({id:internal,storeId:sallaExternalId,productId:sallaExternalId,token:z.string().min(1).max(64)}).strict();
export async function assertSallaCatalogSchema() {
  await assertRuntimeSchema('Salla product store identity',[{table:'salla_product_projections',
    columns:['merchant_id','store_id','external_product_id','local_product_id','connection_id','read_revision','archived','observed_at'],
    uniqueIndexes:[{name:'salla_product_scope',columns:['merchant_id','store_id','external_product_id']},{name:'salla_product_local',columns:['local_product_id']}],
    checkConstraints:['chk_salla_product_projection']}],{cacheSuccess:false});
}
export async function sallaCatalogAuthority(merchantId:number,accessToken:string,storeId?:string) {
  internal.parse(merchantId);await assertSallaCatalogSchema();const pool=await getPool();if(!pool)throw Error('Database unavailable');
  const [rows]=await pool.execute<any[]>('SELECT id,salla_store_id,accessToken FROM salla_connections WHERE merchantId=? AND syncStatus=\'active\'',[merchantId]);
  if(rows.length!==1||!accessToken||decryptSecret(rows[0].accessToken)!==accessToken||storeId!==undefined&&rows[0].salla_store_id!==storeId)throw Error('Salla catalog authority changed');
  return sallaAuthoritySchema.parse({merchantId,connectionId:rows[0].id,storeId:rows[0].salla_store_id,accessToken});
}
export async function assertCatalogReadAuthority(a:SallaOrderAuthority) {
  const pool=await getPool();if(!pool)throw Error('Database unavailable');await assertSallaOrderAuthority(pool,a);
}
async function transaction<T>(work:(c:PoolConnection)=>Promise<T>) {
  const pool=await getPool();if(!pool)throw Error('Database unavailable');const c=await pool.getConnection();let reusable=true,committing=false;
  try{await c.beginTransaction();const result=await work(c);committing=true;await c.commit();committing=false;return result;}
  catch(e){if(committing){reusable=false;c.destroy();}else{try{await c.rollback();}catch{reusable=false;c.destroy();}}throw e;}
  finally{if(reusable)c.release();}
}
async function assertReceipt(c:PoolConnection,a:SallaOrderAuthority,id:string,r:SallaCatalogReceipt) {
  receiptSchema.parse(r);if(r.storeId!==a.storeId||r.productId!==id)throw Error('Catalog receipt scope changed');
  const [rows]=await c.execute<any[]>(`SELECT id FROM salla_webhook_receipts WHERE id=? AND merchant_id=? AND salla_store_id=?
    AND resource_id=? AND event_type IN ('product.updated','product.quantity.updated','product.deleted') AND status='processing'
    AND effect_applied=0 AND processing_token=? AND claimed_at>DATE_SUB(NOW(3),INTERVAL 10 MINUTE) FOR UPDATE`,[r.id,a.merchantId,a.storeId,id,r.token]);
  if(rows.length!==1)throw Error('Catalog receipt lease lost');
}
/** A committed sync log ID fences older concurrent GETs. No backfill of bare IDs.
 * A tombstone without a local product still prevents an older response resurrecting it. */
export async function persistSallaCatalogRead(a:SallaOrderAuthority,revision:number,id:string,p:NormalizedSallaProduct|null,receipt?:SallaCatalogReceipt,guard?:SallaCatalogGuard) {
  sallaAuthoritySchema.parse(a);internal.parse(revision);sallaExternalId.parse(id);if(p&&p.externalId!==id)throw Error('Catalog identity mismatch');
  await assertSallaCatalogSchema();return transaction(async c=>{
    await guard?.(c);
    await assertSallaOrderAuthority(c,a,true);
    const [logs]=await c.execute<any[]>("SELECT id FROM sync_logs WHERE id=? AND merchantId=? AND status='in_progress' FOR SHARE",[revision,a.merchantId]);
    if(logs.length!==1)throw Error('Catalog read revision unavailable');
    if(receipt)await assertReceipt(c,a,id,receipt);
    const [bindings]=await c.execute<any[]>('SELECT * FROM salla_product_projections WHERE merchant_id=? AND store_id=? AND external_product_id=? FOR UPDATE',[a.merchantId,a.storeId,id]);
    const binding=bindings[0],alias=sallaProductProjectionId(a.storeId,id);let applied=false,localId:number|null=binding?.local_product_id??null;
    if(!binding||binding.read_revision<revision){
      if(localId!==null){
        const [targets]=await c.execute<any[]>('SELECT merchantId,sallaProductId FROM products WHERE id=? FOR UPDATE',[localId]);
        // A merchant may delete the local copy. A fresh verified read may recreate it,
        // but an existing row with changed ownership or alias must never be adopted.
        if(!targets.length)localId=null;
        else if(targets.length!==1||targets[0].merchantId!==a.merchantId||targets[0].sallaProductId!==alias)throw Error('Catalog projection conflict');
      }
      if(p){
        const fields=[p.name,p.description,p.price,p.currency,p.compareAtPrice,p.stock,p.trackInventory,p.isActive,p.status,p.productType,p.hasVariants,p.imageUrl,p.productUrl,p.category,p.sku];
        if(localId===null){
          const [created]=await c.execute<any>(`INSERT INTO products(merchantId,sallaProductId,name,description,price,currency,compare_at_price,stock,track_inventory,isActive,status,product_type,has_variants,imageUrl,productUrl,category,sku,price_unit,lastSyncedAt)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'minor',UTC_TIMESTAMP(3))`,[a.merchantId,alias,...fields]);localId=Number(created.insertId);
        }else await c.execute(`UPDATE products SET name=?,description=?,price=?,currency=?,compare_at_price=?,stock=?,track_inventory=?,isActive=?,status=?,product_type=?,has_variants=?,imageUrl=?,productUrl=?,category=?,sku=?,price_unit='minor',lastSyncedAt=UTC_TIMESTAMP(3) WHERE id=? AND merchantId=?`,[...fields,localId,a.merchantId]);
      }else if(localId!==null)await c.execute("UPDATE products SET status='archived',isActive=0,stock=0,lastSyncedAt=UTC_TIMESTAMP(3) WHERE id=? AND merchantId=?",[localId,a.merchantId]);
      if(binding)await c.execute('UPDATE salla_product_projections SET local_product_id=?,connection_id=?,read_revision=?,archived=?,observed_at=UTC_TIMESTAMP(3) WHERE id=?',[localId,a.connectionId,revision,p?0:1,binding.id]);
      else await c.execute(`INSERT INTO salla_product_projections(merchant_id,store_id,external_product_id,local_product_id,connection_id,read_revision,archived,observed_at) VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP(3))`,[a.merchantId,a.storeId,id,localId,a.connectionId,revision,p?0:1]);
      applied=true;
    }
    if(receipt){const [updated]=await c.execute<any>(`UPDATE salla_webhook_receipts SET effect_applied=1,notification_required=0,notification_status=NULL
      WHERE id=? AND merchant_id=? AND status='processing' AND processing_token=?`,[receipt.id,a.merchantId,receipt.token]);if(updated.affectedRows!==1)throw Error('Catalog receipt lease lost');}
    return {applied,localProductId:localId};
  });
}
export async function listSallaCatalogPage(a:SallaOrderAuthority,cursor:number) {
  const pool=await getPool();if(!pool)throw Error('Database unavailable');await assertSallaOrderAuthority(pool,a);
  const [rows]=await pool.execute<any[]>(`SELECT p.id,p.external_product_id FROM salla_product_projections p JOIN products o
    ON o.id=p.local_product_id AND o.merchantId=p.merchant_id AND o.sallaProductId=CONCAT('salla:',p.store_id,':',p.external_product_id)
    WHERE p.merchant_id=? AND p.store_id=? AND p.archived=0 AND p.id>? ORDER BY p.id LIMIT 500`,[a.merchantId,a.storeId,cursor]);return rows;
}
export async function finishSallaCatalogSync(a:SallaOrderAuthority,guard?:SallaCatalogGuard) {
  await transaction(async c=>{await guard?.(c);await assertSallaOrderAuthority(c,a,true);await c.execute('UPDATE salla_connections SET lastSyncAt=UTC_TIMESTAMP(),syncErrors=NULL WHERE id=?',[a.connectionId]);});
}
export const sallaProductSelectionSchema=z.object({productId:internal,externalId:sallaExternalId,revision:internal,quantity:internal,price:z.number().int().nonnegative().max(2147483647),name:z.string().min(1).max(255),sku:sallaOrderSku}).strict();
const selectionSchema=sallaProductSelectionSchema;
export type SallaProductSelection=z.infer<typeof selectionSchema>;
async function select(c:Pick<PoolConnection,'execute'>,a:SallaOrderAuthority,productId:number,quantity:number,lock=false) {
  internal.parse(productId);internal.parse(quantity);
  const [rows]=await c.execute<any[]>(`SELECT o.*,p.external_product_id,p.read_revision FROM salla_product_projections p JOIN products o
    ON o.id=p.local_product_id AND o.merchantId=p.merchant_id AND o.sallaProductId=CONCAT('salla:',p.store_id,':',p.external_product_id)
    WHERE p.merchant_id=? AND p.store_id=? AND p.connection_id=? AND p.local_product_id=? AND p.archived=0
      AND o.isActive=1 AND o.status='active' AND o.price_unit='minor' AND o.currency='SAR' AND o.has_variants=0
      AND (o.track_inventory=0 OR o.stock>=?) ${lock?'FOR SHARE':''}`,[a.merchantId,a.storeId,a.connectionId,productId,quantity]);
  if(rows.length!==1)throw Error('Salla product unavailable');const r=rows[0];
  const sku=sallaOrderSku.parse(r.sku);
  // Use the database's conservative comparison to reject case/accent aliases as
  // well as exact duplicate SKUs. Other stores and unrelated catalogue sources
  // cannot supply or disambiguate a Salla identity.
  const [aliases]=await c.execute<any[]>(`SELECT p.local_product_id FROM salla_product_projections p JOIN products o
    ON o.id=p.local_product_id AND o.merchantId=p.merchant_id AND o.sallaProductId=CONCAT('salla:',p.store_id,':',p.external_product_id)
    WHERE p.merchant_id=? AND p.store_id=? AND p.connection_id=? AND p.archived=0 AND o.sku=? ${lock?'FOR SHARE':''}`,
    [a.merchantId,a.storeId,a.connectionId,sku]);
  if(aliases.length!==1||aliases[0].local_product_id!==productId)throw Error('Ambiguous Salla SKU');
  return selectionSchema.parse({productId,quantity,externalId:r.external_product_id,revision:r.read_revision,price:r.price,name:r.name,sku});
}
export async function selectSallaOrderProduct(a:SallaOrderAuthority,productId:number,quantity:number) {
  await assertSallaCatalogSchema();const pool=await getPool();if(!pool)throw Error('Database unavailable');await assertSallaOrderAuthority(pool,a);return select(pool,a,productId,quantity);
}
/** Only currently verified, orderable products from this connection enter the
 * extraction prompt. Refuse an oversized catalogue rather than hiding ambiguity. */
export async function readSallaOrderExtractionCatalog(a:SallaOrderAuthority) {
  sallaAuthoritySchema.parse(a);await assertSallaCatalogSchema();
  return transaction(async c=>{
    const [merchants]=await c.execute<any[]>("SELECT id FROM merchants WHERE id=? AND status='active' FOR SHARE",[a.merchantId]);
    if(merchants.length!==1)throw Error('Merchant unavailable');
    await assertSallaOrderAuthority(c,a,true);
    const [rows]=await c.execute<any[]>(`SELECT o.id AS productId,o.name,o.price,o.sku,o.stock,o.track_inventory AS trackInventory,p.read_revision AS revision
      FROM salla_product_projections p JOIN products o ON o.id=p.local_product_id AND o.merchantId=p.merchant_id
        AND o.sallaProductId=CONCAT('salla:',p.store_id,':',p.external_product_id)
      WHERE p.merchant_id=? AND p.store_id=? AND p.connection_id=? AND p.archived=0
        AND o.isActive=1 AND o.status='active' AND o.price_unit='minor' AND o.currency='SAR' AND o.has_variants=0
        AND (o.track_inventory=0 OR o.stock>0) ORDER BY p.id LIMIT 501`,[a.merchantId,a.storeId,a.connectionId]);
    return z.array(sallaExtractionProductSchema).min(1).max(500).parse(rows);
  });
}
export async function assertSallaOrderSelection(c:PoolConnection,a:SallaOrderAuthority,input:SallaProductSelection[]) {
  const items=z.array(selectionSchema).min(1).max(100).parse(input);
  if(new Set(items.map(p=>p.productId)).size!==items.length)throw Error('Duplicate product selection');
  for(const p of items){const current=await select(c,a,p.productId,p.quantity,true);if(JSON.stringify(current)!==JSON.stringify(p))throw Error('Salla product selection changed');}
}
