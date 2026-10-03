import type {PoolConnection} from 'mysql2/promise';
import {promotionTargetNamesInput,promotionTargetNamesResult,promotionNamedTargets} from '../shared/promotion-target-names';
import {promotionWorkspaceInput} from '../shared/promotion-workspace';
import {PROMOTION_READ_SELECT,withPromotionReadTransaction,promotionReadRows as rows} from './promotion-workspace-store';
import {projectPromotionWorkspace} from './promotion-workspace-source';
async function names(tx:PoolConnection,merchantId:number,kind:'products'|'categories',ids:number[]|null){
 if(!ids?.length)return {ids,choices:[],missingIds:[]};
 const products=kind==='products',table=products?'products':'product_categories',owner=products?'merchantId':'merchant_id',other=products?'nameAr':'name_en',active=products?'isActive':'is_active';
 const found=await rows(tx,`SELECT id,name,${other} AS alternateName,${active} AS active FROM ${table} WHERE ${owner}=? AND id IN (${ids.map(()=>'?').join(',')})`,[merchantId,...ids]);
 const text=(v:unknown)=>typeof v==='string'&&v.trim()&&v.length<=255?v:null;
 const choices=found.map(r=>({id:r.id,name:text(r.name),alternateName:text(r.alternateName),active:r.active===1?true:r.active===0?false:null}));
 return promotionNamedTargets.parse({ids,choices,missingIds:ids.filter(id=>!choices.some(r=>r.id===id))});
}
/** Read access can resolve only identifiers already stored on this exact tenant offer. */
export function readPromotionTargetNames(actorId:number,merchantId:number,input:unknown){
 const selection=promotionTargetNamesInput.parse(input);
 return withPromotionReadTransaction(actorId,merchantId,async(tx,canManage)=>{
  const now=new Date(),identity={actorId,merchantId,input:selection,checkedAt:now.toISOString()};
  const source=await rows(tx,`${PROMOTION_READ_SELECT} WHERE p.merchant_id=? AND p.id=?`,[merchantId,selection.id]);
  const row=projectPromotionWorkspace(actorId,merchantId,canManage,promotionWorkspaceInput.parse({}),source,now).rows[0];
  if(!row||row.revision!==selection.revision)return promotionTargetNamesResult.parse({...identity,state:row?'changed':'missing',products:null,categories:null});
  const products=await names(tx,merchantId,'products',row.productIds===null&&!row.issues.includes('products')?[]:row.productIdsParsed);
  const categories=await names(tx,merchantId,'categories',row.categoryIds===null&&!row.issues.includes('categories')?[]:row.categoryIdsParsed);
  return promotionTargetNamesResult.parse({...identity,state:'ready',products,categories});
 });
}
