import {readFileSync} from 'node:fs';
import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),read:vi.fn(),record:vi.fn(),review:vi.fn(),send:vi.fn(),db:vi.fn(),pool:vi.fn(),schedule:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./db',async original=>({...await original<typeof import('./db')>(),getDb:m.db,getPool:m.pool}));
vi.mock('./abandoned-cart-workspace-store',async original=>({...await original<typeof import('./abandoned-cart-workspace-store')>(),readCartWorkspace:m.read,reviewCartRecovery:m.review,recordCartRecovery:m.record}));
vi.mock('./abandoned-cart-reminder-transport',()=>({sendReviewedCartReminder:m.send}));
vi.mock('node-cron',()=>({default:{schedule:m.schedule}}));
import {abandonedCartsRouter} from './routers-abandoned-carts';
import {appRouter} from './routers';
import {startAbandonedCartJob} from './jobs/abandoned-cart';
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({merchantId:20,role:'owner'});});
const inputs={list:{merchantId:999},getStats:{merchantId:999},markRecovered:{cartId:31},sendReminder:{cartId:31}};
for(const mounted of [false,true]){
 const caller=(user:any={id:7,role:'user'},selection='20')=>{const ctx={user,merchantId:999,merchantRole:'owner',req:{headers:{'x-merchant-id':selection}},res:{}} as any;return mounted?appRouter.createCaller(ctx).abandonedCarts:abandonedCartsRouter.createCaller(ctx);};
 it(`requires reloading all legacy endpoints without any read or write mounted=${mounted}`,async()=>{
  for(const [name,input] of Object.entries(inputs))await expect((caller() as any)[name](input)).rejects.toMatchObject({code:'PRECONDITION_FAILED',message:'abandoned_cart:reload_reviewed_workspace'});
  expect(m.access).toHaveBeenCalledWith(7,20);for(const f of [m.read,m.record,m.review,m.send,m.db,m.pool])expect(f).not.toHaveBeenCalled();
 });
 it(`does not let old requests bypass current permissions mounted=${mounted}`,async()=>{
  for(const [name,input] of Object.entries(inputs))await expect((caller(null) as any)[name](input)).rejects.toMatchObject({code:'UNAUTHORIZED'});
  m.access.mockResolvedValue({merchantId:20,role:'viewer'});
  for(const name of ['markRecovered','sendReminder'] as const)await expect(caller()[name](inputs[name])).rejects.toMatchObject({code:'FORBIDDEN'});
  m.access.mockResolvedValue(null);await expect(caller().list(inputs.list)).rejects.toMatchObject({code:'FORBIDDEN'});
  for(const f of [m.read,m.record,m.review,m.send,m.db,m.pool])expect(f).not.toHaveBeenCalled();
 });
 it(`rejects malformed IDs, injected fields and malformed selection mounted=${mounted}`,async()=>{
  await expect(caller().sendReminder({cartId:0})).rejects.toMatchObject({code:'BAD_REQUEST'});
  await expect(caller().sendReminder({cartId:31,merchantId:999} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
  await expect(caller(undefined,'20x').getStats({merchantId:20})).rejects.toMatchObject({code:'BAD_REQUEST'});
  expect(m.send).not.toHaveBeenCalled();expect(m.db).not.toHaveBeenCalled();
 });
}
it('does not schedule a legacy scan even through its compatibility entry point',()=>{expect(startAbandonedCartJob()).toEqual({scheduled:false,reason:'review_required'});expect(m.schedule).not.toHaveBeenCalled();});
it('removes the global sender and unscoped cart flag writers from executable source',()=>{
 const legacy=readFileSync('server/automation/abandoned-cart-recovery.ts','utf8'),startup=readFileSync('server/_core/index.ts','utf8'),db=readFileSync('server/db.ts','utf8'),router=readFileSync('server/routers-abandoned-carts.ts','utf8');
 for(const text of ['sendTextMessage','../whatsapp','createDiscountCode','getPendingAbandonedCarts','@ts-ignore'])expect(legacy).not.toContain(text);
 expect(startup).not.toContain('startAbandonedCartJob');
 for(const text of ['export async function getPendingAbandonedCarts','export async function markAbandonedCartReminderSent','export async function markAbandonedCartRecovered'])expect(db).not.toContain(text);
 expect(router).not.toContain("from './db'");expect(router).not.toContain("import('./automation/abandoned-cart-recovery')");
});
