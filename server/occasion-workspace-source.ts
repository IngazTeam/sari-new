import {createHash} from 'node:crypto';
import {occasionTypes,occasionWorkspaceInput,occasionWorkspaceSchema,type OccasionSelection,type OccasionWorkspaceRow} from '../shared/occasion-workspace';
import type {UpcomingOccasion} from './automation/occasion-campaigns';
export const OCCASION_COLUMNS='id,merchantId,campaign_id,occasionType,year,enabled,discountCode,discountPercentage,messageTemplate,sentAt,recipientCount,status,createdAt,updatedAt';
export const emptyOccasionDelivery=()=>({total:0,pending:0,processing:0,accepted:0,retryable:0,suppressed:0,manualReview:0,unknown:0});
const number=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
const aggregate=(v:unknown)=>{const n=typeof v==='string'&&/^\d+$/.test(v)?Number(v):v;const valid=number(n);if(valid===null)throw Error('Invalid occasion count');return valid;};
function sum(a:number,b:number){const result=a+b;if(!Number.isSafeInteger(result))throw Error('Occasion count overflow');return result;}
export function projectOccasionWorkspace(actorId:number,merchantId:number,canManage:boolean,input:OccasionSelection,source:any[],deliveryRows:any[],upcoming:UpcomingOccasion[],now=new Date()){
 const selection=occasionWorkspaceInput.parse(input);
 if(source.some(r=>r.merchantId!==merchantId)||deliveryRows.some(r=>r.merchantId!==merchantId))throw Error('Invalid occasion source scope');
 if(new Set(source.map(r=>r.id)).size!==source.length)throw Error('Duplicate occasion rows');
 const linkedIds=new Set(source.filter(r=>r.linkedMerchantId===merchantId).map(r=>r.linkedId));
 const deliveries=new Map<number,ReturnType<typeof emptyOccasionDelivery>>(),seen=new Set<string>();
 for(const raw of deliveryRows){if(!linkedIds.has(raw.campaignId))throw Error('Unlinked occasion delivery');const key=raw.campaignId+':'+raw.status;if(seen.has(key))throw Error('Duplicate delivery group');seen.add(key);const delivery=deliveries.get(raw.campaignId)??emptyOccasionDelivery(),n=aggregate(raw.count);delivery.total=sum(delivery.total,n);const field=({pending:'pending',processing:'processing',sent:'accepted',failed:'retryable',suppressed:'suppressed',manual_review:'manualReview'} as const)[raw.status as 'pending']??'unknown';delivery[field]=sum(delivery[field],n);deliveries.set(raw.campaignId,delivery);}
 const rows:OccasionWorkspaceRow[]=source.map(raw=>{
  const issues:string[]=[];
  const text=(value:any,key:string,max:number,nullable=false)=>{if(nullable&&value===null)return null;if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)){issues.push(key);return null;}return value;};
  const stamp=(value:any,key:string,nullable=false)=>{if(nullable&&value===null)return null;const s=value instanceof Date&&Number.isFinite(value.getTime())?value.toISOString():typeof value==='string'?value.replace(' ','T'):'';const d=new Date(s.endsWith('Z')?s:s+'Z');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?$/.test(s)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,19)!==s.slice(0,19)){issues.push(key);return null;}return d.toISOString();};
  const occasionType=text(raw.occasionType,'type',100),storedStatus=text(raw.status,'status',100),discountCode=text(raw.discountCode,'code',50,true),messageTemplate=text(raw.messageTemplate,'template',100000,true);
  if(!occasionTypes.includes(occasionType as any))issues.push('type');if(!['pending','sending','completed','failed'].includes(storedStatus??''))issues.push('status');
  const year=Number.isInteger(raw.year)&&raw.year>=1900&&raw.year<=9999?raw.year:null,enabled=raw.enabled===0?false:raw.enabled===1?true:null,discountPercentage=Number.isInteger(raw.discountPercentage)&&raw.discountPercentage>=5&&raw.discountPercentage<=50?raw.discountPercentage:null,recipientCount=number(raw.recipientCount);
  if(year===null)issues.push('year');if(enabled===null)issues.push('enabled');if(discountPercentage===null)issues.push('discount');if(recipientCount===null)issues.push('recipients');
  const sentAt=stamp(raw.sentAt,'sent',true),createdAt=stamp(raw.createdAt,'created'),updatedAt=stamp(raw.updatedAt,'updated');
  const campaignId=raw.campaign_id===null?null:Number.isInteger(raw.campaign_id)&&raw.campaign_id>0&&raw.campaign_id<=2147483647?raw.campaign_id:null;
  if(raw.campaign_id!==null&&campaignId===null)issues.push('campaign_id');
  let linkedCampaign:OccasionWorkspaceRow['linkedCampaign']=null;
  if(campaignId!==null){if(raw.linkedId===campaignId&&raw.linkedMerchantId===merchantId&&typeof raw.linkedName==='string'&&raw.linkedName.length<=255&&['draft','scheduled','sending','completed','failed'].includes(raw.linkedStatus))linkedCampaign={id:campaignId,name:raw.linkedName,status:raw.linkedStatus};else issues.push('campaign_link');}
  const delivery=linkedCampaign?deliveries.get(linkedCampaign.id)??emptyOccasionDelivery():null;if(delivery?.unknown)issues.push('delivery_state');
  const revision=createHash('sha256').update(JSON.stringify(OCCASION_COLUMNS.split(',').map(k=>raw[k]))).digest('hex');
  return {id:raw.id,revision,occasionType,year,enabled,discountCode,discountPercentage,messageTemplate,sentAt,recipientCount,storedStatus,createdAt,updatedAt,campaignId,linkedCampaign,delivery,state:issues.length?'invalid':storedStatus==='pending'?enabled?'enabled':'disabled':storedStatus as 'sending'|'completed'|'failed',issues:Array.from(new Set(issues))};
 });
 const counts={enabled:0,disabled:0,sending:0,completed:0,failed:0,invalid:0},delivery=emptyOccasionDelivery();let storedRecipients:number|null=0,invalidRecipientRows=0;
 for(const row of rows){counts[row.state]++;if(row.recipientCount===null)invalidRecipientRows++;else if(storedRecipients!==null){const n:number=storedRecipients+row.recipientCount;storedRecipients=Number.isSafeInteger(n)?n:null;}if(row.delivery)for(const key of Object.keys(delivery) as Array<keyof typeof delivery>)delivery[key]=sum(delivery[key],row.delivery[key]);}
 const q=selection.query.toLowerCase(),matches=rows.filter(r=>(selection.state==='all'||r.state===selection.state)&&(selection.year===null||r.year===selection.year)&&(!q||[String(r.id),r.occasionType,r.discountCode,r.linkedCampaign?.name,r.messageTemplate].some(v=>v?.toLowerCase().includes(q))));
 return occasionWorkspaceSchema.parse({actorId,merchantId,checkedAt:now.toISOString(),canManage,selection,pageSize:25,total:rows.length,matched:matches.length,pages:Math.ceil(matches.length/25),years:Array.from(new Set(rows.flatMap(r=>r.year===null?[]:[r.year]))).sort((a,b)=>b-a),counts,storedRecipients,invalidRecipientRows,delivery,deliveryEvidence:'outbox_states',salesAttribution:'not_verified',timezone:'Asia/Riyadh',calendar:'gregory_and_islamic_umalqura',upcoming:upcoming.map(o=>{const existing=rows.find(r=>r.occasionType===o.type&&r.year===o.year);return {...o,existing:existing?{id:existing.id,state:existing.state,enabled:existing.enabled}:null};}),rows:matches.slice((selection.page-1)*25,selection.page*25)});
}
