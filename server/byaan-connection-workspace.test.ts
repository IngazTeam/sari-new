import {beforeEach,it,expect,vi} from 'vitest';
import {byaanDomainInput,byaanRegisterInput,byaanDisconnectInput} from '../shared/byaan-connection-workspace';
const m=vi.hoisted(()=>({access:vi.fn(),read:vi.fn(),retire:vi.fn(),register:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./integrations/byaan-connection-workspace',async original=>({...await original<typeof import('./integrations/byaan-connection-workspace')>(),readByaanConnectionWorkspace:m.read,retireByaanConnection:m.retire,registerByaanDomain:m.register}));
import {ByaanConnectionFault} from './integrations/byaan-connection-workspace';
import {integrationsRouter} from './routers-integrations';
import {appRouter} from './routers';
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({merchantId:20,role:'manager'});m.read.mockResolvedValue({merchantId:20,actorId:7});m.retire.mockResolvedValue({disconnected:true,notification:'queued'});});
it.each(['https://a.example.com','a.example.com/path','a@example.com','a.example.com:443','a..com','-a.com','a-.com','localhost','127.0.0.1','host.local','a.internal','a.com?x=y','a.com#x','<img>.com','a'.repeat(64)+'.com'])('rejects invalid domain %s',value=>expect(byaanDomainInput.safeParse(value).success).toBe(false));
it('normalizes domains without expanding accepted authority',()=>{expect(byaanDomainInput.parse(' Academy.Example.COM. ')).toBe('academy.example.com');expect(byaanRegisterInput.safeParse({tenantDomain:'a.com',merchantId:999}).success).toBe(false);expect(byaanDisconnectInput.safeParse({revision:'a'.repeat(64),merchantId:999}).success).toBe(false);});
for(const mounted of [false,true]) {
 const caller=(user:any={id:7,role:'user'})=>{const ctx={user,merchantId:999,req:{headers:{'x-merchant-id':'20'}},res:{}} as any;return mounted?appRouter.createCaller(ctx).integrations:integrationsRouter.createCaller(ctx);};
 const revision='a'.repeat(64);
 it(`uses selected identity for read and reviewed disconnect (${mounted})`,async()=>{await caller().byaanConnectionWorkspace();expect(m.read).toHaveBeenCalledWith(7,20);expect(await caller().disconnectByaan({revision})).toEqual({actorId:7,merchantId:20,disconnected:true,notification:'queued'});expect(m.retire).toHaveBeenCalledWith(20,revision,7);});
 it.each(['read','disconnect'])(`blocks missing/revoked/viewer identity for %s (${mounted})`,async action=>{const call=(api=caller())=>action==='read'?api.byaanConnectionWorkspace():api.disconnectByaan({revision});await expect(call(caller(null))).rejects.toMatchObject({code:'UNAUTHORIZED'});for(const access of [null,{merchantId:20,role:'viewer'},{merchantId:20,role:'agent'}]){m.access.mockResolvedValue(access);await expect(call()).rejects.toMatchObject({code:'FORBIDDEN'});}expect(m.read).not.toHaveBeenCalled();expect(m.retire).not.toHaveBeenCalled();});
 it(`rejects missing revision or injected tenant (${mounted})`,async()=>{for(const input of [{},{revision:'bad'},{revision,merchantId:999}])await expect(caller().disconnectByaan(input as any)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.retire).not.toHaveBeenCalled();});
 it.each(['stale','conflict','missing','unavailable'] as const)(`returns stable ${'%s'} fault without leaking SQL (${mounted})`,async reason=>{m.retire.mockRejectedValue(new ByaanConnectionFault(reason));await expect(caller().disconnectByaan({revision})).rejects.toMatchObject({message:`byaan_connection:${reason}`});m.read.mockRejectedValue(Error('SECRET SQL'));await expect(caller().byaanConnectionWorkspace()).rejects.toMatchObject({message:'byaan_connection:unavailable'});});
}
