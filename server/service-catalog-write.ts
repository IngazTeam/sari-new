import {createHash} from 'node:crypto';
import type {PoolConnection,RowDataPacket,ResultSetHeader} from 'mysql2/promise';
import {z} from 'zod';
import {TRPCError} from '@trpc/server';
import {withBookingCapacityTransaction} from './booking-capacity';
import {serviceCatalogId,serviceCatalogDefinition,normalizeCatalogService,normalizeCatalogCategory,normalizeCatalogPackage} from '../shared/service-catalog-write';

export const serviceCatalogColumns={
  service:{name:'name',description:'description',category:'category',categoryId:'category_id',priceType:'price_type',basePrice:'base_price',minPrice:'min_price',maxPrice:'max_price',durationMinutes:'duration_minutes',bufferTimeMinutes:'buffer_time_minutes',requiresAppointment:'requires_appointment',maxBookingsPerDay:'max_bookings_per_day',advanceBookingDays:'advance_booking_days',staffIds:'staff_ids',displayOrder:'display_order',isActive:'is_active'},
  category:{name:'name',nameEn:'name_en',description:'description',icon:'icon',color:'color',displayOrder:'display_order',isActive:'is_active'},
  package:{name:'name',description:'description',serviceIds:'service_ids',originalPrice:'original_price',packagePrice:'package_price',discountPercentage:'discount_percentage',isActive:'is_active'},
} as const;
const columns=serviceCatalogColumns;
export type ServiceCatalogEntity=keyof typeof columns;
export const serviceCatalogTables={service:'services',category:'service_categories',package:'service_packages'} as const;
const tables=serviceCatalogTables;
export class ServiceCatalogWriteError extends TRPCError {
  constructor(public readonly reason:'missing'|'conflict'|'invalid'){super({code:reason==='missing'?'NOT_FOUND':reason==='conflict'?'CONFLICT':'BAD_REQUEST',message:'Service catalog '+reason});}
}
const writeFailure=(error:unknown):never=>{if(error instanceof ServiceCatalogWriteError)throw error;throw new TRPCError({code:'INTERNAL_SERVER_ERROR',message:'Service catalog write unavailable'});};
function storageValue(value:unknown):string|number|null{
  if(value==null)return null;if(Array.isArray(value))return JSON.stringify(value);if(typeof value==='boolean')return Number(value);
  if(typeof value==='string'||typeof value==='number')return value;throw new ServiceCatalogWriteError('invalid');
}
export function serviceCatalogDefinitionKey(entity:ServiceCatalogEntity,merchantId:number,id:number,record:Record<string,unknown>){
  return createHash('sha256').update(JSON.stringify([entity,merchantId,id,Object.keys(columns[entity]).map(key=>[key,record[key]??null])])).digest('hex');
}
function decode(entity:ServiceCatalogEntity,row:Record<string,unknown>){
  const data={...row};
  for(const key of ['isActive','requiresAppointment'])if(key in data){if(data[key]!==0&&data[key]!==1)throw new ServiceCatalogWriteError('invalid');data[key]=data[key]===1;}
  for(const key of ['staffIds','serviceIds'])if(key in data){try{data[key]=data[key]===null?[]:JSON.parse(String(data[key]));}catch{throw new ServiceCatalogWriteError('invalid');}}
  if(entity==='package'&&data.discountPercentage===null)delete data.discountPercentage;
  return data;
}
async function lockReferences(connection:PoolConnection,merchantId:number,data:Record<string,unknown>){
  const groups=[['service_categories',data.categoryId==null?[]:[data.categoryId]],['staff_members',data.staffIds??[]],['services',data.serviceIds??[]]] as const;
  for(const [table,values] of groups)for(const id of (values as number[]).slice().sort((a,b)=>a-b)){
    const [rows]=await connection.execute<RowDataPacket[]>(`SELECT id FROM ${table} WHERE id=? AND merchant_id=? AND is_active=1 FOR UPDATE`,[id,merchantId]);
    if(!rows.length)throw new ServiceCatalogWriteError('missing');
  }
}
/** Serialize catalog mutations with booking admission; lock and validate the merged record before changing it. */
export async function writeServiceCatalog(entity:ServiceCatalogEntity,merchantId:number,patch:Record<string,unknown>,id?:number,expectedDefinition?:string){
  serviceCatalogId.parse(merchantId);if(id!==undefined)serviceCatalogId.parse(id);if(expectedDefinition!==undefined)serviceCatalogDefinition.parse(expectedDefinition);
  if(!Object.hasOwn(tables,entity))throw new ServiceCatalogWriteError('invalid');
  const fields=Object.entries(patch).filter(([,value])=>value!==undefined);
  if(!fields.length||fields.some(([key])=>!Object.hasOwn(columns[entity],key)))throw new ServiceCatalogWriteError('invalid');
  return withBookingCapacityTransaction(merchantId,async connection=>{
    const entries=Object.entries(columns[entity]),table=tables[entity];let current:Record<string,unknown>={};
    if(id!==undefined){
      const [rows]=await connection.execute<RowDataPacket[]>(`SELECT ${entries.map(([key,column])=>`\`${column}\` AS \`${key}\``).join(',')} FROM ${table} WHERE id=? AND merchant_id=? FOR UPDATE`,[id,merchantId]);
      if(!rows.length)throw new ServiceCatalogWriteError('missing');
      current=rows[0];if(expectedDefinition!==undefined&&serviceCatalogDefinitionKey(entity,merchantId,id,current)!==expectedDefinition)throw new ServiceCatalogWriteError('conflict');
    }
    let data:Record<string,unknown>;
    try{
      // Parse JSON/flags after applying explicit repairs, so corrupt legacy selections can be replaced.
      const merged={...current,...Object.fromEntries(fields.map(([key,value])=>[key,Array.isArray(value)?JSON.stringify(value):typeof value==='boolean'?Number(value):value]))};
      const decoded=decode(entity,merged);
      data=entity==='service'?normalizeCatalogService(decoded):entity==='category'?normalizeCatalogCategory(decoded):normalizeCatalogPackage(decoded);
    }catch(error){if(error instanceof z.ZodError||error instanceof ServiceCatalogWriteError)throw new ServiceCatalogWriteError('invalid');throw error;}
    await lockReferences(connection,merchantId,data);
    const values=entries.map(([key])=>storageValue(data[key]));
    if(id===undefined){
      const [result]=await connection.execute<ResultSetHeader>(`INSERT INTO ${table} (merchant_id,${entries.map(([,column])=>`\`${column}\``).join(',')}) VALUES (${entries.map(()=>'?').concat('?').join(',')})`,[merchantId,...values]);
      const created=Number(result.insertId);serviceCatalogId.parse(created);return created;
    }
    await connection.execute<ResultSetHeader>(`UPDATE ${table} SET ${entries.map(([,column])=>`\`${column}\`=?`).join(',')} WHERE id=? AND merchant_id=?`,[...values,id,merchantId]);
    return id;
  }).catch(writeFailure);
}
/** Soft-deactivate without requiring broken legacy content to be repaired first. */
export async function archiveServiceCatalog(entity:ServiceCatalogEntity,merchantId:number,id:number,expectedDefinition?:string){
  serviceCatalogId.parse(merchantId);serviceCatalogId.parse(id);if(expectedDefinition!==undefined)serviceCatalogDefinition.parse(expectedDefinition);
  if(!Object.hasOwn(tables,entity))throw new ServiceCatalogWriteError('invalid');
  return withBookingCapacityTransaction(merchantId,async connection=>{
    const entries=Object.entries(columns[entity]),table=tables[entity];
    const [rows]=await connection.execute<RowDataPacket[]>(`SELECT ${entries.map(([key,column])=>`\`${column}\` AS \`${key}\``).join(',')} FROM ${table} WHERE id=? AND merchant_id=? FOR UPDATE`,[id,merchantId]);
    if(!rows.length)throw new ServiceCatalogWriteError('missing');
    if(expectedDefinition!==undefined&&serviceCatalogDefinitionKey(entity,merchantId,id,rows[0])!==expectedDefinition)throw new ServiceCatalogWriteError('conflict');
    await connection.execute(`UPDATE ${table} SET is_active=0 WHERE id=? AND merchant_id=?`,[id,merchantId]);
  }).catch(writeFailure);
}
