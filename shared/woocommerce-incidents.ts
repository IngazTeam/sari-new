import {z} from 'zod';
import {bookingReadId} from './booking-read';
import {wooOperationIntent} from './woocommerce-operation';
const count=z.number().int().nonnegative().safe(),stamp=z.string().datetime().nullable(),revision=z.string().regex(/^[a-f0-9]{64}$/);
export const wooReceiptStates=['pending','processing','completed','failed','manual_review','suppressed','unknown'] as const;
export const wooReceiptTopics=['product.created','product.updated','product.deleted','order.created','order.updated','order.deleted','unknown'] as const;
export const wooIncidentsInput=z.object({search:z.string().trim().max(100).default(''),state:z.enum(['all',...wooReceiptStates]).default('manual_review'),resource:z.enum(['all','product','order']).default('all'),page:count.min(1).max(1_000_000).default(1)}).strict();
export const wooIncidentSelection=z.object({id:bookingReadId,revision}).strict();
export const wooReconciliationRequest=wooOperationIntent.pick({requestId:true,revision:true}).extend({incidents:z.array(wooIncidentSelection).min(1).max(25).refine(rows=>new Set(rows.map(r=>r.id)).size===rows.length,'Duplicate incident').transform(rows=>[...rows].sort((a,b)=>a.id-b.id))}).strict();
export const wooIncidentRow=z.object({id:bookingReadId,merchantId:bookingReadId,revision,topic:z.enum(wooReceiptTopics),resourceId:bookingReadId.nullable(),state:z.enum(wooReceiptStates),attempts:count.nullable(),createdAt:stamp,processedAt:stamp,hasError:z.boolean(),invalidData:z.boolean(),reviewable:z.boolean()}).strict();
export const wooIncidentsWorkspace=z.object({actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime(),selection:wooIncidentsInput,summary:z.object({stored:count,matched:count,groups:z.array(z.object({key:z.enum(wooReceiptStates),count}).strict()).length(7)}).strict(),pagination:z.object({page:count.min(1),pageSize:z.literal(25),total:count,pages:count}).strict(),rows:z.array(wooIncidentRow).max(25)}).strict().superRefine((v,ctx)=>{
 const {selection:s,summary:t,pagination:p}=v,selected=s.state==='all'?t.matched:t.groups.find(g=>g.key===s.state)?.count;
 if(t.stored<t.matched||t.groups.some((g,i)=>g.key!==wooReceiptStates[i])||t.groups.reduce((n,g)=>n+g.count,0)!==t.matched||p.total!==selected||p.page!==s.page||p.pages!==Math.ceil(p.total/25)||v.rows.length!==Math.min(25,Math.max(0,p.total-(p.page-1)*25))||v.rows.some((r,i)=>r.merchantId!==v.merchantId||s.state!=='all'&&r.state!==s.state||s.resource!=='all'&&!r.topic.startsWith(s.resource+'.')||r.reviewable!==(r.state==='manual_review'&&!r.invalidData)||i>0&&r.id>=v.rows[i-1].id))ctx.addIssue({code:'custom',message:'Inconsistent WooCommerce incident page'});
});
export type WooIncidentRow=z.infer<typeof wooIncidentRow>;
