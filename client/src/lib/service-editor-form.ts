import {z} from 'zod';
import {normalizeCatalogService,type ServiceCatalogService} from '@shared/service-catalog-write';
import {majorToMinor} from '@shared/product-money';
import type {CatalogRecord} from '@shared/service-catalog-workspace';
export type ServiceDraft={name:string;description:string;category:string;categoryId:number|null;priceType:string;basePrice:string;minPrice:string;maxPrice:string;durationMinutes:string;bufferTimeMinutes:string;requiresAppointment:boolean|null;maxBookingsPerDay:string;advanceBookingDays:string;staffIds:number[]|null;displayOrder:string;isActive:boolean|null};
export const newServiceDraft:ServiceDraft={name:'',description:'',category:'',categoryId:null,priceType:'fixed',basePrice:'',minPrice:'',maxPrice:'',durationMinutes:'60',bufferTimeMinutes:'0',requiresAppointment:true,maxBookingsPerDay:'',advanceBookingDays:'30',staffIds:[],displayOrder:'0',isActive:true};
export function serviceDraftFromRecord(record:Extract<CatalogRecord,{entity:'service'}>):ServiceDraft{
 const f=record.fields,text=(value:number|null)=>value===null?'':String(value),money=(value:number|null)=>value===null?'':(value/100).toFixed(2);
 return {...f,name:f.name,description:f.description??'',category:f.category??'',basePrice:money(f.basePrice),minPrice:money(f.minPrice),maxPrice:money(f.maxPrice),durationMinutes:text(f.durationMinutes),bufferTimeMinutes:text(f.bufferTimeMinutes),maxBookingsPerDay:text(f.maxBookingsPerDay),advanceBookingDays:text(f.advanceBookingDays),displayOrder:text(f.displayOrder)};
}
const decimalText=(value:string)=>value.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/٫/g,'.');
export function parseServiceDraft(draft:ServiceDraft):{value:ServiceCatalogService|null;errors:Partial<Record<keyof ServiceDraft,string>>}{
 const errors:Partial<Record<keyof ServiceDraft,string>>={},numeric=(key:keyof ServiceDraft,optional=false)=>{const text=decimalText(String(draft[key]));if(optional&&!text)return null;if(!/^\d+$/.test(text)){errors[key]='integer';return NaN;}return Number(text);};
 const money=(key:'basePrice'|'minPrice'|'maxPrice')=>{try{return majorToMinor(decimalText(draft[key]));}catch{errors[key]='money';return null;}};
 const data={...draft,name:draft.name.trim(),description:draft.description.trim()||null,category:draft.category.trim()||null,basePrice:draft.priceType==='fixed'?money('basePrice'):null,minPrice:draft.priceType==='variable'?money('minPrice'):null,maxPrice:draft.priceType==='variable'?money('maxPrice'):null,durationMinutes:numeric('durationMinutes'),bufferTimeMinutes:numeric('bufferTimeMinutes'),maxBookingsPerDay:numeric('maxBookingsPerDay',true),advanceBookingDays:numeric('advanceBookingDays'),displayOrder:numeric('displayOrder')};
 try{const value=normalizeCatalogService(data);return {value:Object.keys(errors).length?null:value,errors};}catch(error){if(!(error instanceof z.ZodError))throw error;for(const issue of error.issues){const key=issue.path[0] as keyof ServiceDraft;errors[key]??=key==='maxPrice'&&data.minPrice!==null&&data.maxPrice!==null&&data.maxPrice<data.minPrice?'range':'invalid';}return {value:null,errors};}
}
export function serviceRouteId(raw:string|undefined):number|undefined|null{if(raw===undefined)return undefined;if(!/^[1-9]\d*$/.test(raw)||Number(raw)>2147483647)return null;return Number(raw);}
