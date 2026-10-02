import {z} from 'zod';
import {bookingReadId} from './booking-read';
const count=z.number().int().nonnegative().safe(),stamp=z.string().datetime().nullable();
export const wooLogStates=['running','success','partial','failed','unknown'] as const;
export const wooLogKinds=['products','orders','customers','manual','unknown'] as const;
export const wooLogDirections=['import','export','bidirectional','unknown'] as const;
export const wooWorkspaceSchema=z.object({
 actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime(),revision:z.string().regex(/^[a-f0-9]{64}$/),
 present:z.boolean(),state:z.enum(['unlinked','configured','disconnected','error','disabled','unknown']),
 connectionStatus:z.enum(['connected','disconnected','error','unknown']).nullable(),
 storeUrl:z.string().max(2048).nullable(),storeName:z.string().max(255).nullable(),storeVersion:z.string().max(50).nullable(),storeCurrency:z.string().regex(/^[A-Z]{3}$/).nullable(),
 hasConsumerKey:z.boolean(),hasConsumerSecret:z.boolean(),createdAt:stamp,lastTestAt:stamp,lastSyncAt:stamp,
 counts:z.object({storedProducts:count,storedOrders:count,syncLogs:count}).strict(),
 syncSummary:z.object({running:count,success:count,partial:count,failed:count,unknown:count}).strict(),
 webhooks:z.object({ready:z.boolean(),identityStored:z.boolean(),registeredTopics:count.max(6),registrationsValid:z.boolean(),
  stored:count,recentTotal:count,recentCompleted:count,awaiting:count,needsReview:count,suppressed:count,unknown:count,oldestPendingAt:stamp}).strict(),
}).strict().superRefine((v,ctx)=>{
 if(v.present===(v.state==='unlinked')||v.present!==(v.connectionStatus!==null)||!v.present&&(v.storeUrl!==null||v.storeName!==null||v.storeVersion!==null||v.storeCurrency!==null||v.hasConsumerKey||v.hasConsumerSecret||v.createdAt!==null||v.lastTestAt!==null||v.lastSyncAt!==null||v.webhooks.identityStored)
  ||Object.values(v.syncSummary).reduce((a,b)=>a+b,0)!==v.counts.syncLogs||v.webhooks.ready!==(v.webhooks.identityStored&&v.webhooks.registrationsValid&&v.webhooks.registeredTopics===6)
  ||v.webhooks.recentCompleted>v.webhooks.recentTotal||v.webhooks.recentTotal>v.webhooks.stored||v.webhooks.awaiting+v.webhooks.needsReview+v.webhooks.suppressed+v.webhooks.unknown>v.webhooks.stored||v.webhooks.awaiting===0&&v.webhooks.oldestPendingAt!==null)
  ctx.addIssue({code:'custom',message:'Inconsistent WooCommerce workspace'});
});
export type WooWorkspace=z.infer<typeof wooWorkspaceSchema>;
export const wooLogsInput=z.object({search:z.string().trim().max(100).default(''),state:z.enum(['all',...wooLogStates]).default('all'),kind:z.enum(['all',...wooLogKinds]).default('all'),direction:z.enum(['all',...wooLogDirections]).default('all'),page:z.number().int().min(1).max(1_000_000).default(1)}).strict();
export const wooLogRow=z.object({id:bookingReadId,merchantId:bookingReadId,kind:z.enum(wooLogKinds),state:z.enum(wooLogStates),direction:z.enum(wooLogDirections),processed:count.nullable(),succeeded:count.nullable(),failed:count.nullable(),durationSeconds:count.nullable(),hasErrors:z.boolean(),createdAt:stamp,startedAt:stamp,completedAt:stamp,invalidData:z.boolean()}).strict();
export const wooLogsWorkspaceSchema=z.object({actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime(),selection:wooLogsInput,
 summary:z.object({stored:count,matched:count,groups:z.array(z.object({key:z.enum(wooLogStates),count}).strict()).length(5)}).strict(),pagination:z.object({page:count.min(1),pageSize:z.literal(25),total:count,pages:count}).strict(),rows:z.array(wooLogRow).max(25),
}).strict().superRefine((v,ctx)=>{const {selection:s,summary:t,pagination:p}=v,selected=s.state==='all'?t.matched:t.groups.find(g=>g.key===s.state)?.count;
 if(t.stored<t.matched||t.groups.some((g,i)=>g.key!==wooLogStates[i])||t.groups.reduce((n,g)=>n+g.count,0)!==t.matched||p.total!==selected||p.page!==s.page||p.pages!==Math.ceil(p.total/25)||v.rows.length!==Math.min(25,Math.max(0,p.total-(p.page-1)*25))||v.rows.some((row,i)=>row.merchantId!==v.merchantId||s.state!=='all'&&row.state!==s.state||s.kind!=='all'&&row.kind!==s.kind||s.direction!=='all'&&row.direction!==s.direction||i>0&&row.id>=v.rows[i-1].id))ctx.addIssue({code:'custom',message:'Inconsistent WooCommerce log page'});
});
