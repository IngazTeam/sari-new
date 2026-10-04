import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),execute:vi.fn(),scope:vi.fn(),limit:vi.fn(),access:vi.fn()}));
vi.mock('axios',()=>({default:{get:m.get,post:m.post}}));
vi.mock('./accounts/merchant-settings-authority',async original=>({...await original<any>(),withMerchantOwnerSettings:m.scope}));
vi.mock('./api/distributed-rate-limit',()=>({reserveApiRateLimit:m.limit}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
import {runWhatsAppDiagnostic} from './whatsapp/diagnostic-tests';
import {whatsappDiagnosticRouter} from './routers-whatsapp-diagnostic';
import {whatsappConnectionTestInput,whatsappTextTestInput,whatsappImageTestInput} from '../shared/whatsapp-test-input';
import {MerchantSettingsAuthorityError} from './accounts/merchant-settings-authority';
const credentials={instanceId:'7103123456',token:'PRIVATE_token_123'},text={...credentials,phoneNumber:'99900000001',message:'Test'},image={...credentials,phoneNumber:'99900000001',imageUrl:'https://cdn.example.com/test.png',caption:'Test'};
const saved={id:3,merchant_id:20,provider:'green_api',token:credentials.token,api_url:'https://api.green-api.com',status:'active',unexpired:1};
const caller=()=>whatsappDiagnosticRouter.createCaller({user:{id:7,role:'user'},req:{headers:{'x-merchant-id':'20'}}} as any);
beforeEach(()=>{
 vi.resetAllMocks();m.scope.mockImplementation((_actor,_merchant,_write,work)=>work({execute:m.execute},{canManage:true}));m.execute.mockResolvedValue([[{...saved}]]);m.limit.mockResolvedValue({allowed:true});m.access.mockResolvedValue({merchantId:20,role:'owner'});
 m.get.mockResolvedValueOnce({status:200,data:{stateInstance:'authorized',PRIVATE:'secret'}}).mockResolvedValue({status:200,data:{wid:'99900000001@c.us',PRIVATE:'secret'}});m.post.mockResolvedValue({status:200,data:{idMessage:'receipt_1',PRIVATE:'secret'}});
});
it('returns only verified connection state and phone under a current owner fence',async()=>{
 expect(await caller().testConnection(credentials)).toEqual({success:true,status:'authorized',phoneNumber:'99900000001'});expect(m.scope).toHaveBeenCalledTimes(2);expect(m.scope.mock.calls.every(c=>c[0]===7&&c[1]===20&&c[2]===false)).toBe(true);
 expect(m.access).toHaveBeenCalledWith(7,20);expect(m.get.mock.calls[0][0]).toBe('https://api.green-api.com/waInstance7103123456/getStateInstance/PRIVATE_token_123');expect(m.get.mock.calls[0][1]).toMatchObject({maxRedirects:0,timeout:15000,maxContentLength:65536});
});
it('allows an owner to verify unbound credentials without saving them or sending a message',async()=>{m.execute.mockResolvedValue([[]]);expect(await caller().testConnection(credentials)).toMatchObject({success:true});expect(m.get.mock.calls[0][0]).toMatch(/^https:\/\/7103\.api\.greenapi\.com\//);expect(m.post).not.toHaveBeenCalled();expect(m.execute.mock.calls.every(([sql])=>String(sql).startsWith('SELECT'))).toBe(true);});
it.each(['text','image'] as const)('projects a genuine %s acceptance and shares the persistent sending limit',async method=>{
 const result=method==='text'?await caller().sendTestMessage(text):await caller().sendTestImage(image);expect(result).toEqual({idMessage:'receipt_1',accepted:true});expect(JSON.stringify(result)).not.toContain('PRIVATE');expect(m.limit).toHaveBeenCalledWith({namespace:'whatsapp:diagnostic:send',identity:'20',maxRequests:10,windowMs:86400000});expect(m.post.mock.calls[0][1].chatId).toBe('99900000001@c.us');expect(m.post.mock.calls[0][2]).toMatchObject({maxRedirects:0,timeout:15000});
});
it.each(['viewer','manager','sales_supervisor'])('blocks %s before provider, limiter and scoped reads',async role=>{m.access.mockResolvedValue({merchantId:20,role});await expect(caller().testConnection(credentials)).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.scope).not.toHaveBeenCalled();expect(m.limit).not.toHaveBeenCalled();expect(m.get).not.toHaveBeenCalled();});
it('blocks signed-out, unresolved and invalid selected tenants',async()=>{
 await expect(whatsappDiagnosticRouter.createCaller({user:null} as any).sendTestMessage(text)).rejects.toMatchObject({code:'UNAUTHORIZED'});m.access.mockResolvedValue(null);await expect(caller().sendTestImage(image)).rejects.toMatchObject({code:'FORBIDDEN'});
 await expect(whatsappDiagnosticRouter.createCaller({user:{id:7},req:{headers:{'x-merchant-id':'20x'}}} as any).testConnection(credentials)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.get).not.toHaveBeenCalled();expect(m.limit).not.toHaveBeenCalled();
});
it.each([{merchant_id:21},{provider:'meta_cloud'},{token:'other-token'},{token:null}])('rejects foreign or mismatched connection %j before effects',async patch=>{m.execute.mockResolvedValue([[{...saved,...patch}]]);await expect(runWhatsAppDiagnostic(7,20,'connection',credentials)).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.limit).not.toHaveBeenCalled();expect(m.get).not.toHaveBeenCalled();});
it.each(['text','image'] as const)('requires a saved, active, unexpired identity to send %s',async method=>{
 for(const rows of [[],[{...saved,status:'inactive'}],[{...saved,status:'expired'}],[{...saved,unexpired:0}]]){m.execute.mockResolvedValue([rows]);await expect(runWhatsAppDiagnostic(7,20,method,method==='text'?text:image)).rejects.toMatchObject({code:'PRECONDITION_FAILED'});}expect(m.limit).not.toHaveBeenCalled();expect(m.post).not.toHaveBeenCalled();
});
it.each(['http://api.green-api.com','https://api.green-api.com.evil.example/','https://api.green-api.com:8443','https://user:pass@api.green-api.com','https://api.green-api.com/private','https://api.green-api.com/?key=PRIVATE'])('rejects unsafe stored provider origin %s',async api_url=>{m.execute.mockResolvedValue([[{...saved,api_url}]]);await expect(caller().sendTestMessage(text)).rejects.toMatchObject({code:'PRECONDITION_FAILED',message:'whatsapp_test:unavailable'});expect(m.post).not.toHaveBeenCalled();});
it.each(['7103@evil.test','7103/../../','7103?host=x','7103#x','7103%2f','1'.repeat(31),'7103\n'])('rejects unsafe instance IDs %s before source or network',async instanceId=>{await expect(caller().testConnection({...credentials,instanceId})).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.scope).not.toHaveBeenCalled();expect(m.get).not.toHaveBeenCalled();});
it.each(['x/../../','token?x=1','token#x','token%2f','x'.repeat(513),'token\r\nx',''])('rejects unsafe credentials before dispatch',async token=>{await expect(caller().sendTestMessage({...text,token})).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.post).not.toHaveBeenCalled();});
it.each(['https://127.0.0.1/a','http://cdn.example.com/a','https://user:pass@cdn.example.com/a','https://[::1]/a','https://host.local/a','https://localhost/a','file:///a','https://cdn.example.com:8443/a','https://cdn.example.com/a#private'])('rejects unsupported test image URL %s',imageUrl=>expect(whatsappImageTestInput.safeParse({...image,imageUrl}).success).toBe(false));
it('enforces personal international destinations, content limits and strict caller envelopes',()=>{
 for(const phoneNumber of ['966','+966500000000','966000000000@g.us','001234567890','99900000001\n'])expect(whatsappTextTestInput.safeParse({...text,phoneNumber}).success).toBe(false);
 expect(whatsappTextTestInput.safeParse({...text,message:' '.repeat(3)}).success).toBe(false);expect(whatsappTextTestInput.safeParse({...text,message:'x'.repeat(4097)}).success).toBe(false);expect(whatsappImageTestInput.safeParse({...image,caption:'x'.repeat(1025)}).success).toBe(false);
 expect(whatsappConnectionTestInput.safeParse({...credentials,merchantId:21}).success).toBe(false);
});
it('fails closed when the persistent limiter rejects or is unavailable',async()=>{
 m.limit.mockResolvedValueOnce({allowed:false});await expect(caller().testConnection(credentials)).rejects.toMatchObject({code:'TOO_MANY_REQUESTS'});m.limit.mockRejectedValueOnce(Error('PRIVATE database'));await expect(caller().sendTestMessage(text)).rejects.toMatchObject({code:'PRECONDITION_FAILED',message:'whatsapp_test:unavailable'});expect(m.get).not.toHaveBeenCalled();expect(m.post).not.toHaveBeenCalled();
});
it('rechecks authority after reserving a request and blocks revocation',async()=>{
 m.scope.mockImplementationOnce((_a,_m,_w,work)=>work({execute:m.execute},{canManage:true})).mockRejectedValueOnce(new MerchantSettingsAuthorityError('forbidden'));await expect(caller().sendTestMessage(text)).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.limit).toHaveBeenCalledOnce();expect(m.post).not.toHaveBeenCalled();
});
it.each([{},null,[],{idMessage:12},{idMessage:''},{idMessage:'private https://example.com'},{idMessage:'x'.repeat(256)}])('does not claim successful sending from invalid provider evidence %j',async data=>{m.post.mockResolvedValue({status:200,data});await expect(caller().sendTestImage(image)).rejects.toMatchObject({message:'whatsapp_test:unavailable'});});
it.each([302,400,401,408,500])('rejects provider HTTP %i without exposing a body or following redirects',async status=>{m.post.mockResolvedValue({status,data:{idMessage:'not-accepted',secret:'PRIVATE'}});await expect(caller().sendTestMessage(text)).rejects.toMatchObject({message:'whatsapp_test:unavailable'});expect(m.post).toHaveBeenCalledOnce();});
it('never exposes provider transport errors, and does not automatically repeat a send',async()=>{m.post.mockRejectedValue(Error('PRIVATE/token in provider URL'));await expect(caller().sendTestMessage(text)).rejects.toMatchObject({message:'whatsapp_test:unavailable'});expect(m.post).toHaveBeenCalledOnce();});
it('distinguishes an unauthorised provider response from a failed or malformed read',async()=>{
 m.get.mockReset().mockResolvedValue({status:200,data:{stateInstance:'notAuthorized'}});expect(await caller().testConnection(credentials)).toEqual({success:false,status:'not_authorized'});expect(m.get).toHaveBeenCalledOnce();
 m.get.mockResolvedValue({status:200,data:{}});await expect(caller().testConnection(credentials)).rejects.toMatchObject({code:'PRECONDITION_FAILED'});
});
it('requires provider phone evidence and never trusts the unverified state-response phone',async()=>{m.get.mockReset().mockResolvedValueOnce({status:200,data:{stateInstance:'authorized',phoneNumber:'foreign'}}).mockResolvedValue({status:200,data:{wid:'foreign'}});await expect(caller().testConnection(credentials)).rejects.toMatchObject({code:'PRECONDITION_FAILED'});});
it('mounts one procedure set in both routers and removes ad-hoc request implementations',()=>{
 for(const file of ['server/routers.ts','server/routers-whatsapp.ts']){const source=readFileSync(file,'utf8');expect(source).toContain('...whatsappDiagnosticProcedures,');expect(source).not.toContain('instancePrefix = input.instanceId.substring');expect(source).not.toContain('checkTestMessageLimit');}
});
