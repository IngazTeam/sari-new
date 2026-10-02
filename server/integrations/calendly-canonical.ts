import {z} from 'zod';
import {calendlyResourceUri} from '../../shared/calendly-provider';
const name=z.string().trim().min(1).max(255),stamp=z.string().datetime({offset:true}).refine(v=>Date.parse(v)>=Date.UTC(2000,0,1)&&Date.parse(v)<Date.UTC(2038,0,1));
export const eventSchema=z.object({uri:z.string().refine(v=>!!calendlyResourceUri(v,'event')),name,status:z.enum(['active','canceled']),start_time:stamp,end_time:stamp,updated_at:stamp,location:z.object({location:z.string().max(500).optional().nullable()}).optional().nullable(),event_memberships:z.array(z.object({user:z.string()})).min(1)}).refine(v=>Date.parse(v.end_time)>Date.parse(v.start_time));
export const inviteeSchema=z.object({uri:z.string().refine(v=>!!calendlyResourceUri(v,'invitee')),event:z.string(),name,status:z.enum(['active','canceled']),updated_at:stamp,email:z.string().max(320).optional().nullable(),text_reminder_number:z.string().max(100).optional().nullable(),cancellation:z.object({created_at:stamp.optional(),canceled_at:stamp.optional()}).optional().nullable()});
export function parseCalendlyCanonicalPair(rawEvent:unknown,rawInvitee:unknown,userUri:string){
 const event=eventSchema.parse(rawEvent),invitee=inviteeSchema.parse(rawInvitee);
 if(!calendlyResourceUri(userUri,'user')||!event.event_memberships.some(m=>m.user===userUri)||invitee.event!==event.uri||!invitee.uri.startsWith(event.uri+'/invitees/'))throw Error('Calendly canonical identity mismatch');
 return {event,invitee};
}
