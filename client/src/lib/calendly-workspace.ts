import {z} from 'zod';
import {bookingReadId} from '@shared/booking-read';
import {calendlyWorkspaceSchema,calendlyAppointmentsSchema,calendlyReceiptsSchema,calendlyAppointmentsInput,calendlyReceiptsInput} from '@shared/calendly-workspace';
import {calendlyBookingLinksSchema} from '@shared/calendly-booking-links';
import {calendlyConnectionPreviewSchema} from '@shared/calendly-connection';
import {calendlyOperationKinds,calendlyOperationReceipt,calendlyOperationReviewWorkspace} from '@shared/calendly-operation';
function scoped<T extends {actorId:number;merchantId:number}>(schema:z.ZodType<T>,value:unknown,actorId:number,merchantId:number):T|null{const p=schema.safeParse(value);return p.success&&p.data.actorId===actorId&&p.data.merchantId===merchantId?p.data:null;}
function selected<T extends {actorId:number;merchantId:number;selection:unknown}>(schema:z.ZodType<T>,inputSchema:z.ZodTypeAny,value:unknown,actorId:number,merchantId:number,input:unknown){const data=scoped(schema,value,actorId,merchantId),p=inputSchema.safeParse(input);return data&&p.success&&JSON.stringify(data.selection)===JSON.stringify(p.data)?data:null;}
export const scopedCalendlyWorkspace=(v:unknown,a:number,m:number)=>scoped(calendlyWorkspaceSchema,v,a,m);
export const scopedCalendlyAppointments=(v:unknown,a:number,m:number,i:unknown)=>selected(calendlyAppointmentsSchema,calendlyAppointmentsInput,v,a,m,i);
export const scopedCalendlyReceipts=(v:unknown,a:number,m:number,i:unknown)=>selected(calendlyReceiptsSchema,calendlyReceiptsInput,v,a,m,i);
export function scopedCalendlyLinks(v:unknown,a:number,m:number,revision:string){const data=scoped(calendlyBookingLinksSchema,v,a,m);return data?.revision===revision?data:null;}
export function scopedCalendlyPreview(v:unknown,a:number,m:number,revision:string){const data=scoped(calendlyConnectionPreviewSchema,v,a,m);return data?.revision===revision?data:null;}
export const scopedCalendlyReview=(v:unknown,a:number,m:number)=>scoped(calendlyOperationReviewWorkspace,v,a,m);
export const calendlyOperationTracking=z.object({requestId:z.string().uuid().toLowerCase(),revision:z.string().regex(/^[a-f0-9]{64}$/),kind:z.enum(calendlyOperationKinds)}).strict();
export type CalendlyOperationTracking=z.infer<typeof calendlyOperationTracking>;
export function scopedCalendlyOperation(v:unknown,a:number,m:number,intent?:CalendlyOperationTracking){const data=scoped(calendlyOperationReceipt,v,a,m);return data&&(!intent||data.requestId===intent.requestId&&data.kind===intent.kind&&data.revision===intent.revision)?data:null;}
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
function key(a:number,m:number){bookingReadId.parse(a);bookingReadId.parse(m);return `sari:calendly:operation:${a}:${m}`;}
/** Metadata only: tokens and customer data must never be persisted here. */
export function readCalendlyTracking(s:Storage,a:number,m:number){const raw=s.getItem(key(a,m));return raw===null?null:calendlyOperationTracking.parse(JSON.parse(raw));}
export function saveCalendlyTracking(s:Storage,a:number,m:number,value:unknown){const record=calendlyOperationTracking.parse(value),raw=JSON.stringify(record);s.setItem(key(a,m),raw);if(s.getItem(key(a,m))!==raw)throw Error('Operation storage unavailable');return record;}
export function clearCalendlyTracking(s:Storage,a:number,m:number,id:string){if(readCalendlyTracking(s,a,m)?.requestId===id)s.removeItem(key(a,m));}
export const calendlyDate=(value:string|null,locale:string,none:string)=>value?new Date(value).toLocaleString(locale,{timeZone:'UTC'}):none;
export function calendlyDefaultPeriod(now=new Date()){const startDate=now.toISOString().slice(0,10);return {startDate,endDate:new Date(Date.parse(startDate+'T00:00:00Z')+29*86400000).toISOString().slice(0,10)};}
