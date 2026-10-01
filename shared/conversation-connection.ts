import {z} from 'zod';
const id=z.number().int().positive().safe();
export const connectionState=z.enum(['authorized','disconnected','no_instance','check_failed','configuration_missing','unsupported']);
const scope={merchantId:id,actorUserId:id,instanceId:id.nullable(),provider:z.enum(['green_api','meta_cloud','mock']).nullable(),checkedAt:z.string().datetime({precision:3})};
export const conversationConnectionStatus=z.object({...scope,canManage:z.boolean(),connected:z.boolean(),state:connectionState,phoneNumber:z.string().max(50).nullable(),message:z.string().max(300)}).strict()
  .refine(v=>v.connected===(v.state==='authorized')&&(v.state!=='authorized'||v.instanceId!==null),'Contradictory connection state');
export const conversationConnectionDiagnosis=z.object({...scope,status:z.enum(['ok','fixed','disconnected','broken','no_instance','api_error','unsupported']),fixed:z.boolean(),instanceState:connectionState,
  issues:z.array(z.enum(['webhook_url','webhook_auth','webhook_events','identity','verification'])).max(5),
  details:z.object({webhookConfigured:z.boolean(),webhookAuthenticated:z.boolean(),webhookEventsEnabled:z.boolean()}).strict(),message:z.string().max(300)}).strict()
  .refine(v=>v.fixed===(v.status==='fixed')&&(!['ok','fixed'].includes(v.status)||(v.instanceState==='authorized'&&v.instanceId!==null&&Object.values(v.details).every(Boolean))),'Contradictory diagnosis');
