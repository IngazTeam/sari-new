import {z} from 'zod';
import {bookingReadId} from './booking-read';
const count=z.number().int().nonnegative().safe(),stamp=z.string().datetime().nullable();
export const zidSettingsFields=z.object({autoSync:z.boolean(),syncProducts:z.boolean(),syncOrders:z.boolean(),syncCustomers:z.boolean(),notifyMerchantOrders:z.boolean()}).strict();
export const zidWorkspaceSchema=z.object({
  actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime(),revision:z.string().regex(/^[a-f0-9]{64}$/),
  present:z.boolean(),source:z.enum(['canonical','legacy']).nullable(),state:z.enum(['unlinked','configured','disabled','unknown']),
  storeId:z.string().regex(/^[1-9][0-9]{0,19}$/).nullable(),storeName:z.string().max(255).nullable(),storeUrl:z.string().max(2048).nullable(),credentialsStored:z.boolean(),
  createdAt:stamp,lastSyncAt:stamp,webhookEndpointPath:z.string().regex(/^\/api\/webhooks\/zid\/[a-f0-9]{48}$/).nullable(),settingsValid:z.boolean(),settings:zidSettingsFields,
  counts:z.object({catalog:count,linkedProducts:count,sourceOrders:count,storedCustomers:count,activeCustomers:count,syncLogs:count}).strict(),
  syncSummary:z.object({completed:count,failed:count,pending:count,inProgress:count,unknown:count}).strict(),
  webhooks:z.object({recentTotal:count,recentProcessed:count,awaiting:count,failed:count}).strict(),
  notifications:z.object({recentTotal:count,recentDelivered:count,recentSuppressed:count,awaiting:count,needsReview:count}).strict(),
}).strict().superRefine((v,ctx)=>{
 if(v.present===(v.state==='unlinked')||v.present!==(v.source!==null)||!v.present&&(v.storeId!==null||v.storeName!==null||v.storeUrl!==null||v.credentialsStored||v.createdAt!==null||v.lastSyncAt!==null||v.webhookEndpointPath!==null||v.counts.linkedProducts!==0||v.counts.sourceOrders!==0)
   ||v.counts.activeCustomers>v.counts.storedCustomers||Object.values(v.syncSummary).reduce((a,b)=>a+b,0)!==v.counts.syncLogs||v.webhooks.recentProcessed>v.webhooks.recentTotal||v.notifications.recentDelivered+v.notifications.recentSuppressed>v.notifications.recentTotal)
   ctx.addIssue({code:'custom',message:'Inconsistent Zid workspace'});
});
export type ZidWorkspace=z.infer<typeof zidWorkspaceSchema>;
export const zidLogStates=['pending','in_progress','completed','failed','unknown'] as const;
export const zidLogKinds=['products','orders','customers','inventory','unknown'] as const;
export const zidLogsInput=z.object({search:z.string().trim().max(100).default(''),state:z.enum(['all',...zidLogStates]).default('all'),kind:z.enum(['all',...zidLogKinds]).default('all'),page:z.number().int().min(1).max(1_000_000).default(1)}).strict();
export const zidLogRow=z.object({id:bookingReadId,merchantId:bookingReadId,kind:z.enum(zidLogKinds),state:z.enum(zidLogStates),totalItems:count.nullable(),processedItems:count.nullable(),successCount:count.nullable(),failedCount:count.nullable(),hasErrors:z.boolean(),createdAt:stamp,startedAt:stamp,completedAt:stamp,invalidData:z.boolean()}).strict();
export const zidLogsWorkspaceSchema=z.object({actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime(),selection:zidLogsInput,
 summary:z.object({stored:count,matched:count,groups:z.array(z.object({key:z.enum(zidLogStates),count}).strict()).length(5)}).strict(),pagination:z.object({page:count.min(1),pageSize:z.literal(25),total:count,pages:count}).strict(),rows:z.array(zidLogRow).max(25),
}).strict().superRefine((v,ctx)=>{const {selection:s,summary:t,pagination:p}=v,selected=s.state==='all'?t.matched:t.groups.find(g=>g.key===s.state)?.count;
 if(t.stored<t.matched||t.groups.some((g,i)=>g.key!==zidLogStates[i])||t.groups.reduce((n,g)=>n+g.count,0)!==t.matched||p.total!==selected||p.page!==s.page||p.pages!==Math.ceil(p.total/25)||v.rows.length!==Math.min(25,Math.max(0,p.total-(p.page-1)*25))||v.rows.some((row,i)=>row.merchantId!==v.merchantId||s.state!=='all'&&row.state!==s.state||s.kind!=='all'&&row.kind!==s.kind||i>0&&row.id>=v.rows[i-1].id))ctx.addIssue({code:'custom',message:'Inconsistent Zid log page'});
});
