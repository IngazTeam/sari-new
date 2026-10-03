import type {PoolConnection} from 'mysql2/promise';
import {getPool} from '../db/connection';
import {PROMOTION_SELECT} from '../promotion-workspace-source';
import {selectSalesPromotions,promotionEvidenceName,type SalesPromotionEvidence} from './promotion-evidence';
const rows=async(tx:PoolConnection,sql:string,args:Array<string|number>=[])=>{const [value]=await tx.execute(sql,args);if(!Array.isArray(value))throw Error('Promotion evidence unavailable');return value as any[];};
/** Current definitions and their named scope, read in one tenant snapshot; never cart/delivery authority. */
export async function loadSalesPromotionEvidence(merchantId:number):Promise<SalesPromotionEvidence[]>{
 if(!Number.isInteger(merchantId)||merchantId<=0||merchantId>2147483647)return [];
 let tx:PoolConnection|undefined,committing=false,reusable=true;
 try{
  const pool=await getPool();if(!pool)return [];tx=await pool.getConnection();await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await tx.beginTransaction();
  const merchant=await rows(tx,'SELECT userId,status FROM merchants WHERE id=? FOR SHARE',[merchantId]);
  if(merchant.length!==1||merchant[0].status!=='active'){await tx.rollback();return [];}
  const owner=await rows(tx,'SELECT account_status FROM users WHERE id=? FOR SHARE',[merchant[0].userId]);
  if(owner.length!==1||owner[0].account_status!=='active'){await tx.rollback();return [];}
  const now=Date.now(),stamp=new Date(now).toISOString().slice(0,19).replace('T',' ');
  // Legacy data may exceed the five-offer limit. Bound scanning, but do not let one bad scope hide the next valid offer.
  const source=await rows(tx,`SELECT ${PROMOTION_SELECT} FROM promotions p WHERE p.merchant_id=? AND p.is_active=1 AND (p.starts_at IS NULL OR p.starts_at<=?) AND (p.expires_at IS NULL OR p.expires_at>?) ORDER BY p.created_at DESC,p.id DESC LIMIT 100`,[merchantId,stamp,stamp]);
  const result:SalesPromotionEvidence[]=[];
  for(const raw of source){
   const offer=selectSalesPromotions([raw],{merchantId,now})[0];if(!offer)continue;
   if(offer.scope!=='all'){
    const products=offer.scope==='products',ids=products?offer.productIds:offer.categoryIds;
    const found=await rows(tx,`SELECT id,name,${products?'nameAr':'name_en'} AS alternateName,${products?'isActive':'is_active'} AS active FROM ${products?'products':'product_categories'} WHERE ${products?'merchantId':'merchant_id'}=? AND id IN (${ids.map(()=>'?').join(',')})`,[merchantId,...ids]);
    if(found.length!==ids.length||new Set(found.map(r=>r.id)).size!==ids.length||found.some(r=>!ids.includes(r.id)||r.active!==1||!promotionEvidenceName(r.name)&&!promotionEvidenceName(r.alternateName)))continue;
    const map=new Map(found.map(r=>[r.id,r]));offer.scopeTargets=ids.slice(0,20).map(id=>{const r=map.get(id)!;return {id,name:promotionEvidenceName(r.name),alternateName:promotionEvidenceName(r.alternateName)};});
    offer.scopeTargetEvidence='current_store_names';offer.scopeNamesTruncated=ids.length>20;
   }
   result.push(offer);if(result.length===5)break;
  }
  committing=true;await tx.commit();return result;
 }catch{if(committing)reusable=false;else if(tx)try{await tx.rollback();}catch{reusable=false;}throw Error('Promotion evidence unavailable');}
 finally{if(tx){if(reusable)tx.release();else tx.destroy();}}
}
