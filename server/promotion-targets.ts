import {promotionTargetSelection,promotionTargetChoices} from '../shared/promotion-targets';
import {withPromotionWriteTransaction,promotionWriteRows as rows} from './promotion-writes';
export function readPromotionTargets(actorId:number,merchantId:number,input:unknown){
 const selection=promotionTargetSelection.parse(input);
 return withPromotionWriteTransaction(actorId,merchantId,async tx=>{
  const products=selection.kind==='products',table=products?'products':'product_categories',owner=products?'merchantId':'merchant_id',other=products?'nameAr':'name_en',active=products?'isActive':'is_active';
  const filter=`${owner}=? AND (LOCATE(?,name)>0 OR LOCATE(?,${other})>0 OR CAST(id AS CHAR)=?)`,args=[merchantId,selection.query,selection.query,selection.query];
  const count=await rows(tx,`SELECT COUNT(*) AS total FROM ${table} WHERE ${filter}`,args),total=count[0]?.total;
  // Page and size are validated integers; literal LIMIT avoids mysql2 parameter type ambiguity.
  const select=`SELECT id,name,${other} AS alternateName,${active} AS active FROM ${table}`;
  const found=await rows(tx,`${select} WHERE ${filter} ORDER BY id DESC LIMIT 25 OFFSET ${(selection.page-1)*25}`,args);
  const selected=selection.selectedIds.length?await rows(tx,`${select} WHERE ${owner}=? AND id IN (${selection.selectedIds.map(()=>'?').join(',')}) ORDER BY id`,[merchantId,...selection.selectedIds]):[];
  const text=(v:unknown)=>typeof v==='string'&&v.trim()&&v.length<=255?v:null;
  const project=(r:any)=>({id:r.id,name:text(r.name),alternateName:text(r.alternateName),active:r.active===1?true:r.active===0?false:null});
  return promotionTargetChoices.parse({actorId,merchantId,selection,total,pages:Math.ceil(total/25),pageSize:25,rows:found.map(project),selected:selected.map(project),missingIds:selection.selectedIds.filter(id=>!selected.some(r=>r.id===id))});
 });
}
