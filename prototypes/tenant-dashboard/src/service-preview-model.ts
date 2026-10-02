import {ByaanConnectionPreviewStore,byaanConnectionQueries,byaanConnectionMutations} from './byaan-connection-preview-model';
import {platformPreviewRead,platformPreviewQueries,platformPreviewMutations,type PlatformSample} from './platform-preview-model';
import {CalendarPreviewStore,calendarPreviewQueries,calendarPreviewMutations} from './calendar-preview-model';
import {BookingPreviewStore,bookingPreviewQueries,bookingPreviewMutations} from './booking-preview-model';
import {catalogListInput,catalogRecordInput,catalogEditorInput,catalogChoicesInput,catalogWorkspaceSchema,catalogEditorSchema,catalogEditorContextSchema,catalogChoicesSchema,type CatalogRecord} from '../../../shared/service-catalog-workspace';
import {normalizeCatalogService,normalizeCatalogCategory,normalizeCatalogPackage} from '../../../shared/service-catalog-write';
import {serviceDetailsInput,serviceDetailsSchema} from '../../../shared/service-details-workspace';
import {staffCatalogFields,staffCatalogUpdate,staffCatalogArchive} from '../../../shared/staff-catalog';
import {staffWorkspaceSnapshot} from '../../../shared/staff-workspace';
import {z} from 'zod';
export const serviceModes=['normal','empty','loading','failure','forbidden','session','foreign','stale-error','readonly','legacy','unavailable-reference','choices-error','action-failure','save-conflict','pending-save','uncertain-save','unlinked','oauth-disabled','destination-missing','credentials-invalid'] as const;
export type ServiceMode=typeof serviceModes[number];
export const serviceQueries=['auth.me','merchants.getCurrent','services.catalogWorkspace','services.catalogEditor','services.catalogChoices','services.detailsWorkspace','staff.list',...bookingPreviewQueries,...calendarPreviewQueries,...platformPreviewQueries,...byaanConnectionQueries] as const;
export const serviceMutations=['services.create','services.update','services.delete','serviceCategories.create','serviceCategories.update','serviceCategories.delete','servicePackages.create','servicePackages.update','servicePackages.delete','staff.create','staff.update','staff.delete',...bookingPreviewMutations,...calendarPreviewMutations,...platformPreviewMutations,...byaanConnectionMutations] as const;
type Entity=CatalogRecord['entity'];type Row={id:number;entity:Entity;fields:any;version:number};
const fault=(code='INTERNAL_SERVER_ERROR')=>({message:'Local service simulation',data:{code}});
const normalize={service:normalizeCatalogService,category:normalizeCatalogCategory,package:normalizeCatalogPackage};
/** Disposable, in-memory samples. No transport, actual bookings, or server writes. */
export class ServicePreviewModel{
 readonly actorId:number;operations=0;retries=0;pending=0;private revision=0;private recovered=false;private disposed=false;private nextId=32;
 private listeners=new Set<()=>void>();private cache=new Map<string,any>();private rows=new Map<string,Row>();private waiting:Array<{resolve:()=>void;reject:(e:any)=>void}>=[];
 private byaan:ByaanConnectionPreviewStore;private bookings:BookingPreviewStore;private calendar:CalendarPreviewStore;
 private staffRows=new Map<number,{fields:any;version:number}>();private nextStaffId=32;
 constructor(readonly merchantId:number,readonly mode:ServiceMode='normal',readonly now=new Date().toISOString(),readonly platformSample:PlatformSample='byaan'){
  if(![269,270].includes(merchantId))throw Error('Unknown simulated tenant');this.actorId=merchantId+1000;
  if(mode!=='empty')for(const entity of ['category','service','package'] as const)for(let id=1;id<=31;id++){
   const common={name:`${merchantId===269?'نواة · Nawa':'مدار · Madar'} ${entity} ${id}`,description:'بيانات محلية توضيحية · Local sample',isActive:id%5!==0};
   const fields=entity==='service'?normalizeCatalogService({...common,priceType:id%3===0?'custom':id%3===1?'fixed':'variable',basePrice:id===1?0:15000,minPrice:10000,maxPrice:20000,durationMinutes:45,categoryId:1,staffIds:[1],bufferTimeMinutes:15,advanceBookingDays:30}):entity==='category'?normalizeCatalogCategory({...common,nameEn:'Category '+id,icon:'🧑‍💻',color:'#527766'}):normalizeCatalogPackage({...common,serviceIds:[1,2],originalPrice:20000,packagePrice:15000});
   this.rows.set(entity+':'+id,{id,entity,fields,version:0});
  }
  if(mode!=='empty')for(let id=1;id<=31;id++)this.staffRows.set(id,{version:0,fields:{id,merchantId,name:`${merchantId===269?'نواة · Nawa':'مدار · Madar'} · مقدم خدمة ${id}`,phone:null,email:`provider${id}@example.test`,role:'استشارات · Consultant',workingHours:JSON.stringify({sunday:{start:'09:00',end:'17:00'}}),googleCalendarId:null,isActive:id%5===0?0:1,specialization:null,bio:null,avatar:null,serviceIds:null}});
  this.byaan=new ByaanConnectionPreviewStore(this.actorId,merchantId,now,mode,platformSample);
  this.calendar=new CalendarPreviewStore({actorId:this.actorId,merchantId,now,mode:()=>this.activeMode,reference:(kind,id)=>{const fields=kind==='staff'?this.staffRows.get(id)?.fields:this.rows.get('service:'+id)?.fields;return fields?{name:fields.name,isActive:kind==='staff'?fields.isActive===1:fields.isActive===true,...kind==='service'?{durationMinutes:fields.durationMinutes}:{}}:null;}});
  this.bookings=new BookingPreviewStore({actorId:this.actorId,merchantId,now,mode:()=>this.activeMode,reference:(kind,id)=>{const fields=kind==='staff'?this.staffRows.get(id)?.fields:this.rows.get('service:'+id)?.fields;return fields?{name:fields.name,isActive:kind==='staff'?fields.isActive===1:fields.isActive===true}:null;}});
 }
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};snapshot=()=>this.revision;
 private emit(){this.cache.clear();this.revision++;for(const listener of Array.from(this.listeners))listener();}
 invalidate=async()=>{this.emit();};get activeMode(){return this.recovered?'normal':this.mode;}
 complete=()=>{this.recovered=true;this.emit();};finishPending=()=>{for(const item of this.waiting.splice(0))item.resolve();};
 dispose=()=>{this.disposed=true;for(const item of this.waiting.splice(0))item.reject(fault('CONFLICT'));};
 async refetch(name:string,input?:any){this.retries++;this.complete();return this.read(name,input);}
 private owned(entity:Entity,id:number){const row=Number.isInteger(id)&&id>0?this.rows.get(entity+':'+id):undefined;if(!row)throw fault('NOT_FOUND');return row;}
 private scope(){return {actorId:this.actorId,merchantId:this.merchantId,canManage:this.activeMode!=='readonly',checkedAt:this.now};}
 // Version marker for local review only; the real server computes a SHA-256 definition digest.
 private definition(row:Row){return [this.merchantId,['service','category','package'].indexOf(row.entity),row.id,row.version,0,0,0,0].map(n=>n.toString(16).padStart(8,'0')).join('');}
 private choices(kind:string){return kind==='staff'?Array.from(this.staffRows.values()).filter(row=>row.fields.isActive===1).map(row=>({id:row.fields.id,name:row.fields.name})):Array.from(this.rows.values()).filter(r=>r.entity===kind&&r.fields.isActive).map(r=>({id:r.id,name:r.fields.name}));}
 private staffDefinition(id:number,version:number){return [this.merchantId,3,id,version,0,0,0,0].map(n=>n.toString(16).padStart(8,'0')).join('');}
 private staffSnapshot(){return staffWorkspaceSnapshot.parse({actorUserId:this.actorId,merchantId:this.merchantId,canManage:this.activeMode!=='readonly',staff:Array.from(this.staffRows.values()).map(row=>({...row.fields,...this.activeMode==='legacy'?{isActive:9,workingHours:'legacy format',bio:'نبذة محفوظة · Stored biography',serviceIds:'[1,2]',avatar:'saved-reference-only'}:{},definition:this.staffDefinition(row.fields.id,row.version)}))});}
 private saveStaff(name:string,input:any){
  const action=name.split('.')[1],parsed=action==='create'?staffCatalogFields.parse(input):action==='update'?staffCatalogUpdate.parse(input):staffCatalogArchive.parse(input);
  const {staffId,expectedDefinition,...patch}=parsed as any,current=action==='create'?null:this.staffRows.get(staffId);
  if(action!=='create'&&!current)throw fault('NOT_FOUND');if(current&&expectedDefinition!==this.staffDefinition(staffId,current.version))throw fault('CONFLICT');
  const id=current?.fields.id??this.nextStaffId++,fields=current?{...current.fields}:{id,merchantId:this.merchantId,name:'',phone:null,email:null,role:null,workingHours:null,googleCalendarId:null,isActive:1,specialization:null,bio:null,avatar:null,serviceIds:null};
  if(action==='delete')fields.isActive=0;else for(const [key,value] of Object.entries(patch))if(value!==undefined)fields[key]=key==='workingHours'?value==null?null:JSON.stringify(value):typeof value==='boolean'?Number(value):value===''?null:value;
  this.staffRows.set(id,{fields,version:(current?.version??0)+1});this.operations++;this.emit();if(this.activeMode==='uncertain-save')throw fault();return action==='create'?{success:true,staffId:id}:{success:true};
 }
 private record(row:Row):CatalogRecord{
  const fields=structuredClone(row.fields),issues:string[]=[],references:Array<{kind:'category'|'staff'|'service';id:number;name:string}>=[];let unavailableReferences=0;
  if(this.activeMode==='legacy'){fields.isActive=null;issues.push('isActive');if(row.entity==='service'){fields.staffIds=null;fields.basePrice=null;issues.push('staffIds','basePrice');}if(row.entity==='package'){fields.serviceIds=null;issues.push('serviceIds');}}
  const ids=row.entity==='service'?[{kind:'category' as const,ids:fields.categoryId?[fields.categoryId]:[]},{kind:'staff' as const,ids:fields.staffIds??[]}]:row.entity==='package'?[{kind:'service' as const,ids:fields.serviceIds??[]}]:[];
  for(const group of ids)for(const id of group.ids){const ref=this.activeMode==='unavailable-reference'?undefined:this.choices(group.kind).find(r=>r.id===id);if(ref)references.push({...ref,kind:group.kind});else unavailableReferences++;}
  return {id:row.id,entity:row.entity,definition:this.definition(row),fields,issues,unavailableReferences,references,categoryName:references.find(r=>r.kind==='category')?.name??null} as CatalogRecord;
 }
 private details(input:any){
  const selection=serviceDetailsInput.parse(input),row=this.owned('service',selection.serviceId),legacy=this.activeMode==='legacy',source=this.bookings.read('bookings.workspace',{serviceId:row.id}) as any,hasBookings=source.summary.total>0;
  const recent=source.rows.slice(0,10).map((b:any)=>({id:b.id,customerName:b.customerName,customerPhone:b.customerPhone,date:b.date,startTime:b.startTime,endTime:b.endTime,durationMinutes:b.durationMinutes,status:b.status,paymentStatus:b.paymentStatus,finalPrice:b.finalPrice}));
  return serviceDetailsSchema.parse({...this.scope(),selection,service:this.record(row),bookings:{total:source.summary.total,counts:source.summary.counts,paidValue:source.summary.paidValue},recent,ratings:{total:hasBookings?2:0,excluded:legacy?1:0,distribution:{one:0,two:0,three:hasBookings?1:0,four:0,five:hasBookings?1:0}}});
 }
 private fixture(name:string,input:any={}):any{
  if(name==='auth.me')return this.activeMode==='session'?null:{id:this.actorId,name:'Local account'};
  if(name==='merchants.getCurrent')return {id:this.merchantId};
  if(name.startsWith('integrations.'))return this.byaan.read(name);
  if(name.startsWith('sheets.'))return platformPreviewRead(name,this.actorId,this.merchantId,this.now,this.activeMode,this.platformSample);
  if(name.startsWith('calendar.'))return this.calendar.read(name,input);
  if(name.startsWith('bookings.'))return this.bookings.read(name,input);
  if(name==='staff.list'){const selection=z.object({activeOnly:z.boolean().optional()}).strict().parse(input);const data=this.staffSnapshot();return {...data,staff:selection.activeOnly?data.staff.filter(row=>row.isActive===1):data.staff};}
  if(name==='services.detailsWorkspace')return this.details(input);
  if(name==='services.catalogEditor'||name==='services.catalogRecord'){
   const selection=(name.endsWith('catalogRecord')?catalogRecordInput:catalogEditorInput).parse(input),record=selection.id===undefined?null:this.record(this.owned(selection.entity,selection.id));
   return (name.endsWith('catalogRecord')?catalogEditorSchema:catalogEditorContextSchema).parse({...this.scope(),selection,record});
  }
  if(name==='services.catalogChoices'){
   const selection=catalogChoicesInput.parse(input),all=this.choices(selection.kind).filter(r=>r.name.toLowerCase().includes(selection.search.toLowerCase()));
   return catalogChoicesSchema.parse({...this.scope(),selection,pagination:{page:selection.page,pageSize:24,total:all.length,pages:Math.ceil(all.length/24)},rows:all.slice((selection.page-1)*24,selection.page*24)});
  }
  if(name==='services.catalogWorkspace'){
   const selection=catalogListInput.parse(input),all=Array.from(this.rows.values()).filter(r=>r.entity===selection.entity).map(r=>this.record(r));
   const rows=all.filter(r=>(selection.status==='all'||r.fields.isActive===(selection.status==='active'?true:selection.status==='inactive'?false:null))&&r.fields.name.toLowerCase().includes(selection.search.toLowerCase()));
   return catalogWorkspaceSchema.parse({...this.scope(),selection,summary:{total:all.length,active:all.filter(r=>r.fields.isActive===true).length,inactive:all.filter(r=>r.fields.isActive===false).length,unknown:all.filter(r=>r.fields.isActive===null).length},pagination:{page:selection.page,pageSize:24,total:rows.length,pages:Math.ceil(rows.length/24)},rows:rows.slice((selection.page-1)*24,selection.page*24)});
  }
  throw Error('Unmapped service fixture '+name);
 }
 read(name:string,input?:any){
  if(!serviceQueries.includes(name as any)&&name!=='services.catalogRecord')throw Error('Unmapped read');const key=JSON.stringify([name,input]);if(this.cache.has(key))return this.cache.get(key);
  const mode=this.activeMode,workspace=name.startsWith('integrations.')||name.startsWith('sheets.')||name.startsWith('calendar.')||name.startsWith('services.')||name.startsWith('bookings.')||name==='staff.list',loading=workspace&&mode==='loading';let data:any,error:any=mode==='forbidden'&&name==='merchants.getCurrent'?fault('FORBIDDEN'):workspace&&(['failure','stale-error'].includes(mode)||mode==='choices-error'&&name==='services.catalogChoices')?fault():null;
  if(mode==='readonly'&&(name.startsWith('integrations.')||name.startsWith('sheets.')))error=fault('FORBIDDEN');
  try{data=this.fixture(name,input);}catch(e){error=e;}if(mode==='foreign'&&workspace&&data)data={...data,merchantId:999};
  const result={data:loading||error&&mode!=='stale-error'?undefined:data,error,isLoading:loading,isFetching:loading,isError:!!error,isFetchedAfterMount:!loading,dataUpdatedAt:loading?0:Date.parse(this.now)};this.cache.set(key,result);return result;
 }
 async mutate(name:string,input:any){
  if(!serviceMutations.includes(name as any))throw Error('Unmapped mutation');if(this.disposed||['readonly','forbidden','session','foreign','failure','stale-error'].includes(this.activeMode))throw fault('FORBIDDEN');
  if(this.activeMode==='action-failure')throw fault();if(this.activeMode==='save-conflict'){this.complete();throw fault('CONFLICT');}
  if(this.activeMode==='pending-save'){this.pending++;this.emit();try{await new Promise<void>((resolve,reject)=>this.waiting.push({resolve,reject}));}finally{this.pending--;this.emit();}}if(this.disposed)throw fault('CONFLICT');
  if(name.startsWith('integrations.')){const before=this.byaan.writes,result=this.byaan.mutate(name,input);this.operations+=name==='integrations.testByaanConnection'?1:this.byaan.writes-before;this.emit();if(this.activeMode==='uncertain-save')throw fault();return result;}
  if(name.startsWith('calendar.')){const before=this.calendar.writes,result=this.calendar.mutate(name,input);this.operations+=this.calendar.writes-before;this.emit();if(this.activeMode==='uncertain-save')throw fault();return result;}
  if(name.startsWith('bookings.')){const before=this.bookings.writes,result=this.bookings.mutate(name,input);this.operations+=this.bookings.writes-before;this.emit();if(this.activeMode==='uncertain-save')throw fault();return result;}
  if(name.startsWith('staff.'))return this.saveStaff(name,input);
  const [namespace,action]=name.split('.'),entity:Entity=namespace==='services'?'service':namespace==='serviceCategories'?'category':'package',idKey=entity+'Id';
  const {expectedDefinition,...body}=input,id=body[idKey];delete body[idKey];const current=action==='create'?null:this.owned(entity,id);
  if(current&&expectedDefinition!==this.definition(current))throw fault('CONFLICT');
  const fields:any=action==='delete'?{...current!.fields,isActive:false}:normalize[entity]({...current?.fields,...body});
  if(action!=='delete'){
   if(entity==='service'&&(fields.categoryId&&!this.choices('category').some(r=>r.id===fields.categoryId)||fields.staffIds.some((id:number)=>!this.choices('staff').some(r=>r.id===id))))throw fault('BAD_REQUEST');
   if(entity==='package'&&fields.serviceIds.some((id:number)=>!this.choices('service').some(r=>r.id===id)))throw fault('BAD_REQUEST');
  }
  const saved=current?.id??this.nextId++;this.rows.set(entity+':'+saved,{id:saved,entity,fields,version:(current?.version??0)+1});this.operations++;this.emit();
  if(this.activeMode==='uncertain-save')throw fault();return action==='create'?{success:true,[idKey]:saved}:{success:true};
 }
}
