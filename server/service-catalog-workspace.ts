import {sql,type SQL} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from './db/connection';
import {serviceCatalogColumns,serviceCatalogTables,serviceCatalogDefinitionKey,type ServiceCatalogEntity} from './service-catalog-write';
import {serviceCatalogId,serviceCatalogIds,normalizeCatalogService,normalizeCatalogCategory,normalizeCatalogPackage} from '../shared/service-catalog-write';
import {catalogListInput,catalogRecordInput,catalogChoicesInput,catalogWorkspaceSchema,catalogEditorSchema,catalogChoicesSchema,catalogRecordSchema,catalogPageSize,type CatalogRecord} from '../shared/service-catalog-workspace';

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
  const available=new Set((await read(sql`SELECT id FROM ${sql.raw(group.table)} WHERE merchant_id=${merchantId} AND is_active=1 AND id IN (${sql.join(ids.map(id=>sql`${id}`),sql`,`)})`)).map(row=>integer(row.id)));
  for(const record of result)record.unavailableReferences+=references(record,group.kind).filter(id=>!available.has(id)).length;
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
