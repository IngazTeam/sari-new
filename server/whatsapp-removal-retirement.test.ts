import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({getDb:vi.fn(),getPool:vi.fn()}));
vi.mock('./db/connection',async original=>({...await original<any>(),getDb:m.getDb,getPool:m.getPool}));
import {appRouter} from './routers';
import {whatsappRouter} from './routers-whatsapp';
beforeEach(()=>{vi.resetAllMocks();m.getDb.mockImplementation(()=>{throw Error('Legacy deletion accessed DB');});m.getPool.mockImplementation(()=>{throw Error('Legacy deletion accessed DB');});});
const ctx=(role='user')=>({user:{id:7,role},req:{headers:{'x-merchant-id':'20'}},res:{}} as any);
it.each(['user','admin'])('closes both legacy delete mounts for %s without touching storage',async role=>{await expect(appRouter.createCaller(ctx(role)).whatsapp.deleteInstance({instanceId:3})).rejects.toMatchObject({code:'PRECONDITION_FAILED',message:'whatsapp_remove:review_required'});await expect(whatsappRouter.createCaller(ctx(role)).deleteInstance({instanceId:3})).rejects.toMatchObject({code:'PRECONDITION_FAILED'});expect(m.getDb).not.toHaveBeenCalled();expect(m.getPool).not.toHaveBeenCalled();});
it('requires authentication for legacy deletion',async()=>{await expect(appRouter.createCaller({...ctx(),user:null}).whatsapp.deleteInstance({instanceId:3})).rejects.toMatchObject({code:'UNAUTHORIZED'});expect(m.getDb).not.toHaveBeenCalled();});
