import {sql,type SQL} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from './db/connection';
import {serviceCatalogColumns,serviceCatalogTables,serviceCatalogDefinitionKey,type ServiceCatalogEntity} from './service-catalog-write';
import {serviceCatalogId,serviceCatalogIds,normalizeCatalogService,normalizeCatalogCategory,normalizeCatalogPackage} from '../shared/service-catalog-write';
import {catalogListInput,catalogRecordInput,catalogEditorInput,catalogChoicesInput,catalogWorkspaceSchema,catalogEditorSchema,catalogEditorContextSchema,catalogChoicesSchema,catalogRecordSchema,catalogPageSize,type CatalogRecord} from '../shared/service-catalog-workspace';
import {serviceDetailsInput,serviceDetailsSchema,serviceBookingStatus,serviceBookingDate,serviceBookingTime} from '../shared/service-details-workspace';

export class CatalogWorkspaceUnavailableError extends Error{constructor(){super('Catalog workspace unavailable');}}
export class CatalogRecordMissingError extends Error{constructor(){super('Catalog record not found');}}
type Row=Record<string,any>;
type Read=(query:SQL)=>Promise<Row[]>;
const integer=(value:unknown)=>{const result=Number(value);if(value==null||!Number.isSafeInteger(result)||result<0)throw new CatalogWorkspaceUnavailableError();return result;};
const one=(rows:Row[])=>{if(rows.length!==1)throw new CatalogWorkspaceUnavailableError();return rows[0];};
const table=(entity:ServiceCatalogEntity)=>sql.raw(serviceCatalogTables[entity]);
const projection=(entity:ServiceCatalogEntity)=>sql.raw('id,'+Object.entries(serviceCatalogColumns[entity]).map(([key,column])=>`\`${column}\` AS \`${key}\``).join(','));
async function snapshot<T>(actorId:number,merchantId:number,now:Date,callback:(read:Read,scope:{actorId:number;merchantId:number;canManage:boolean;checkedAt:string})=>Promise<T>){
 serviceCatalogId.parse(actorId);serviceCatalogId.parse(merchantId);if(!Number.isFinite(now.getTime()))throw new CatalogWorkspaceUnavailableError();
 try{const db=await getDb();if(!db)throw new CatalogWorkspaceUnavailableError();return await db.transaction(async tx=>{
  const read:Read=async query=>{const result=await tx.execute(query);if(!Array.isArray(result[0]))throw new CatalogWorkspaceUnavailableError();return result[0] as Row[];};
  if(integer(one(await read(sql`SELECT id FROM merchants WHERE id=${merchantId}`)).id)!==merchantId)throw new CatalogWorkspaceUnavailableError();
  return callback(read,{actorId,merchantId,canManage:false,checkedAt:now.toISOString()});
 },{isolationLevel:'repeatable read',accessMode:'read only'});}catch(error){if(error instanceof CatalogRecordMissingError)throw error;throw new CatalogWorkspaceUnavailableError();}
}
async function records(read:Read,entity:ServiceCatalogEntity,merchantId:number,rows:Row[]):Promise<CatalogRecord[]>{
 const result=rows.map(row=>{
  const {id,...stored}=row,fields={...stored};
  for(const field of ['isActive','requiresAppointment'])if(field in fields)fields[field]=fields[field]===1?true:fields[field]===0?false:null;
  for(const field of ['staffIds','serviceIds'])if(field in fields){try{fields[field]=serviceCatalogIds.parse(fields[field]===null&&field==='staffIds'?[]:JSON.parse(fields[field]));}catch{fields[field]=null;}}
  const issues:string[]=[];
  try{if(entity==='service')normalizeCatalogService(fields);else if(entity==='category')normalizeCatalogCategory(fields);else{const normalized=normalizeCatalogPackage({...fields,discountPercentage:fields.discountPercentage??undefined});if(normalized.discountPercentage!==fields.discountPercentage)issues.push('discountPercentage');}}
  catch(error){if(error instanceof z.ZodError)issues.push(...error.issues.map(issue=>String(issue.path[0]??'record')));else throw error;}
  return catalogRecordSchema.parse({entity,id:integer(id),definition:serviceCatalogDefinitionKey(entity,merchantId,integer(id),stored),fields,issues:Array.from(new Set(issues)),unavailableReferences:0});
 });
 const groups=[{kind:'category',table:'service_categories'},{kind:'staff',table:'staff_members'},{kind:'service',table:'services'}] as const;
 const references=(record:CatalogRecord,kind:string):number[]=>record.entity==='service'?(kind==='category'&&record.fields.categoryId!==null?[record.fields.categoryId]:kind==='staff'?record.fields.staffIds??[]:[]):record.entity==='package'&&kind==='service'?record.fields.serviceIds??[]:[];
 for(const group of groups){
  const ids=Array.from(new Set(result.flatMap(row=>references(row,group.kind))));if(!ids.length)continue;
  const available=new Map((await read(sql`SELECT id,name FROM ${sql.raw(group.table)} WHERE merchant_id=${merchantId} AND is_active=1 AND id IN (${sql.join(ids.map(id=>sql`${id}`),sql`,`)})`)).map(row=>[integer(row.id),String(row.name)]));
  for(const record of result){record.unavailableReferences+=references(record,group.kind).filter(id=>!available.has(id)).length;if(group.kind==='category'&&record.entity==='service')record.categoryName=available.get(record.fields.categoryId??0)??null;record.references.push(...references(record,group.kind).filter(id=>available.has(id)).map(id=>({kind:group.kind,id,name:available.get(id)!})));}
 }
 return result;
}
/** Counts, rows, and reference availability use the same tenant-scoped read snapshot. */
export async function readCatalogWorkspace(actorId:number,merchantId:number,input:unknown,now=new Date()){
 const selection=catalogListInput.parse(input),entity=selection.entity;
 return snapshot(actorId,merchantId,now,async(read,scope)=>{
  const totals=one(await read(sql`SELECT COUNT(*) AS total,COALESCE(SUM(is_active=1),0) AS active,COALESCE(SUM(is_active=0),0) AS inactive FROM ${table(entity)} WHERE merchant_id=${merchantId}`));
  const total=integer(totals.total),active=integer(totals.active),inactive=integer(totals.inactive);
  const where=sql`merchant_id=${merchantId} AND (${selection.status}='all' OR (${selection.status}='active' AND is_active=1) OR (${selection.status}='inactive' AND is_active=0) OR (${selection.status}='unknown' AND (is_active IS NULL OR is_active NOT IN (0,1)))) AND (${selection.search}='' OR LOCATE(LOWER(${selection.search}),LOWER(name))>0)`;
  const matched=integer(one(await read(sql`SELECT COUNT(*) AS total FROM ${table(entity)} WHERE ${where}`)).total);
  const source=await read(sql`SELECT ${projection(entity)} FROM ${table(entity)} WHERE ${where} ORDER BY id DESC LIMIT ${catalogPageSize} OFFSET ${(selection.page-1)*catalogPageSize}`);
  return catalogWorkspaceSchema.parse({...scope,selection,summary:{total,active,inactive,unknown:total-active-inactive},pagination:{page:selection.page,pageSize:catalogPageSize,total:matched,pages:Math.ceil(matched/catalogPageSize)},rows:await records(read,entity,merchantId,source)});
 });
}
export async function readCatalogRecord(actorId:number,merchantId:number,input:unknown,now=new Date()){
 const selection=catalogRecordInput.parse(input);
 return snapshot(actorId,merchantId,now,async(read,scope)=>{
  const rows=await read(sql`SELECT ${projection(selection.entity)} FROM ${table(selection.entity)} WHERE id=${selection.id} AND merchant_id=${merchantId}`);
  if(!rows.length)throw new CatalogRecordMissingError();
  return catalogEditorSchema.parse({...scope,selection,record:(await records(read,selection.entity,merchantId,rows))[0]});
 });
}
export async function readCatalogChoices(actorId:number,merchantId:number,input:unknown,now=new Date()){
 const selection=catalogChoicesInput.parse(input),name=selection.kind==='staff'?'staff_members':selection.kind==='category'?'service_categories':'services';
 return snapshot(actorId,merchantId,now,async(read,scope)=>{
  const where=sql`merchant_id=${merchantId} AND is_active=1 AND (${selection.search}='' OR LOCATE(LOWER(${selection.search}),LOWER(name))>0)`;
  const total=integer(one(await read(sql`SELECT COUNT(*) AS total FROM ${sql.raw(name)} WHERE ${where}`)).total);
  const rows=await read(sql`SELECT id,name FROM ${sql.raw(name)} WHERE ${where} ORDER BY id DESC LIMIT ${catalogPageSize} OFFSET ${(selection.page-1)*catalogPageSize}`);
  return catalogChoicesSchema.parse({...scope,selection,pagination:{page:selection.page,pageSize:catalogPageSize,total,pages:Math.ceil(total/catalogPageSize)},rows});
 });
}
export async function readCatalogEditor(actorId:number,merchantId:number,input:unknown,now=new Date()){
 const selection=catalogEditorInput.parse(input);
 if(selection.id!==undefined){const data=await readCatalogRecord(actorId,merchantId,selection,now);return catalogEditorContextSchema.parse(data);}
 return snapshot(actorId,merchantId,now,async(_read,scope)=>catalogEditorContextSchema.parse({...scope,selection,record:null}));
}

