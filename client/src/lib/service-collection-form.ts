import {z} from 'zod';
import {majorToMinor} from '@shared/product-money';
import {normalizeCatalogCategory,normalizeCatalogPackage,type ServiceCatalogCategory,type ServiceCatalogPackage} from '@shared/service-catalog-write';
import type {CatalogRecord} from '@shared/service-catalog-workspace';
export type CollectionEntity='category'|'package';
export type CollectionRecord=Extract<CatalogRecord,{entity:CollectionEntity}>;
export type CollectionDraft={name:string;description:string;nameEn:string;icon:string;color:string;displayOrder:string;isActive:boolean|null;serviceIds:number[]|null;originalPrice:string;packagePrice:string};
export const newCollectionDraft:CollectionDraft={name:'',description:'',nameEn:'',icon:'',color:'',displayOrder:'0',isActive:true,serviceIds:[],originalPrice:'',packagePrice:''};
export function collectionDraftFromRecord(record:CollectionRecord):CollectionDraft{
 const f=record.fields,base={...newCollectionDraft,name:f.name,description:f.description??'',isActive:f.isActive};
 if(record.entity==='category'){const c=record.fields;return {...base,nameEn:c.nameEn??'',icon:c.icon??'',color:c.color??'',displayOrder:c.displayOrder===null?'':String(c.displayOrder)};}
 const p=record.fields,money=(n:number|null)=>n===null?'':(n/100).toFixed(2);return {...base,serviceIds:p.serviceIds,originalPrice:money(p.originalPrice),packagePrice:money(p.packagePrice)};
}
const decimal=(s:string)=>s.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/٫/g,'.');
export type CollectionValue={entity:'category';value:ServiceCatalogCategory}|{entity:'package';value:ServiceCatalogPackage};
export function parseCollectionDraft(entity:CollectionEntity,draft:CollectionDraft):{result:CollectionValue|null;errors:Partial<Record<keyof CollectionDraft,string>>}{
 const errors:Partial<Record<keyof CollectionDraft,string>>={},common={name:draft.name.trim(),description:draft.description.trim()||null,isActive:draft.isActive};
 const money=(key:'originalPrice'|'packagePrice')=>{try{return majorToMinor(decimal(draft[key]));}catch{errors[key]='money';return NaN;}};
 try{let result:CollectionValue;
  if(entity==='category'){const order=decimal(draft.displayOrder);if(!/^\d+$/.test(order))errors.displayOrder='integer';result={entity,value:normalizeCatalogCategory({...common,nameEn:draft.nameEn.trim()||null,icon:draft.icon.trim()||null,color:draft.color.trim()||null,displayOrder:/^\d+$/.test(order)?Number(order):NaN})};}
  else{const originalPrice=money('originalPrice'),packagePrice=money('packagePrice');if(packagePrice>originalPrice)errors.packagePrice='range';result={entity,value:normalizeCatalogPackage({...common,serviceIds:draft.serviceIds,originalPrice,packagePrice})};}
  return {result:Object.keys(errors).length?null:result,errors};
 }catch(error){if(!(error instanceof z.ZodError))throw error;for(const issue of error.issues)errors[issue.path[0] as keyof CollectionDraft]??='invalid';return {result:null,errors};}
}
