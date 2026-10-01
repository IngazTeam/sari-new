import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({db:vi.fn(),primary:vi.fn(),green:vi.fn(),health:vi.fn()}));
vi.mock('./db',()=>({getDb:m.db,getPrimaryWhatsAppInstance:m.primary}));
vi.mock('./whatsapp/tenant-workspace',()=>({greenWorkspaceCall:m.green}));
vi.mock('./channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({health:m.health})}));
import {readConversationConnection,diagnoseConversationConnection} from './conversation-connection';
import {deriveGreenWebhookToken} from './channels/whatsapp/green-webhook-token';
import {conversationConnectionStatus,conversationConnectionDiagnosis} from '../shared/conversation-connection';
const instance=()=>({id:4,merchantId:20,isPrimary:1,provider:'green_api',instanceId:'7105123456',token:'PRIVATE_PROVIDER_TOKEN',apiUrl:'https://7105.api.greenapi.com',status:'active',phoneNumber:'966500000227',phoneNumberId:null});
const settings=()=>({wid:'966500000227@c.us',webhookUrl:'https://sary.live/api/webhooks/greenapi',webhookUrlToken:`Bearer ${deriveGreenWebhookToken(instance().instanceId,instance().token)}`,incomingWebhook:'yes',outgoingWebhook:'yes',outgoingMessageWebhook:'yes',outgoingAPIMessageWebhook:'yes',stateWebhook:'yes',statusInstanceWebhook:'yes'});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('VITE_APP_URL','https://sary.live');vi.stubEnv('GREEN_WEBHOOK_TOKEN_KEY','test-only-conversation-webhook-root-key-2026');m.db.mockResolvedValue({});m.primary.mockResolvedValue(instance());m.green.mockImplementation(async(_i:any,method:string)=>method==='getStateInstance'?{stateInstance:'authorized'}:method==='getSettings'?settings():{saveSettings:true});m.health.mockResolvedValue({healthy:true});});
afterEach(()=>vi.unstubAllEnvs());
it('binds read status to the selected primary and returns no credentials',async()=>{
  const value=await readConversationConnection(20,7,true);expect(value).toMatchObject({merchantId:20,actorUserId:7,instanceId:4,provider:'green_api',canManage:true,connected:true,state:'authorized'});expect(JSON.stringify(value)).not.toMatch(/PRIVATE_PROVIDER_TOKEN|7105123456|webhookUrlToken/);expect(m.primary).toHaveBeenCalledWith(20);expect(m.green).toHaveBeenCalledExactlyOnceWith(instance(),'getStateInstance');
});
it.each(['storage','provider','malformed','changed-primary','foreign-primary'])('does not invent connectivity after %s failure',async failure=>{
  if(failure==='storage')m.db.mockResolvedValue(null);if(failure==='provider')m.green.mockRejectedValue(Error('PRIVATE_PROVIDER_TOKEN'));if(failure==='malformed')m.green.mockResolvedValue({stateInstance:'UNTRUSTED_PROVIDER_TEXT'});
  if(failure==='changed-primary')m.primary.mockResolvedValueOnce(instance()).mockResolvedValue({...instance(),id:5});if(failure==='foreign-primary')m.primary.mockResolvedValue({...instance(),merchantId:99});
  const value=await readConversationConnection(20,7,false);expect(value).toMatchObject({connected:false,state:'check_failed',canManage:false});expect(JSON.stringify(value)).not.toMatch(/PRIVATE_PROVIDER_TOKEN|UNTRUSTED_PROVIDER_TEXT/);
});
it.each(['notAuthorized','blocked','sleepMode','starting','yellowCard'])('shows the verified %s state as disconnected',async stateInstance=>{m.green.mockResolvedValue({stateInstance});expect(await readConversationConnection(20,7,true)).toMatchObject({connected:false,state:'disconnected'});});
it('distinguishes absent and incomplete primary configuration without contacting the provider',async()=>{
  m.primary.mockResolvedValueOnce(undefined);expect(await readConversationConnection(20,7,true)).toMatchObject({connected:false,state:'no_instance',instanceId:null});
  m.primary.mockResolvedValue({...instance(),token:''});expect(await readConversationConnection(20,7,true)).toMatchObject({connected:false,state:'configuration_missing'});expect(m.green).not.toHaveBeenCalled();
});
it('uses the Meta provider for its primary and never treats it as Green API',async()=>{
  m.primary.mockResolvedValue({...instance(),provider:'meta_cloud',phoneNumberId:'123456789'});expect(await readConversationConnection(20,7,true)).toMatchObject({provider:'meta_cloud',connected:true});expect(m.green).not.toHaveBeenCalled();expect(m.health.mock.calls[0][0]).toMatchObject({provider:'meta_cloud',phoneNumberId:'123456789'});
  m.health.mockResolvedValue({healthy:false});expect(await readConversationConnection(20,7,true)).toMatchObject({connected:false,state:'check_failed'});
  expect(await diagnoseConversationConnection(20,7)).toMatchObject({status:'unsupported',fixed:false});expect(m.green).not.toHaveBeenCalled();
});
it('verifies correct settings without writing or leaking the returned authorization token',async()=>{
  const value=await diagnoseConversationConnection(20,7);expect(value).toMatchObject({status:'ok',fixed:false,details:{webhookConfigured:true,webhookAuthenticated:true,webhookEventsEnabled:true}});expect(m.green.mock.calls.some(c=>c[1]==='setSettings')).toBe(false);expect(JSON.stringify(value)).not.toMatch(/Bearer|PRIVATE_PROVIDER_TOKEN|7105123456/);
});
it.each(['webhookUrl','webhookUrlToken','outgoingAPIMessageWebhook'])('repairs %s using an authenticated minimal patch and verifies readback',async field=>{
  let writes=0;m.green.mockImplementation(async(_i:any,method:string)=>{if(method==='getStateInstance')return{stateInstance:'authorized'};if(method==='setSettings'){writes++;return{saveSettings:true};}return writes?settings():{...settings(),[field]:''};});
  const value=await diagnoseConversationConnection(20,7);expect(value).toMatchObject({status:'fixed',fixed:true});const patch=m.green.mock.calls.find(c=>c[1]==='setSettings')![2];
  expect(patch.webhookUrlToken).toMatch(/^Bearer .{32,}$/);expect(patch).not.toHaveProperty('markIncomingMessagesReaded');expect(patch).not.toHaveProperty('keepOnlineStatus');expect(patch).not.toHaveProperty('delaySendMessagesMilliseconds');expect(m.green.mock.calls.filter(c=>c[1]==='getSettings')).toHaveLength(2);expect(m.green.mock.calls.filter(c=>c[1]==='getStateInstance')).toHaveLength(2);
});
it.each(['provider-failure','disconnected','wrong-phone','changed-primary','missing-key','unsafe-origin'])('does not write settings after %s',async kind=>{
  if(kind==='provider-failure')m.green.mockRejectedValue(Error('PRIVATE_PROVIDER_TOKEN'));if(kind==='disconnected')m.green.mockResolvedValue({stateInstance:'notAuthorized'});
  if(kind==='wrong-phone')m.green.mockImplementation(async(_i:any,method:string)=>method==='getStateInstance'?{stateInstance:'authorized'}:{...settings(),wid:'966500000999@c.us'});
  if(kind==='changed-primary'){m.primary.mockResolvedValueOnce(instance()).mockResolvedValue({...instance(),id:5});m.green.mockImplementation(async(_i:any,method:string)=>method==='getStateInstance'?{stateInstance:'authorized'}:{...settings(),webhookUrlToken:''});}
  if(kind==='missing-key'){vi.stubEnv('GREEN_WEBHOOK_TOKEN_KEY','');vi.stubEnv('FIELD_ENCRYPTION_KEY','');}if(kind==='unsafe-origin')vi.stubEnv('VITE_APP_URL','https://user:secret@example.test/path?token=private');
  const result=await diagnoseConversationConnection(20,7);expect(result.fixed).toBe(false);expect(['ok','fixed']).not.toContain(result.status);expect(m.green.mock.calls.some(c=>c[1]==='setSettings')).toBe(false);expect(JSON.stringify(result)).not.toMatch(/PRIVATE_PROVIDER_TOKEN|secret|private/);
});
it.each(['false','missing','string','http-only'])('requires explicit provider save acknowledgment: %s',async kind=>{
  m.green.mockImplementation(async(_i:any,method:string)=>method==='getStateInstance'?{stateInstance:'authorized'}:method==='getSettings'?{...settings(),webhookUrlToken:''}:kind==='false'?{saveSettings:false}:kind==='string'?{saveSettings:'true'}:kind==='http-only'?{status:200}:{});
  expect(await diagnoseConversationConnection(20,7)).toMatchObject({fixed:false,status:'api_error'});
});
it.each(['settings','phone','state','primary'])('does not claim a repair when %s changes during verification',async kind=>{
  let saved=false;m.green.mockImplementation(async(_i:any,method:string)=>{
    if(method==='setSettings'){saved=true;return{saveSettings:true};}
    if(method==='getStateInstance')return{stateInstance:saved&&kind==='state'?'notAuthorized':'authorized'};
    return !saved||kind==='settings'?{...settings(),webhookUrlToken:''}:kind==='phone'?{...settings(),wid:'966500000999@c.us'}:settings();
  });if(kind==='primary')m.primary.mockResolvedValueOnce(instance()).mockResolvedValueOnce(instance()).mockResolvedValue({...instance(),id:5});
  const result=await diagnoseConversationConnection(20,7);expect(result.fixed).toBe(false);expect(['ok','fixed']).not.toContain(result.status);
});
it('rejects contradictory public connection and diagnosis contracts',async()=>{
  const status=await readConversationConnection(20,7,true);expect(conversationConnectionStatus.safeParse({...status,state:'check_failed'}).success).toBe(false);
  const diag=await diagnoseConversationConnection(20,7);expect(conversationConnectionDiagnosis.safeParse({...diag,status:'fixed',fixed:false}).success).toBe(false);expect(conversationConnectionDiagnosis.safeParse({...diag,details:{...diag.details,webhookAuthenticated:false}}).success).toBe(false);
});
