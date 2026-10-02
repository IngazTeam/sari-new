import { staffCatalogFields, staffWorkingHours, staffWeekdays } from '@shared/staff-catalog';
import type { StaffWorkspaceRecord } from '@shared/staff-workspace';
export type StaffDraft={name:string;phone:string;email:string;role:string;googleCalendarId:string;isActive:string;hours:Record<string,{start:string;end:string}>;hoursValid:boolean};
export function staffDraft(row?:StaffWorkspaceRecord):StaffDraft {
  let hours:unknown=null;try{hours=row?.workingHours?JSON.parse(row.workingHours):null;}catch{hours='invalid';}
  const checked=staffWorkingHours.safeParse(hours);
  return {name:row?.name??'',phone:row?.phone??'',email:row?.email??'',role:row?.role??'',googleCalendarId:row?.googleCalendarId??'',isActive:!row||row.isActive===1?'active':row.isActive===0?'inactive':'unknown',hours:checked.success?checked.data??{}:{},hoursValid:checked.success};
}
export function parseStaffDraft(draft:StaffDraft){
  const parsed=staffCatalogFields.safeParse({name:draft.name,phone:draft.phone,email:draft.email,role:draft.role,googleCalendarId:draft.googleCalendarId,isActive:draft.isActive==='unknown'?null:draft.isActive==='active',workingHours:draft.hoursValid?Object.keys(draft.hours).length?draft.hours:null:'invalid'});
  const errors:Record<string,boolean>={};if(!parsed.success)for(const issue of parsed.error.issues)errors[String(issue.path[0])]=true;
  return {data:parsed.success?parsed.data:null,errors};
}
export function staffNavigation(search:string){
  const params=new URLSearchParams(search),edit=params.get('edit'),rawPage=params.get('page')??'1',status=params.get('status')??'all';
  return {q:(params.get('q')??'').trim().slice(0,200),status:['all','active','inactive','unknown'].includes(status)?status:'all',page:/^[1-9]\d{0,5}$/.test(rawPage)?Number(rawPage):1,edit:edit===null?null:edit==='new'?'new':/^[1-9]\d{0,9}$/.test(edit)&&Number(edit)<=2147483647?Number(edit):'invalid'} as const;
}
export function staffHref(path:string,search:string,patch:Record<string,string|number|null>){const p=new URLSearchParams(search);for(const [key,value]of Object.entries(patch)){if(value===null||value==='')p.delete(key);else p.set(key,String(value));}return path+(p.size?'?'+p.toString():'');}
export {staffWeekdays};