/** Service definition, aggregates and recent bookings share one read-only RR snapshot. */
export async function readServiceDetails(actorId:number,merchantId:number,input:unknown,now=new Date()){
 const selection=serviceDetailsInput.parse(input),id=selection.serviceId;
 return snapshot(actorId,merchantId,now,async(read,scope)=>{
  const source=await read(sql`SELECT ${projection('service')} FROM services WHERE id=${id} AND merchant_id=${merchantId}`);
  if(!source.length)throw new CatalogRecordMissingError();
  const service=(await records(read,'service',merchantId,source))[0];
  const counts={pending:0,confirmed:0,in_progress:0,completed:0,cancelled:0,no_show:0,unknown:0};
  for(const row of await read(sql`SELECT status,COUNT(*) AS count FROM bookings WHERE merchant_id=${merchantId} AND service_id=${id} GROUP BY status`)){
   const status=serviceBookingStatus.safeParse(row.status);counts[status.success?status.data:'unknown']+=integer(row.count);
  }
  const paid=one(await read(sql`SELECT COUNT(*) AS eligible,COALESCE(SUM(CASE WHEN final_price IS NULL OR final_price<0 THEN 1 ELSE 0 END),0) AS invalid,COALESCE(SUM(CASE WHEN final_price>=0 THEN final_price ELSE 0 END),0) AS amount FROM bookings WHERE merchant_id=${merchantId} AND service_id=${id} AND status='completed' AND payment_status='paid'`));
  const invalid=integer(paid.invalid),total=Object.values(counts).reduce((a,n)=>a+n,0);
  const recentSource=await read(sql`SELECT id,customer_name AS customerName,customer_phone AS customerPhone,DATE_FORMAT(booking_date,'%Y-%m-%d') AS date,start_time AS startTime,end_time AS endTime,duration_minutes AS durationMinutes,status,payment_status AS paymentStatus,final_price AS finalPrice FROM bookings WHERE merchant_id=${merchantId} AND service_id=${id} ORDER BY booking_date DESC,id DESC LIMIT 10`);
  const nullable=<T>(schema:z.ZodType<T>,value:unknown):T|null=>{const checked=schema.safeParse(value);return checked.success?checked.data:null;};
  const recent=recentSource.map(row=>({...row,id:integer(row.id),date:nullable(serviceBookingDate,row.date),startTime:nullable(serviceBookingTime,row.startTime),endTime:nullable(serviceBookingTime,row.endTime),durationMinutes:nullable(z.number().int().min(1).max(1439),row.durationMinutes),status:nullable(serviceBookingStatus,row.status)??'unknown',paymentStatus:nullable(z.enum(['unpaid','paid','refunded']),row.paymentStatus)??'unknown',finalPrice:nullable(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),row.finalPrice)}));
  // Invalid public ratings are counted, but foreign/private ratings and raw review content are not returned.
  const ratingRows=await read(sql`SELECT CASE WHEN b.id IS NOT NULL AND r.overall_rating BETWEEN 1 AND 5 THEN r.overall_rating ELSE 0 END AS rating,COUNT(*) AS count FROM booking_reviews r LEFT JOIN bookings b ON b.id=r.booking_id AND b.merchant_id=${merchantId} AND b.service_id=${id} WHERE r.merchant_id=${merchantId} AND r.service_id=${id} AND r.is_public=1 GROUP BY rating`);
  const distribution={one:0,two:0,three:0,four:0,five:0},keys=['one','two','three','four','five'] as const;let excluded=0;
  for(const row of ratingRows){const count=integer(row.count),rating=Number(row.rating);if(Number.isInteger(rating)&&rating>=1&&rating<=5)distribution[keys[rating-1]]+=count;else excluded+=count;}
  return serviceDetailsSchema.parse({...scope,selection,service,bookings:{total,counts,paidValue:{minor:invalid?null:integer(paid.amount),eligible:integer(paid.eligible),invalid}},recent,ratings:{total:Object.values(distribution).reduce((a,n)=>a+n,0),excluded,distribution}});
 });
}
