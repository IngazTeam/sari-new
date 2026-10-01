import {z} from 'zod';
import {TRPCError} from '@trpc/server';
import {getDb,getPrimaryWhatsAppInstance} from './db';
import {greenWorkspaceCall} from './whatsapp/tenant-workspace';
import {getWhatsAppProvider} from './channels/whatsapp/providers';
import {deriveGreenWebhookToken} from './channels/whatsapp/green-webhook-token';
import {conversationConnectionStatus,conversationConnectionDiagnosis,type connectionState} from '../shared/conversation-connection';
type State=z.infer<typeof connectionState>;
type Instance=NonNullable<Awaited<ReturnType<typeof getPrimaryWhatsAppInstance>>>;
const unavailable=()=>new TRPCError({code:'PRECONDITION_FAILED',message:'Connection verification unavailable'});
const states:Record<State,string>={authorized:'تم التحقق من اتصال واتساب',disconnected:'واتساب غير متصل. راجع صفحة إدارة الأرقام لإعادة الربط.',no_instance:'لا يوجد رقم واتساب رئيسي نشط.',check_failed:'تعذر التحقق من الاتصال الآن. أعد الفحص دون تغيير الربط.',configuration_missing:'إعدادات الرقم الرئيسي غير مكتملة. راجع إدارة الأرقام.',unsupported:'هذا النوع من الاتصال لا يدعم الفحص هنا. راجع إدارة الأرقام.'};
async function primary(merchantId:number){
  z.number().int().positive().safe().parse(merchantId);if(!await getDb())throw unavailable();
  const instance=await getPrimaryWhatsAppInstance(merchantId);
  if(instance&&(instance.merchantId!==merchantId||instance.status!=='active'||instance.isPrimary!==1||!Number.isSafeInteger(instance.id)||instance.id<1))throw unavailable();
  return instance;
}
const identity=(i:Instance|undefined)=>i?JSON.stringify([i.id,i.merchantId,i.provider,i.instanceId,i.token,i.apiUrl,i.phoneNumberId,i.phoneNumber,i.status,i.isPrimary]):null;
async function assertCurrent(merchantId:number,instance:Instance){if(identity(await primary(merchantId))!==identity(instance))throw unavailable();}
function scope(merchantId:number,actorUserId:number,instance?:Instance){return {merchantId,actorUserId,instanceId:instance?.id??null,provider:instance?.provider??null,checkedAt:new Date().toISOString()};}
async function stateOf(instance:Instance):Promise<State>{
  if(!instance.token||!instance.instanceId)return 'configuration_missing';
  if(instance.provider==='green_api'){
    const data=await greenWorkspaceCall(instance,'getStateInstance');
    if(data.stateInstance==='authorized')return 'authorized';
    return ['notAuthorized','blocked','sleepMode','starting','yellowCard'].includes(String(data.stateInstance))?'disconnected':'check_failed';
  }
  if(instance.provider==='meta_cloud'){
    if(!/^\d{5,30}$/.test(instance.phoneNumberId||instance.instanceId))return 'configuration_missing';
    const result=await getWhatsAppProvider('meta_cloud').health({provider:'meta_cloud',instanceId:instance.instanceId,token:instance.token,phoneNumberId:instance.phoneNumberId});
    return result.healthy===true?'authorized':'check_failed';
  }
  return 'unsupported';
}
export async function readConversationConnection(merchantId:number,actorUserId:number,canManage:boolean){
  let instance:Instance|undefined,state:State='check_failed';
  try{instance=await primary(merchantId);state=instance?await stateOf(instance):'no_instance';if(instance)await assertCurrent(merchantId,instance);}
  catch{state='check_failed';instance=undefined;}
  return conversationConnectionStatus.parse({...scope(merchantId,actorUserId,instance),canManage,connected:state==='authorized',state,phoneNumber:instance?.phoneNumber??null,message:states[state]});
}
const events={incomingWebhook:'yes',outgoingWebhook:'yes',outgoingMessageWebhook:'yes',outgoingAPIMessageWebhook:'yes',stateWebhook:'yes',statusInstanceWebhook:'yes'};
function expected(instance:Instance){
  const app=new URL(process.env.VITE_APP_URL||'https://sary.live');
  if(app.protocol!=='https:'||app.username||app.password||app.search||app.hash||app.pathname!=='/')throw unavailable();
  return {webhookUrl:`${app.origin}/api/webhooks/greenapi`,webhookUrlToken:`Bearer ${deriveGreenWebhookToken(instance.instanceId,instance.token)}`,...events};
}
function inspected(settings:Record<string,unknown>,want:ReturnType<typeof expected>){return {webhookConfigured:settings.webhookUrl===want.webhookUrl,webhookAuthenticated:settings.webhookUrlToken===want.webhookUrlToken,webhookEventsEnabled:Object.keys(events).every(key=>settings[key]==='yes')};}
const matchesPhone=(settings:Record<string,unknown>,instance:Instance)=>typeof settings.wid==='string'&&/^\d{7,15}@c\.us$/.test(settings.wid)&&settings.wid===`${instance.phoneNumber}@c.us`;
export async function diagnoseConversationConnection(merchantId:number,actorUserId:number){
  let instance:Instance|undefined,instanceState:State='check_failed';
  let details={webhookConfigured:false,webhookAuthenticated:false,webhookEventsEnabled:false};
  let issues:Array<'webhook_url'|'webhook_auth'|'webhook_events'|'identity'|'verification'>=[];
  const result=(status:'ok'|'fixed'|'disconnected'|'broken'|'no_instance'|'api_error'|'unsupported',message:string)=>conversationConnectionDiagnosis.parse({...scope(merchantId,actorUserId,instance),status,fixed:status==='fixed',instanceState,issues,details,message});
  try{
    instance=await primary(merchantId);if(!instance){instanceState='no_instance';return result('no_instance',states.no_instance);}
    if(instance.provider!=='green_api'){instanceState='unsupported';return result('unsupported',states.unsupported);}
    const want=expected(instance);instanceState=await stateOf(instance);
    if(instanceState!=='authorized')return result(instanceState==='disconnected'?'disconnected':'api_error',states[instanceState]);
    const settings=await greenWorkspaceCall(instance,'getSettings');
    if(!matchesPhone(settings,instance)){issues=['identity'];return result('broken','اختلف رقم جلسة واتساب عن الرقم المسجل. راجع إدارة الأرقام قبل أي إصلاح.');}
    details=inspected(settings,want);
    issues=[...(!details.webhookConfigured?['webhook_url' as const]:[]),...(!details.webhookAuthenticated?['webhook_auth' as const]:[]),...(!details.webhookEventsEnabled?['webhook_events' as const]:[])];
    await assertCurrent(merchantId,instance);
    if(!issues.length)return result('ok','تم التحقق من الاتصال وإعدادات استقبال الأحداث.');
    // Idempotent, authenticated configuration only. Preserve read receipts, delay and online preferences.
    const saved=await greenWorkspaceCall(instance,'setSettings',want);if(saved.saveSettings!==true)throw unavailable();
    const verified=await greenWorkspaceCall(instance,'getSettings');details=inspected(verified,want);instanceState=await stateOf(instance);await assertCurrent(merchantId,instance);
    if(!matchesPhone(verified,instance)||!Object.values(details).every(Boolean)||instanceState!=='authorized')return result('broken','أُرسل طلب الإصلاح ولم يتأكد تطبيقه بعد. أعد الفحص قبل المزامنة.');
    return result('fixed','تم التحقق من تطبيق إعدادات الاستقبال المحمية.');
  }catch{issues=['verification'];instanceState='check_failed';return result('api_error','تعذر التحقق من إعدادات واتساب. أعد الفحص دون تغيير الربط.');}
}
