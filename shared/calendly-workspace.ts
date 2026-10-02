import {z} from 'zod';
import {bookingReadId} from './booking-read';
import {serviceBookingDate} from './service-details-workspace';
import {calendlyResourceUri} from './calendly-provider';
const count=z.number().int().nonnegative().safe(),stamp=z.string().datetime().nullable();
const scope={actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime()};
export const calendlyAppointmentStates=['active','cancelled','unknown'] as const;
export const calendlyReceiptStates=['pending','processing','completed','failed','manual_review','unknown'] as const;
export const calendlyWorkspaceSchema=z.object({
 ...scope,revision:z.string().regex(/^[a-f0-9]{64}$/),present:z.boolean(),state:z.enum(['unlinked','configured','disabled','unknown']),
 userName:z.string().max(255).nullable(),userUri:z.string().max(500).refine(value=>!!calendlyResourceUri(value,'user')).nullable(),identityValid:z.boolean(),credentialsStored:z.boolean(),
 settings:z.object({syncToWhatsApp:z.boolean()}).strict(),settingsValid:z.boolean(),createdAt:stamp,lastSyncAt:stamp,
 counts:z.object({appointments:count,active:count,cancelled:count,unknown:count,upcoming:count,confirmationsAccepted:count}).strict(),
 webhooks:z.object({registered:z.boolean(),stored:count,recentTotal:count,recentCompleted:count,awaiting:count,needsReview:count,unknown:count,oldestPendingAt:stamp}).strict(),
}).strict().superRefine((v,ctx)=>{
 if(v.identityValid!==(v.userUri!==null)||v.present===(v.state==='unlinked')||!v.present&&(v.userName!==null||v.userUri!==null||v.identityValid||v.credentialsStored||v.webhooks.registered||v.createdAt!==null||v.lastSyncAt!==null)
  ||v.counts.active+v.counts.cancelled+v.counts.unknown!==v.counts.appointments||v.counts.upcoming>v.counts.active||v.counts.confirmationsAccepted>v.counts.appointments
  ||v.webhooks.recentCompleted>v.webhooks.recentTotal||v.webhooks.recentTotal>v.webhooks.stored||v.webhooks.awaiting+v.webhooks.needsReview+v.webhooks.unknown>v.webhooks.stored||v.webhooks.awaiting===0&&v.webhooks.oldestPendingAt!==null)
  ctx.addIssue({code:'custom',message:'Inconsistent Calendly workspace'});
});
const paging={search:z.string().trim().max(100).default(''),page:z.number().int().min(1).max(1_000_000).default(1)};
export const calendlyAppointmentsInput=z.object({...paging,state:z.enum(['all',...calendlyAppointmentStates]).default('all'),period:z.enum(['all','upcoming','past']).default('all'),startDate:serviceBookingDate.optional(),endDate:serviceBookingDate.optional()}).strict().refine(v=>Boolean(v.startDate)===Boolean(v.endDate)&&(!v.startDate||!v.endDate||v.startDate<=v.endDate),'Invalid paired date range');
export const calendlyReceiptsInput=z.object({...paging,state:z.enum(['all',...calendlyReceiptStates]).default('all'),event:z.enum(['all','created','cancelled','unknown']).default('all')}).strict();
const pagination=z.object({page:count.min(1),pageSize:z.literal(25),pages:count,total:count}).strict();
const appointmentRow=z.object({id:bookingReadId,merchantId:bookingReadId,eventName:z.string().max(255).nullable(),customerName:z.string().max(255).nullable(),customerEmail:z.string().max(320).nullable(),customerPhone:z.string().max(50).nullable(),location:z.string().max(500).nullable(),state:z.enum(calendlyAppointmentStates),startAt:stamp,endAt:stamp,cancelledAt:stamp,confirmationAcceptedAt:stamp,providerUpdatedAt:stamp,invalidData:z.boolean()}).strict();
export const calendlyAppointmentsSchema=z.object({...scope,timezone:z.literal('UTC'),selection:calendlyAppointmentsInput,summary:z.object({stored:count,matched:count,groups:z.array(z.object({key:z.enum(calendlyAppointmentStates),count}).strict()).length(3)}).strict(),pagination,rows:z.array(appointmentRow).max(25)}).strict().superRefine((v,ctx)=>{
 const {summary:t,pagination:p,selection:s}=v,total=s.state==='all'?t.matched:t.groups.find(g=>g.key===s.state)?.count;
 if(t.stored<t.matched||t.groups.some((g,i)=>g.key!==calendlyAppointmentStates[i])||t.groups.reduce((n,g)=>n+g.count,0)!==t.matched||p.total!==total||p.pages!==Math.ceil(p.total/25)||p.page!==s.page||v.rows.length!==Math.min(25,Math.max(0,p.total-(p.page-1)*25))||v.rows.some((r,i)=>r.merchantId!==v.merchantId||s.state!=='all'&&r.state!==s.state||i>0&&r.id>=v.rows[i-1].id))ctx.addIssue({code:'custom',message:'Inconsistent Calendly appointment page'});
});
const receiptRow=z.object({id:bookingReadId,merchantId:bookingReadId,state:z.enum(calendlyReceiptStates),event:z.enum(['created','cancelled','unknown']),attempts:count.nullable(),effectApplied:z.boolean().nullable(),notificationRequired:z.boolean().nullable(),hasError:z.boolean(),createdAt:stamp,availableAt:stamp,claimedAt:stamp,processedAt:stamp,invalidData:z.boolean()}).strict();
export const calendlyReceiptsSchema=z.object({...scope,selection:calendlyReceiptsInput,summary:z.object({stored:count,matched:count,groups:z.array(z.object({key:z.enum(calendlyReceiptStates),count}).strict()).length(6)}).strict(),pagination,rows:z.array(receiptRow).max(25)}).strict().superRefine((v,ctx)=>{
 const {summary:t,pagination:p,selection:s}=v,total=s.state==='all'?t.matched:t.groups.find(g=>g.key===s.state)?.count;
 if(t.stored<t.matched||t.groups.some((g,i)=>g.key!==calendlyReceiptStates[i])||t.groups.reduce((n,g)=>n+g.count,0)!==t.matched||p.total!==total||p.pages!==Math.ceil(p.total/25)||p.page!==s.page||v.rows.length!==Math.min(25,Math.max(0,p.total-(p.page-1)*25))||v.rows.some((r,i)=>r.merchantId!==v.merchantId||s.state!=='all'&&r.state!==s.state||s.event!=='all'&&r.event!==s.event||i>0&&r.id>=v.rows[i-1].id))ctx.addIssue({code:'custom',message:'Inconsistent Calendly receipt page'});
});
export type CalendlyWorkspace=z.infer<typeof calendlyWorkspaceSchema>;
export type CalendlyAppointments=z.infer<typeof calendlyAppointmentsSchema>;
export type CalendlyReceipts=z.infer<typeof calendlyReceiptsSchema>;
