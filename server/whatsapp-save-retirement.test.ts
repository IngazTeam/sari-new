import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({getDb:vi.fn(),getPool:vi.fn()}));
vi.mock('./db/connection',async original=>({...await original<any>(),getDb:m.getDb,getPool:m.getPool}));
import {appRouter} from './routers';import {whatsappRouter} from './routers-whatsapp';
beforeEach(()=>{vi.resetAllMocks();for(const f of Object.values(m))f.mockImplementation(()=>{throw Error('Legacy save touched storage');});});
const ctx=(role='user')=>({user:{id:7,role},req:{headers:{'x-merchant-id':'20'}},res:{}}as any);
it.each(['user','admin'])('closes legacy save for %s in both mounts before storage',async role=>{const input={instanceId:'7510123456',token:'local_token',phoneNumber:'99900000001',expiresAt:'2099-01-01'};await expect(appRouter.createCaller(ctx(role)).whatsapp.saveInstance(input)).rejects.toMatchObject({code:'PRECONDITION_FAILED',message:'whatsapp_save:review_required'});await expect(whatsappRouter.createCaller(ctx(role)).saveInstance(input)).rejects.toMatchObject({code:'PRECONDITION_FAILED'});expect(m.getDb).not.toHaveBeenCalled();expect(m.getPool).not.toHaveBeenCalled();});
it('retains authentication on the closed endpoint',async()=>{await expect(appRouter.createCaller({...ctx(),user:null}).whatsapp.saveInstance({})).rejects.toMatchObject({code:'UNAUTHORIZED'});expect(m.getDb).not.toHaveBeenCalled();});
