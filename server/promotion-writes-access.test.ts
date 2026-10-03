import {readFileSync} from 'node:fs';
import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),write:vi.fn(),review:vi.fn(),apply:vi.fn(),read:vi.fn(),db:vi.fn(),pool:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./promotion-writes',async original=>({...await original<typeof import('./promotion-writes')>(),applyPromotionMutation:m.write}));
vi.mock('./promotion-actions',async original=>({...await original<typeof import('./promotion-actions')>(),reviewPromotionAction:m.review,applyPromotionAction:m.apply}));
vi.mock('./promotion-workspace-store',async original=>({...await original<typeof import('./promotion-workspace-store')>(),readPromotionWorkspace:m.read}));
vi.mock('./db',async original=>({...await original<typeof import('./db')>(),getDb:m.db,getPool:m.pool}));
import {promotionsRouter} from './routers-promotions';
import {appRouter} from './routers';
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({merchantId:20,role:'manager'});});
const inputs={list:{activeOnly:true},getById:{id:8},getStats:undefined,create:{title:'Offer',type:'percentage',value:15},update:{id:8,title:'Changed'},toggleActive:{id:8},delete:{id:8}};
const untouched=()=>{for(const fn of [m.write,m.review,m.apply,m.read,m.db,m.pool])expect(fn).not.toHaveBeenCalled();};
for(const mounted of [false,true]){
 const caller=(user:any={id:7,role:'user'},selection='20')=>{const ctx={user,merchantId:999,merchantRole:'owner',req:{headers:{'x-merchant-id':selection}},res:{}} as any;return mounted?appRouter.createCaller(ctx).promotions:promotionsRouter.createCaller(ctx);};
 it(`retires every old promotion endpoint without reading or writing mounted=${mounted}`,async()=>{for(const [name,input] of Object.entries(inputs))await expect((caller() as any)[name](input)).rejects.toMatchObject({code:'PRECONDITION_FAILED',message:'promotion_write:reload_reviewed_workspace'});expect(m.access).toHaveBeenCalledWith(7,20);untouched();});
 it.each(['viewer','sales_supervisor','revoked'])(`keeps management permissions on old %s calls mounted=${mounted}`,async role=>{m.access.mockResolvedValue(role==='revoked'?null:{merchantId:20,role});for(const name of ['create','update','toggleActive','delete'] as const)await expect((caller() as any)[name](inputs[name])).rejects.toMatchObject({code:'FORBIDDEN'});untouched();});
 it(`rejects anonymous and scope-forged old calls mounted=${mounted}`,async()=>{for(const [name,input] of Object.entries(inputs))await expect((caller(null) as any)[name](input)).rejects.toMatchObject({code:'UNAUTHORIZED'});await expect(caller().create({...inputs.create,merchantId:99} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});await expect(caller().getById({id:0})).rejects.toMatchObject({code:'BAD_REQUEST'});await expect(caller(undefined,'20junk').delete({id:8})).rejects.toMatchObject({code:'BAD_REQUEST'});untouched();});
 it(`does not serve legacy analytics after revocation mounted=${mounted}`,async()=>{m.access.mockResolvedValue(null);for(const name of ['list','getById','getStats'] as const)await expect((caller() as any)[name](inputs[name])).rejects.toMatchObject({code:'FORBIDDEN'});untouched();});
}
it('removes the unreviewed writer and unused legacy read helpers from production',()=>{const writes=readFileSync('server/promotion-writes.ts','utf8'),router=readFileSync('server/routers-promotions.ts','utf8'),db=readFileSync('server/db.ts','utf8');expect(writes).not.toContain('export function writePromotion');expect(router).not.toContain("from './db'");expect(router).not.toContain('await writePromotion');for(const fn of ['getPromotionsByMerchant','countActivePromotions'])expect(db).not.toContain('export async function '+fn);});
