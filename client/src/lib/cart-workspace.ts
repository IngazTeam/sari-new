import {z} from 'zod';
import {cartWorkspaceInput,cartWorkspaceSchema,cartRecoveryReviewSchema,type CartSelection} from '@shared/abandoned-cart-workspace';
import {cartReminderReviewSchema,cartReminderReceiptSchema,cartReminderHistorySchema} from '@shared/abandoned-cart-reminder';
export const cartSelectionKey=(s:CartSelection)=>JSON.stringify([s.query,s.state,s.page]);
export function cartNavigation(search:string){const p=new URLSearchParams(search),state=p.get('state'),page=p.get('page');return cartWorkspaceInput.parse({query:(p.get('q')??'').trim().slice(0,100),state:['waiting','reminded','recovered','invalid'].includes(state??'')?state:'all',page:page&&/^[1-9]\d*$/.test(page)&&Number(page)<=1000000?Number(page):1});}
export function scopedCartWorkspace(raw:unknown,a:number,m:number,s:CartSelection){const p=cartWorkspaceSchema.safeParse(raw);return p.success&&p.data.actorId===a&&p.data.merchantId===m&&cartSelectionKey(p.data.selection)===cartSelectionKey(s)?p.data:null;}
export function scopedCartRecovery(raw:unknown,a:number,m:number,id:number,revision:string){const p=cartRecoveryReviewSchema.safeParse(raw);return p.success&&p.data.actorId===a&&p.data.merchantId===m&&p.data.row.id===id&&p.data.row.revision===revision?p.data:null;}
export function scopedCartReminder(raw:unknown,a:number,m:number,id:number,revision:string,discountId:number|null,locale:'ar'|'en'){const p=cartReminderReviewSchema.safeParse(raw);return p.success&&p.data.actorId===a&&p.data.merchantId===m&&p.data.row.id===id&&p.data.row.revision===revision&&p.data.selection.cartId===id&&p.data.selection.discountId===discountId&&p.data.selection.locale===locale?p.data:null;}
export function scopedCartHistory(raw:unknown,a:number,m:number,page:number){const p=cartReminderHistorySchema.safeParse(raw);return p.success&&p.data.actorId===a&&p.data.merchantId===m&&p.data.page===page&&p.data.rows.every(r=>r.merchantId===m)?p.data:null;}
export const cartTrackingSchema=z.object({operationKey:z.string().uuid(),cartId:z.number().int().positive().max(2147483647)}).strict();
export type CartTracking=z.infer<typeof cartTrackingSchema>;
export function scopedCartReceipt(raw:unknown,m:number,tracking:CartTracking){const p=cartReminderReceiptSchema.safeParse(raw);return p.success&&p.data.merchantId===m&&p.data.cartId===tracking.cartId&&p.data.operationKey===tracking.operationKey?p.data:null;}
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
const trackingKey=(a:number,m:number)=>{for(const n of [a,m])z.number().int().positive().parse(n);return `sari:cart-reminder:${a}:${m}`;};
export function readCartTracking(s:Storage,a:number,m:number){const raw=s.getItem(trackingKey(a,m));return raw===null?null:cartTrackingSchema.parse(JSON.parse(raw));}
export function saveCartTracking(s:Storage,a:number,m:number,value:unknown){const v=cartTrackingSchema.parse(value),raw=JSON.stringify(v),key=trackingKey(a,m);s.setItem(key,raw);if(s.getItem(key)!==raw)throw Error('Tracking unavailable');return v;}
export function clearCartTracking(s:Storage,a:number,m:number,operationKey:string){if(readCartTracking(s,a,m)?.operationKey===operationKey)s.removeItem(trackingKey(a,m));}
export const cartStamp=(value:string|null,unknown:string)=>value?value.replace('T',' ').replace(/(?:\.\d{3})?Z$/,' UTC'):unknown;
