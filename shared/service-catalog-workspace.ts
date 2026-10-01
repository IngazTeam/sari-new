import {z} from 'zod';
import {serviceCatalogId,serviceCatalogIds,serviceCatalogDefinition} from './service-catalog-write';

export const catalogEntity=z.enum(['service','category','package']);
export const catalogPageSize=24;
const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const page=z.number().int().min(1).max(1_000_000);
export const catalogListInput=z.object({entity:catalogEntity,search:z.string().trim().max(200).default(''),status:z.enum(['all','active','inactive','unknown']).default('all'),page:page.default(1)}).strict();
export const catalogRecordInput=z.object({entity:catalogEntity,id:serviceCatalogId}).strict();
export const catalogChoicesInput=z.object({kind:z.enum(['category','staff','service']),search:z.string().trim().max(200).default(''),page:page.default(1)}).strict();
const text=z.string().nullable(),number=z.number().int().nullable(),flag=z.boolean().nullable();
const common={name:z.string(),description:text,isActive:flag};
const metadata={id:serviceCatalogId,definition:serviceCatalogDefinition,issues:z.array(z.string()),unavailableReferences:count,categoryName:z.string().nullable().default(null)};
// Read stored values without converting corrupt/unknown selections into valid empty ones.
export const catalogRecordSchema=z.discriminatedUnion('entity',[
 z.object({...metadata,entity:z.literal('service'),fields:z.object({...common,category:text,categoryId:number,priceType:z.string(),basePrice:number,minPrice:number,maxPrice:number,durationMinutes:number,bufferTimeMinutes:number,requiresAppointment:flag,maxBookingsPerDay:number,advanceBookingDays:number,staffIds:serviceCatalogIds.nullable(),displayOrder:number}).strict()}).strict(),
 z.object({...metadata,entity:z.literal('category'),fields:z.object({...common,nameEn:text,icon:text,color:text,displayOrder:number}).strict()}).strict(),
 z.object({...metadata,entity:z.literal('package'),fields:z.object({...common,serviceIds:serviceCatalogIds.nullable(),originalPrice:number,packagePrice:number,discountPercentage:number}).strict()}).strict(),
]);
const scope={actorId:serviceCatalogId,merchantId:serviceCatalogId,canManage:z.boolean(),checkedAt:z.string().datetime()};
const pagination=z.object({page,pageSize:z.literal(catalogPageSize),total:count,pages:count}).strict();
export const catalogWorkspaceSchema=z.object({...scope,selection:catalogListInput,summary:z.object({total:count,active:count,inactive:count,unknown:count}).strict(),pagination,rows:z.array(catalogRecordSchema).max(catalogPageSize)}).strict().superRefine((value,ctx)=>{
 if(value.summary.total!==value.summary.active+value.summary.inactive+value.summary.unknown||value.pagination.total>value.summary.total||value.pagination.pages!==Math.ceil(value.pagination.total/catalogPageSize)||value.pagination.page!==value.selection.page||value.rows.some(row=>row.entity!==value.selection.entity||value.selection.status==='active'&&row.fields.isActive!==true||value.selection.status==='inactive'&&row.fields.isActive!==false||value.selection.status==='unknown'&&row.fields.isActive!==null)||new Set(value.rows.map(row=>row.id)).size!==value.rows.length||value.rows.length!==Math.min(catalogPageSize,Math.max(0,value.pagination.total-(value.selection.page-1)*catalogPageSize)))ctx.addIssue({code:'custom',message:'Inconsistent catalog page'});
});
export const catalogEditorSchema=z.object({...scope,selection:catalogRecordInput,record:catalogRecordSchema}).strict().refine(value=>value.record.id===value.selection.id&&value.record.entity===value.selection.entity,'Mismatched catalog record');
export const catalogChoicesSchema=z.object({...scope,selection:catalogChoicesInput,pagination,rows:z.array(z.object({id:serviceCatalogId,name:z.string()}).strict()).max(catalogPageSize)}).strict().refine(value=>value.pagination.page===value.selection.page&&value.pagination.pages===Math.ceil(value.pagination.total/catalogPageSize)&&new Set(value.rows.map(row=>row.id)).size===value.rows.length&&value.rows.length===Math.min(catalogPageSize,Math.max(0,value.pagination.total-(value.selection.page-1)*catalogPageSize)),'Inconsistent catalog choices');
export type CatalogRecord=z.infer<typeof catalogRecordSchema>;
export type CatalogWorkspace=z.infer<typeof catalogWorkspaceSchema>;
export type CatalogEditor=z.infer<typeof catalogEditorSchema>;
export type CatalogChoices=z.infer<typeof catalogChoicesSchema>;
export type CatalogSelection=z.infer<typeof catalogListInput>;
