import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  getDb: vi.fn(), getWhatsAppRequestsByMerchantId: vi.fn(), getWhatsAppInstancesByMerchantId: vi.fn(), getMerchantCurrentSubscription: vi.fn(), getSubscriptionPlanById: vi.fn(),
  getWhatsAppConnectionRequestById: vi.fn(), getWhatsAppRequestById: vi.fn(), getWhatsAppInstanceByInstanceId: vi.fn(), getWhatsAppInstanceById: vi.fn(), getActiveInstanceByPhoneNumber: vi.fn(),
  createWhatsAppInstance: vi.fn(), updateWhatsAppInstance: vi.fn(), updateWhatsAppConnectionRequest: vi.fn(), completeWhatsAppRequest: vi.fn(),
}));
vi.mock('./db', () => mocks);
import { confirmWorkspaceInstance, confirmWorkspaceRequest, greenWorkspaceCall, listWorkspaceRequests, reconnectWorkspaceInstance, workspaceQR, workspaceUsage } from './whatsapp/tenant-workspace';
const credentials = { instanceId: '7105123456', token: 'private-token', apiUrl: 'https://7105.api.greenapi.com' };
const instance = { ...credentials, id: 5, merchantId: 10, provider: 'green_api', phoneNumber: '966500000001', status: 'active' };
const request = { ...credentials, id: 8, merchantId: 10, status: 'approved', phoneNumber: 'unverified-request-number', createdAt: '2026-09-01' };
const fetcher = vi.fn();
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });
beforeEach(() => {
  vi.resetAllMocks();vi.stubGlobal('fetch', fetcher);vi.stubEnv('GREEN_WEBHOOK_TOKEN_KEY','test-only-workspace-webhook-root-key-2026');
  mocks.getWhatsAppInstanceById.mockResolvedValue(instance);
  mocks.getWhatsAppRequestById.mockResolvedValue(request);
  mocks.getWhatsAppConnectionRequestById.mockResolvedValue({ ...request, token: undefined, apiToken: credentials.token });
  mocks.getWhatsAppInstancesByMerchantId.mockResolvedValue([instance]);
  mocks.getMerchantCurrentSubscription.mockResolvedValue({ id: 1, planId: 1 });
  mocks.getSubscriptionPlanById.mockResolvedValue({ name: 'Test', maxWhatsAppNumbers: 2 });
  mocks.createWhatsAppInstance.mockResolvedValue({ ...instance, id: 9 });
  fetcher.mockImplementation(async (url: string) => reply(url.includes('/getStateInstance/') ? { stateInstance: 'authorized' } : url.includes('/getSettings/') ? { wid: '966500000002@c.us' } : url.includes('/setSettings/') ? { saveSettings: true } : { isLogout: true }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('uses all registered slots, retaining real counts without a subscription or known plan', async () => {
  mocks.getWhatsAppInstancesByMerchantId.mockResolvedValue([instance,{...instance,id:6,status:'inactive'}]);
  expect(await workspaceUsage(10)).toMatchObject({total:2,current:1,max:2,remaining:0});
  mocks.getMerchantCurrentSubscription.mockResolvedValue(null);
  expect(await workspaceUsage(10)).toMatchObject({total:2,current:1,max:0,remaining:0,known:true});
  mocks.getMerchantCurrentSubscription.mockResolvedValue({planId:null,status:'trial'});
  expect(await workspaceUsage(10)).toMatchObject({total:2,max:null,known:false});
});
it.each(['http://api.green-api.com','https://127.0.0.1','https://api.green-api.com.evil.test','https://user:pass@api.green-api.com','https://api.green-api.com:8443','https://api.green-api.com/path','https://api.green-api.com/?token=private'])('rejects unsafe provider origin %s before fetch', async apiUrl => {
  await expect(greenWorkspaceCall({...credentials,apiUrl},'logout')).rejects.toMatchObject({code:'PRECONDITION_FAILED'});expect(fetcher).not.toHaveBeenCalled();
});
it.each([false,undefined,'true'])('does not mutate when logout is not explicitly true: %s',async isLogout=>{
  fetcher.mockResolvedValue(reply({isLogout}));await expect(reconnectWorkspaceInstance(10,5)).rejects.toMatchObject({code:'PRECONDITION_FAILED'});expect(mocks.updateWhatsAppInstance).not.toHaveBeenCalled();
});
it('does not treat failed HTTP or a transport exception as a successful logout',async()=>{
  fetcher.mockResolvedValueOnce(reply({isLogout:true},false)).mockRejectedValueOnce(new Error('secret URL private-token'));
  for(let i=0;i<2;i++)await expect(reconnectWorkspaceInstance(10,5)).rejects.toMatchObject({code:'PRECONDITION_FAILED',message:expect.not.stringContaining('private-token')});
  expect(mocks.updateWhatsAppInstance).not.toHaveBeenCalled();
});
it('changes only the selected connection after verified logout and preserves its number',async()=>{
  await reconnectWorkspaceInstance(10,5);expect(mocks.updateWhatsAppInstance).toHaveBeenCalledExactlyOnceWith(5,{status:'inactive'});
  expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:'error',signal:expect.any(AbortSignal)});
});
it('blocks cross-tenant requests and instances before contacting the provider',async()=>{
  await expect(reconnectWorkspaceInstance(20,5)).rejects.toMatchObject({code:'NOT_FOUND'});
  await expect(workspaceQR(20,{requestId:8,source:'current'})).rejects.toMatchObject({code:'NOT_FOUND'});expect(fetcher).not.toHaveBeenCalled();
});
it('blocks rejected requests and a provider identity belonging to another tenant',async()=>{
  mocks.getWhatsAppRequestById.mockResolvedValueOnce({...request,status:'rejected'});
  await expect(workspaceQR(10,{requestId:8,source:'current'})).rejects.toMatchObject({code:'PRECONDITION_FAILED'});
  mocks.getWhatsAppInstanceByInstanceId.mockResolvedValue({...instance,merchantId:20});
  await expect(workspaceQR(10,{requestId:8,source:'current'})).rejects.toMatchObject({code:'CONFLICT'});expect(fetcher).not.toHaveBeenCalled();
});
it('never fetches a remote QR image or exposes provider errors to the browser',async()=>{
  fetcher.mockResolvedValue(reply({type:'qrCode',message:'https://private.example/qr'}));
  await expect(workspaceQR(10,{requestId:8,source:'current'})).rejects.toMatchObject({code:'PRECONDITION_FAILED'});
  fetcher.mockResolvedValue(reply({type:'alreadyLogged'}));expect(await workspaceQR(10,{requestId:8,source:'current'})).toEqual({qrCodeUrl:null,alreadyConnected:true});
});
it('requires a verified phone and explicitly saved authenticated webhook before activation',async()=>{
  fetcher.mockImplementation(async (url:string)=>reply(url.includes('/getStateInstance/')?{stateInstance:'authorized'}:{wid:'invalid'}));
  await expect(confirmWorkspaceRequest(10,{requestId:8,source:'current'})).rejects.toMatchObject({code:'PRECONDITION_FAILED'});
  expect(mocks.createWhatsAppInstance).not.toHaveBeenCalled();
  fetcher.mockImplementation(async (url:string)=>reply(url.includes('/getStateInstance/')?{stateInstance:'authorized'}:url.includes('/getSettings/')?{wid:'966500000002@c.us'}:{saveSettings:false}));
  await expect(confirmWorkspaceRequest(10,{requestId:8,source:'current'})).rejects.toMatchObject({code:'PRECONDITION_FAILED'});
  expect(mocks.createWhatsAppInstance).not.toHaveBeenCalled();expect(mocks.completeWhatsAppRequest).not.toHaveBeenCalled();
});
it.each(['current','legacy'] as const)('completes the correct source after successful provider and webhook checks: %s',async source=>{
  expect(await confirmWorkspaceRequest(10,{requestId:8,source})).toMatchObject({connected:true,phoneNumber:'966500000002'});
  expect(mocks.createWhatsAppInstance).toHaveBeenCalledWith(expect.objectContaining({merchantId:10,phoneNumber:'966500000002',isPrimary:0}));
  const webhookCall=fetcher.mock.calls.find(([url])=>url.includes('/setSettings/'))!;
  expect(JSON.parse(webhookCall[1].body)).toMatchObject({incomingWebhook:'yes',webhookUrlToken:expect.stringMatching(/^Bearer .{32,}$/)});
  expect(source==='current'?mocks.completeWhatsAppRequest:mocks.updateWhatsAppConnectionRequest).toHaveBeenCalled();
  expect(source==='current'?mocks.updateWhatsAppConnectionRequest:mocks.completeWhatsAppRequest).not.toHaveBeenCalled();
});
it('repairs completion using the existing identity, without creating a duplicate or denying its occupied slot',async()=>{
  mocks.getWhatsAppInstanceByInstanceId.mockResolvedValue(instance);mocks.getSubscriptionPlanById.mockResolvedValue({maxWhatsAppNumbers:1});
  await confirmWorkspaceRequest(10,{requestId:8,source:'current'});expect(mocks.createWhatsAppInstance).not.toHaveBeenCalled();expect(mocks.completeWhatsAppRequest).toHaveBeenCalledWith(8,'966500000002');
});
it('does not report connection when the provider session is waiting',async()=>{
  fetcher.mockResolvedValue(reply({stateInstance:'notAuthorized'}));expect(await confirmWorkspaceInstance(10,5)).toEqual({connected:false,status:'waiting'});expect(mocks.updateWhatsAppInstance).not.toHaveBeenCalled();
});
it('refreshes a paused connection without silently reactivating it',async()=>{
  mocks.getWhatsAppInstanceById.mockResolvedValue({...instance,status:'inactive'});
  await confirmWorkspaceInstance(10,5,true,true);
  expect(mocks.updateWhatsAppInstance).toHaveBeenCalledWith(5,expect.objectContaining({status:'inactive'}));
});
it('rejects a verified phone already owned elsewhere before registering webhook or writing connection state',async()=>{
  mocks.getActiveInstanceByPhoneNumber.mockResolvedValue({id:99,merchantId:20});
  await expect(confirmWorkspaceRequest(10,{requestId:8,source:'current'})).rejects.toMatchObject({code:'CONFLICT'});
  expect(fetcher.mock.calls.some(([url])=>url.includes('/setSettings/'))).toBe(false);
  expect(mocks.createWhatsAppInstance).not.toHaveBeenCalled();expect(mocks.updateWhatsAppInstance).not.toHaveBeenCalled();
});
it('preserves source identities and strips credentials, QR and internal notes from the merged history',async()=>{
  const legacy=[{id:8,status:'connected',phoneNumber:'9665',createdAt:'2026-09-02',rejectionReason:null}];
  mocks.getDb.mockResolvedValue({select:()=>({from:()=>({where:()=>({orderBy:async()=>legacy})})})});
  mocks.getWhatsAppRequestsByMerchantId.mockResolvedValue([{...request,token:'secret',qrCodeUrl:'sensitive QR',adminNotes:'internal'}]);
  const rows=await listWorkspaceRequests(10);expect(rows.map(r=>[r.source,r.id,r.status])).toEqual([['legacy',8,'completed'],['current',8,'approved']]);
  expect(JSON.stringify(rows)).not.toMatch(/secret|sensitive QR|internal|private-token/);
});
