import {z} from 'zod';
import {bookingReadId} from '@shared/booking-read';
import {wooAccessSchema} from '@shared/woocommerce-access';
import {wooWorkspaceSchema,wooLogsInput,wooLogsWorkspaceSchema} from '@shared/woocommerce-workspace';
import {wooProductsInput,wooOrdersInput,wooOrderDetailsInput,wooProductsWorkspaceSchema,wooOrdersWorkspaceSchema,wooOrderDetailsWorkspaceSchema} from '@shared/woocommerce-data-workspace';
import {wooAnalyticsInput,wooAnalyticsWorkspaceSchema} from '@shared/woocommerce-analytics-workspace';
import {wooIncidentsInput,wooIncidentsWorkspace} from '@shared/woocommerce-incidents';
import {wooOrderActionWorkspace} from '@shared/woocommerce-order-action';
import {wooOperationKinds,wooOperationReceipt,wooOperationReviewWorkspace} from '@shared/woocommerce-operation';
import {wooConnectionCommand} from '@shared/woocommerce-connection';
import type {WooWorkspace} from '@shared/woocommerce-workspace';

function scoped<T extends {actorId:number;merchantId:number}>(schema:z.ZodType<T>,value:unknown,actorId:number,merchantId:number):T|null{
 const parsed=schema.safeParse(value);return parsed.success&&parsed.data.actorId===actorId&&parsed.data.merchantId===merchantId?parsed.data:null;
}
function selected<T extends {actorId:number;merchantId:number;selection:unknown},I extends z.ZodTypeAny>(schema:z.ZodType<T>,inputSchema:I,value:unknown,actorId:number,merchantId:number,input:unknown):T|null{
 const parsed=scoped(schema,value,actorId,merchantId),selection=inputSchema.safeParse(input);return parsed&&selection.success&&JSON.stringify(parsed.selection)===JSON.stringify(selection.data)?parsed:null;
}
export const scopedWooAccess=(value:unknown,actorId:number,merchantId:number)=>scoped(wooAccessSchema,value,actorId,merchantId);
export const scopedWooWorkspace=(value:unknown,actorId:number,merchantId:number)=>scoped(wooWorkspaceSchema,value,actorId,merchantId);
export const scopedWooLogs=(value:unknown,actorId:number,merchantId:number,input:unknown)=>selected(wooLogsWorkspaceSchema,wooLogsInput,value,actorId,merchantId,input);
export const scopedWooProducts=(value:unknown,actorId:number,merchantId:number,input:unknown)=>selected(wooProductsWorkspaceSchema,wooProductsInput,value,actorId,merchantId,input);
export const scopedWooOrders=(value:unknown,actorId:number,merchantId:number,input:unknown)=>selected(wooOrdersWorkspaceSchema,wooOrdersInput,value,actorId,merchantId,input);
export const scopedWooDetails=(value:unknown,actorId:number,merchantId:number,input:unknown)=>selected(wooOrderDetailsWorkspaceSchema,wooOrderDetailsInput,value,actorId,merchantId,input);
export const scopedWooAnalytics=(value:unknown,actorId:number,merchantId:number,input:unknown)=>selected(wooAnalyticsWorkspaceSchema,wooAnalyticsInput,value,actorId,merchantId,input);
export const scopedWooIncidents=(value:unknown,actorId:number,merchantId:number,input:unknown)=>selected(wooIncidentsWorkspace,wooIncidentsInput,value,actorId,merchantId,input);
export function scopedWooOrderAction(value:unknown,actorId:number,merchantId:number,orderId:number){const result=scoped(wooOrderActionWorkspace,value,actorId,merchantId);return result&&(!result.order||result.order.id===orderId)?result:null;}
export const scopedWooReview=(value:unknown,actorId:number,merchantId:number)=>scoped(wooOperationReviewWorkspace,value,actorId,merchantId);
export const wooOperationTracking=z.object({requestId:z.string().uuid().toLowerCase(),revision:z.string().regex(/^[a-f0-9]{64}$/),kind:z.enum(wooOperationKinds)}).strict();
export type WooOperationTracking=z.infer<typeof wooOperationTracking>;
export function scopedWooOperation(value:unknown,actorId:number,merchantId:number,tracked?:WooOperationTracking){const result=scoped(wooOperationReceipt,value,actorId,merchantId);return result&&(!tracked||result.requestId===tracked.requestId&&result.kind===tracked.kind&&result.revision===tracked.revision)?result:null;}
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
function key(actorId:number,merchantId:number){bookingReadId.parse(actorId);bookingReadId.parse(merchantId);return `sari:woo:operation:${actorId}:${merchantId}`;}
/** Recovery persists metadata only. Credentials, messages and recipient details never enter storage. */
export function readWooTracking(storage:Storage,actorId:number,merchantId:number){const raw=storage.getItem(key(actorId,merchantId));return raw===null?null:wooOperationTracking.parse(JSON.parse(raw));}
export function saveWooTracking(storage:Storage,actorId:number,merchantId:number,value:unknown){const record=wooOperationTracking.parse(value),raw=JSON.stringify(record);storage.setItem(key(actorId,merchantId),raw);if(storage.getItem(key(actorId,merchantId))!==raw)throw Error('Operation storage unavailable');return record;}
export function clearWooTracking(storage:Storage,actorId:number,merchantId:number,requestId:string){if(readWooTracking(storage,actorId,merchantId)?.requestId===requestId)storage.removeItem(key(actorId,merchantId));}
export function wooMoneyLabel(value:string|null,currency:string|null,missing:string){return value===null?missing:`${value}${currency?' '+currency:''}`;}
/** A browser-side destination check only; the server still verifies DNS and every request. */
export function wooStoreDestination(input:string){
 try{if(input.length>500||/[\u0000-\u001f\u007f]/.test(input))return null;const u=new URL(input.trim()),host=u.hostname.toLowerCase().replace(/\.$/,''),path=u.pathname.replace(/\/+$/,'');
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port&&u.port!=='443'||!/^(?=.{4,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host)||host.endsWith('.local')||host.endsWith('.internal')||path.length>250||/\/wp-json(?:\/|$)/i.test(path))return null;
  return `https://${host}${path}`;
 }catch{return null;}
}
export type WooConnectionDraft={storeUrl:string;consumerKey:string;consumerSecret:string};
export function validateWooConnection(draft:WooConnectionDraft,current:Pick<WooWorkspace,'present'|'storeUrl'|'hasConsumerKey'|'hasConsumerSecret'>){
 const destination=wooStoreDestination(draft.storeUrl),changed=current.present&&(!destination||destination!==wooStoreDestination(current.storeUrl??''));
 const input={requestId:'00000000-0000-4000-8000-000000000001',revision:'0'.repeat(64),action:'connect' as const,storeUrl:destination??draft.storeUrl,consumerKey:draft.consumerKey.trim()||undefined,consumerSecret:draft.consumerSecret.trim()||undefined,replaceLocalCopies:changed};
 const parsed=wooConnectionCommand.safeParse(input),errors:Partial<Record<keyof WooConnectionDraft,'invalidUrl'|'invalidKey'|'invalidSecret'|'newKeys'>>={};
 if(!destination)errors.storeUrl='invalidUrl';
 if(!parsed.success)for(const issue of parsed.error.issues){const field=issue.path[0];if(field==='storeUrl'||field==='consumerKey'||field==='consumerSecret')errors[field]=field==='storeUrl'?'invalidUrl':field==='consumerKey'?'invalidKey':'invalidSecret';}
 if(!input.consumerKey&&(changed||!current.hasConsumerKey))errors.consumerKey=changed?'newKeys':'invalidKey';
 if(!input.consumerSecret&&(changed||!current.hasConsumerSecret))errors.consumerSecret=changed?'newKeys':'invalidSecret';
 return {destination,changed,errors,valid:Object.keys(errors).length===0};
}
