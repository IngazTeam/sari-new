import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),write:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./promotion-writes',async original=>({...await original<typeof import('./promotion-writes')>(),writePromotion:m.write}));
import {promotionsRouter} from './routers-promotions';
import {appRouter} from './routers';
import {PromotionWriteError} from './promotion-writes';
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({merchantId:20,role:'manager'});m.write.mockResolvedValue({id:8});});
for(const mounted of [false,true]){
 const caller=(user:any={id:7,role:'user'},selection='20')=>{const ctx={user,merchantId:999,merchantRole:'owner',req:{headers:{'x-merchant-id':selection}},res:{}} as any;return mounted?appRouter.createCaller(ctx).promotions:promotionsRouter.createCaller(ctx);};
 it(`binds every compatibility write to current selected membership mounted=${mounted}`,async()=>{
  const c=caller();await c.create({title:'Offer',type:'percentage',value:15});await c.update({id:8,title:'Changed'});await c.toggleActive({id:8});await c.delete({id:8});expect(m.write.mock.calls.map(([actor,merchant,value])=>[actor,merchant,value.action])).toEqual([[7,20,'create'],[7,20,'update'],[7,20,'toggle'],[7,20,'delete']]);
 });
 it.each(['viewer','sales_supervisor','revoked'])(`rejects %s management mounted=${mounted}`,async role=>{m.access.mockResolvedValue(role==='revoked'?null:{merchantId:20,role});const c=caller();for(const run of [()=>c.create({title:'Offer',type:'percentage',value:15}),()=>c.update({id:8,title:'Changed'}),()=>c.toggleActive({id:8}),()=>c.delete({id:8})])await expect(run()).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.write).not.toHaveBeenCalled();});
 it(`rejects unauthenticated and scope-forged writes mounted=${mounted}`,async()=>{await expect(caller(null).delete({id:8})).rejects.toMatchObject({code:'UNAUTHORIZED'});await expect(caller().create({title:'Offer',type:'percentage',value:15,merchantId:99} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});await expect(caller(undefined,'20junk').delete({id:8})).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.write).not.toHaveBeenCalled();});
 it(`hides SQL details and preserves unknown-result meaning mounted=${mounted}`,async()=>{m.write.mockRejectedValue(Error('PRIVATE SQL'));await expect(caller().delete({id:8})).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR',message:'promotion_write:unavailable'});m.write.mockRejectedValue(new PromotionWriteError('unknown'));await expect(caller().delete({id:8})).rejects.toMatchObject({message:'promotion_write:unknown'});});
}
