import {randomBytes} from 'node:crypto';
import type {PoolConnection} from 'mysql2/promise';
import {getPool} from './db/connection';
import {ALL_ROLES,hasPermission,type MerchantRole} from './_core/permissions';
import {promotionMutationInput,promotionWriteFields,type PromotionMutation} from '../shared/promotion-write';
import {PROMOTION_SELECT,PROMOTION_FIELDS} from './promotion-workspace-source';
import {databaseTimeEpoch} from './db/time';
export class PromotionWriteError extends Error{constructor(readonly reason:'forbidden'|'missing'|'invalid'|'limit'|'unavailable'|'unknown'|'code_scope'|'code_start'|'code_quantity'|'code_expired'|'stale'|'reused'|'cancelled'){super(`promotion_write:${reason}`);}}
const invalid=():never=>{throw new PromotionWriteError('invalid');};
export const promotionWriteRows=async(tx:PoolConnection,sql:string,args:any[]=[])=>{const [result]=await tx.execute(sql,args);if(!Array.isArray(result))throw new PromotionWriteError('unavailable');return result as any[];};
export const promotionEditable=['title','description','bannerImageUrl','type','value','scope','productIds','categoryIds','minOrderAmount','minQuantity','startsAt','expiresAt'] as const;
/** Date-only form values mean a Riyadh calendar day. Stored timestamps stay UTC. */
export function promotionWriteDate(value:unknown,end=false):string|null{
 if(value instanceof Date){if(!Number.isFinite(value.getTime()))return invalid();value=value.toISOString();}
 if(value===null||value===undefined)return null;if(typeof value!=='string')return invalid();
 const day=/^\d{4}-\d{2}-\d{2}$/.test(value),stored=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value);
 const candidate=day?value+(end?'T23:59:59+03:00':'T00:00:00+03:00'):stored?value.replace(' ','T')+'Z':value;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(candidate))return invalid();
 const epoch=Date.parse(candidate),dayPart=value.slice(0,10),calendar=new Date(dayPart+'T00:00:00Z');
 if(!Number.isFinite(epoch)||!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,10)!==dayPart)return invalid();
 const date=new Date(epoch);if(date.getUTCFullYear()<1971||date.getUTCFullYear()>2037)return invalid();return date.toISOString().slice(0,19).replace('T',' ');
}
export function normalizePromotionWrite(before:any,data:any){
 const result:any={title:null,description:null,bannerImageUrl:null,type:null,value:null,scope:'all',productIds:null,categoryIds:null,minOrderAmount:null,minQuantity:null,startsAt:null,expiresAt:null,...before};
 for(const k of promotionEditable)if(data[k]!==undefined)result[k]=data[k];
 result.startsAt=promotionWriteDate(result.startsAt);result.expiresAt=promotionWriteDate(result.expiresAt,true);
 if(!promotionWriteFields.safeParse(Object.fromEntries(promotionEditable.map(k=>[k,result[k]]))).success)return invalid();
 if(typeof result.title!=='string'||!result.title.trim()||result.title.length>255)return invalid();result.title=result.title.trim();
 if(result.type==='percentage'&&(!Number.isInteger(result.value)||result.value<1||result.value>100)||result.type==='fixed'&&(!Number.isInteger(result.value)||result.value<1||result.value>100000))return invalid();
 for(const [key,max,min] of [['value',100000,0],['minOrderAmount',1000000,0],['minQuantity',10000,1]] as const)if(result[key]!==null&&(!Number.isInteger(result[key])||result[key]<min||result[key]>max))return invalid();
 if(result.startsAt&&result.expiresAt&&databaseTimeEpoch(result.startsAt)>=databaseTimeEpoch(result.expiresAt))return invalid();
 if(result.bannerImageUrl!==null){try{const u=new URL(result.bannerImageUrl);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443'||!u.hostname.includes('.')||/[\[\]:]/.test(u.hostname)||/^[\d.]+$/.test(u.hostname)||/(?:\.local|\.localhost|\.internal|\.test)$/.test(u.hostname))return invalid();}catch{return invalid();}}
 const parse=(value:any)=>{if(value===null)return [];try{const list=JSON.parse(value);if(!Array.isArray(list)||list.length>1000||list.some(id=>!Number.isInteger(id)||id<=0||id>2147483647)||new Set(list).size!==list.length)return invalid();return list as number[];}catch{return invalid();}};
 const products=parse(result.productIds),categories=parse(result.categoryIds);
 if(result.scope==='products'&&products.length===0||result.scope==='categories'&&categories.length===0)return invalid();
 return {value:result,products,categories};
}
export async function checkPromotionTargets(tx:PoolConnection,merchantId:number,ids:number[],kind:'products'|'categories'){
 if(!ids.length)return;const table=kind==='products'?'products':'product_categories',column=kind==='products'?'merchantId':'merchant_id';
 const found=await promotionWriteRows(tx,`SELECT id FROM ${table} WHERE ${column}=? AND id IN (${ids.map(()=>'?').join(',')}) ORDER BY id FOR SHARE`,[merchantId,...ids]);
 if(found.length!==ids.length)return invalid();
}
function serializePromotion(row:any){return {...row,...Object.fromEntries(['startsAt','expiresAt','createdAt','updatedAt'].map(k=>[k,row[k]===null?null:new Date(databaseTimeEpoch(row[k])).toISOString().slice(0,19).replace('T',' ')]))};}
/** The current coupon schema cannot enforce product scope, a future start or quantity. */
export function assertPromotionCodeTerms(value:any,now=Date.now()){
 if(value.scope!=='all')throw new PromotionWriteError('code_scope');
 if(value.startsAt!==null&&databaseTimeEpoch(value.startsAt)>now)throw new PromotionWriteError('code_start');
 if(value.minQuantity!==null&&value.minQuantity>1)throw new PromotionWriteError('code_quantity');
 if(value.expiresAt!==null&&databaseTimeEpoch(value.expiresAt)<=now)throw new PromotionWriteError('code_expired');
}
/** Parent-first authority is shared by compatibility and reviewed writes. */
export async function withPromotionWriteTransaction<T>(actorId:number,merchantId:number,operation:(tx:PoolConnection)=>Promise<T>){
 let tx:PoolConnection|undefined,committing=false,reusable=true;
 try{
  if(![actorId,merchantId].every(id=>Number.isInteger(id)&&id>0&&id<=2147483647))throw new PromotionWriteError('forbidden');
  const pool=await getPool();if(!pool)throw new PromotionWriteError('unavailable');tx=await pool.getConnection();await tx.beginTransaction();
  const merchants=await promotionWriteRows(tx,'SELECT userId,status FROM merchants WHERE id=? FOR UPDATE',[merchantId]),users=await promotionWriteRows(tx,'SELECT account_status FROM users WHERE id=? FOR SHARE',[actorId]),members=await promotionWriteRows(tx,'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE',[merchantId,actorId]);
  const role=members.length===1&&members[0].is_active===1?members[0].role:members.length===0&&merchants[0]?.userId===actorId?'owner':null;
  if(merchants.length!==1||merchants[0].status!=='active'||users.length!==1||users[0].account_status!=='active'||!ALL_ROLES.includes(role)||!hasPermission(role as MerchantRole,'campaigns.manage'))throw new PromotionWriteError('forbidden');
  const result=await operation(tx);committing=true;await tx.commit();return result;
 }catch(error){if(committing)reusable=false;else if(tx)try{await tx.rollback();}catch{reusable=false;}if(committing)throw new PromotionWriteError('unknown');if(error instanceof PromotionWriteError)throw error;throw new PromotionWriteError('unavailable');}
 finally{if(tx){if(reusable)tx.release();else tx.destroy();}}
}

export async function inspectPromotionMutation(tx:PoolConnection,merchantId:number,input:PromotionMutation,source:any[]){
  let id=input.action==='create'?null:input.action==='update'?input.data.id:input.id;
  const before=id===null?null:source.find(r=>r.id===id);if(id!==null&&!before)throw new PromotionWriteError('missing');

  if(input.action==='delete'||input.action==='toggle'&&before.isActive===1)return {id,before,value:before,active:0};
  const normalized=normalizePromotionWrite(before,input.action==='toggle'?{}:input.data),value=normalized.value;
  const active=input.action==='create'?1:input.action==='toggle'?before.isActive===1?0:1:before.isActive;
  if(active!==0&&active!==1)return invalid();
  if(active===1){await checkPromotionTargets(tx,merchantId,normalized.products,'products');await checkPromotionTargets(tx,merchantId,normalized.categories,'categories');}
  const now=Date.now(),consumes=(r:any)=>r.isActive===1&&(!r.expiresAt||!Number.isFinite(databaseTimeEpoch(r.expiresAt))||databaseTimeEpoch(r.expiresAt)>now);
  if(consumes({...value,isActive:active})&&source.filter(r=>r.id!==id&&consumes(r)).length>=5)throw new PromotionWriteError('limit');

  if(input.action==='create'&&input.data.autoGenerateCode){assertPromotionCodeTerms(value,now);const type=input.data.autoCodeType??'percentage',amount=input.data.autoCodeValue;if(amount===undefined||amount<1||type==='percentage'&&amount>100)return invalid();}
  return {id,before,value,active};
}
export const lockedPromotionSource=(tx:PoolConnection,merchantId:number)=>promotionWriteRows(tx,`SELECT ${PROMOTION_SELECT} FROM promotions p WHERE p.merchant_id=? ORDER BY p.id FOR UPDATE`,[merchantId]);
export async function applyPromotionMutation(tx:PoolConnection,merchantId:number,input:PromotionMutation,source:any[]){
  let {id,before,value,active}=await inspectPromotionMutation(tx,merchantId,input,source);
  if(input.action==='delete'){
   // A saved link is not authority to delete a discount; other workflows may use it.
   const [deleted]=await tx.execute<any>('DELETE FROM promotions WHERE id=? AND merchant_id=?',[id,merchantId]);if(deleted.affectedRows!==1)throw new PromotionWriteError('missing');
   return {success:true as const,id:id!,retainedDiscount:before.autoDiscountCodeId!==null};
  }
  if(input.action==='toggle'&&before.isActive===1){
   await tx.execute('UPDATE promotions SET is_active=0,updated_at=UTC_TIMESTAMP() WHERE id=? AND merchant_id=?',[id,merchantId]);
   const result=(await promotionWriteRows(tx,`SELECT ${PROMOTION_SELECT} FROM promotions p WHERE p.id=? AND p.merchant_id=?`,[id,merchantId]))[0];if(!result)throw new PromotionWriteError('unavailable');const saved=serializePromotion(result);return saved;
  }
  let discountId=before?.autoDiscountCodeId??null;
  if(input.action==='create'&&input.data.autoGenerateCode){
   assertPromotionCodeTerms(value);
   const type=input.data.autoCodeType??'percentage',amount=input.data.autoCodeValue;
   if(amount===undefined||amount<1||type==='percentage'&&amount>100)return invalid();
   const [discount]=await tx.execute<any>("INSERT INTO discount_codes (merchantId,code,type,value,minOrderAmount,expiresAt,isActive,is_auto_generated) VALUES (?,?,?,?,?,?,1,1)",[merchantId,'PROMO'+randomBytes(12).toString('hex').toUpperCase(),type,amount,value.minOrderAmount??0,value.expiresAt]);
   discountId=Number(discount.insertId);if(!Number.isInteger(discountId)||discountId<=0)throw new PromotionWriteError('unavailable');
  }
  if(input.action==='create'){
   const columns=promotionEditable.map(k=>PROMOTION_FIELDS[k]);const [saved]=await tx.execute<any>(`INSERT INTO promotions (merchant_id,${columns.join(',')},is_active,auto_discount_code_id) VALUES (${Array.from({length:columns.length+3},()=>'?').join(',')})`,[merchantId,...promotionEditable.map(k=>value[k]),active,discountId]);id=Number(saved.insertId);if(saved.affectedRows!==1||!Number.isInteger(id)||id<=0)throw new PromotionWriteError('unavailable');
  }else{
   const [saved]=await tx.execute<any>(`UPDATE promotions SET ${promotionEditable.map(k=>PROMOTION_FIELDS[k]+'=?').join(',')},is_active=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND merchant_id=?`,[...promotionEditable.map(k=>value[k]),active,id,merchantId]);if(saved.affectedRows!==1)throw new PromotionWriteError('missing');
  }
  const result=(await promotionWriteRows(tx,`SELECT ${PROMOTION_SELECT} FROM promotions p WHERE p.id=? AND p.merchant_id=?`,[id,merchantId]))[0];if(!result)throw new PromotionWriteError('unavailable');
  const saved=serializePromotion(result);return saved;

}
export function writePromotion(actorId:number,merchantId:number,raw:PromotionMutation){
 const input=promotionMutationInput.parse(raw);return withPromotionWriteTransaction(actorId,merchantId,async tx=>applyPromotionMutation(tx,merchantId,input,await lockedPromotionSource(tx,merchantId)));
}
