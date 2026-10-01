import {z} from 'zod';
export const serviceCatalogId=z.number().int().positive().max(2147483647);
export const serviceCatalogIds=z.array(serviceCatalogId).max(200).refine(ids=>new Set(ids).size===ids.length,'Duplicate references');
const uint=z.number().int().min(0).max(2147483647),money=uint.nullable(),name=z.string().trim().min(1).max(255),description=z.string().max(8000).nullable();
export const serviceCatalogDefinition=z.string().regex(/^[a-f0-9]{64}$/);
export const serviceCatalogServiceFields=z.object({
  name,description:description.default(null),category:z.string().max(100).nullable().default(null),categoryId:serviceCatalogId.nullable().default(null),
  priceType:z.enum(['fixed','variable','custom']),basePrice:money.default(null),minPrice:money.default(null),maxPrice:money.default(null),
  durationMinutes:z.number().int().min(1).max(1439),bufferTimeMinutes:z.number().int().min(0).max(1439).default(0),requiresAppointment:z.boolean().default(true),
  maxBookingsPerDay:uint.min(1).nullable().default(null),advanceBookingDays:uint.default(30),staffIds:serviceCatalogIds.default([]),displayOrder:uint.default(0),isActive:z.boolean().default(true),
}).strict();
export const serviceCatalogCategoryFields=z.object({name,nameEn:z.string().max(255).nullable().default(null),description:description.default(null),icon:z.string().max(100).nullable().default(null),color:z.string().regex(/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i).nullable().default(null),displayOrder:uint.default(0),isActive:z.boolean().default(true)}).strict();
export const serviceCatalogPackageFields=z.object({name,description:description.default(null),serviceIds:serviceCatalogIds.refine(ids=>ids.length>0,'Choose a service'),originalPrice:uint,packagePrice:uint,discountPercentage:z.number().int().min(0).max(100).optional(),isActive:z.boolean().default(true)}).strict();

// Zod applies defaults even inside partial objects. Strip them so an omitted edit never clears saved fields.
function patchFields<T extends z.ZodRawShape>(fields:T){
  const shape=Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,field instanceof z.ZodDefault?field.removeDefault():field])) as {[K in keyof T]:T[K] extends z.ZodDefault<infer Inner>?Inner:T[K]};
  return z.object(shape).partial();
}
export const serviceCatalogCreateService=serviceCatalogServiceFields;
export const serviceCatalogUpdateService=patchFields(serviceCatalogServiceFields.shape).extend({serviceId:serviceCatalogId,expectedDefinition:serviceCatalogDefinition.optional()}).strict();
export const serviceCatalogCreateCategory=serviceCatalogCategoryFields;
export const serviceCatalogUpdateCategory=patchFields(serviceCatalogCategoryFields.shape).extend({categoryId:serviceCatalogId,expectedDefinition:serviceCatalogDefinition.optional()}).strict();
export const serviceCatalogCreatePackage=serviceCatalogPackageFields;
export const serviceCatalogUpdatePackage=patchFields(serviceCatalogPackageFields.shape).extend({packageId:serviceCatalogId,expectedDefinition:serviceCatalogDefinition.optional()}).strict();

export function normalizeCatalogService(input:unknown){
  const value=serviceCatalogServiceFields.parse(input);
  if(value.priceType==='fixed'&&value.basePrice===null)throw new z.ZodError([{code:'custom',path:['basePrice'],message:'A fixed price is required'}]);
  if(value.priceType==='variable'&&(value.minPrice===null||value.maxPrice===null||value.maxPrice<value.minPrice))throw new z.ZodError([{code:'custom',path:['maxPrice'],message:'A valid price range is required'}]);
  return {...value,basePrice:value.priceType==='fixed'?value.basePrice:null,minPrice:value.priceType==='variable'?value.minPrice:null,maxPrice:value.priceType==='variable'?value.maxPrice:null};
}
export const normalizeCatalogCategory=(input:unknown)=>serviceCatalogCategoryFields.parse(input);
export function normalizeCatalogPackage(input:unknown){
  const value=serviceCatalogPackageFields.parse(input);
  if(value.packagePrice>value.originalPrice)throw new z.ZodError([{code:'custom',path:['packagePrice'],message:'Package price exceeds its original price'}]);
  return {...value,discountPercentage:value.originalPrice===0?0:Math.round((value.originalPrice-value.packagePrice)/value.originalPrice*100)};
}
export type ServiceCatalogService=z.output<typeof serviceCatalogServiceFields>;
export type ServiceCatalogCategory=z.output<typeof serviceCatalogCategoryFields>;
export type ServiceCatalogPackage=ReturnType<typeof normalizeCatalogPackage>;
