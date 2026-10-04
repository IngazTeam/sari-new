import {beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
const m=vi.hoisted(()=>({access:vi.fn(),read:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./analytics/acquisition-workspace',()=>({readAcquisitionWorkspace:m.read}));
vi.mock('./db',()=>({}));
import {acquisitionRouter as analyticsRouter} from './routers-acquisition-workspace';
import {MerchantSettingsAuthorityError} from './accounts/merchant-settings-authority';
const caller=(user:any={id:7,role:'user'})=>analyticsRouter.createCaller({user,req:{headers:{'x-merchant-id':'20'}},res:{}} as any);
it('mounts the same tested procedures in the actual analytics namespace',()=>{
 expect(readFileSync('server/routers.ts','utf8')).toMatch(/analytics: router\(\{\s*\.\.\.acquisitionProcedures,/);
 expect(readFileSync('client/src/pages/merchant/AcquisitionReport.tsx','utf8')).not.toMatch(/@ts-nocheck|@ts-ignore/);
});
beforeEach(()=>{vi.clearAllMocks();m.access.mockResolvedValue({merchantId:20,role:'viewer'});m.read.mockResolvedValue({totalProfiles:3,sources:[{source:'unattributed',count:3,sharePermille:1000}]});});
it('uses the selected tenant and actor for the bounded workspace',async()=>{await caller().acquisitionWorkspace({period:'30d'});expect(m.access).toHaveBeenCalledWith(7,20);expect(m.read).toHaveBeenCalledWith(7,20,{period:'30d'});});
it.each([{merchantId:21},{period:'bad'},{period:'all',actorId:99}])('rejects forged new workspace input %j',async input=>{await expect(caller().acquisitionWorkspace(input as any)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.read).not.toHaveBeenCalled();});
it('keeps legacy reads on the same corrected source without accepting tenant substitution',async()=>{
 expect(await caller().getAcquisitionSources({merchantId:20})).toEqual({totalCustomers:3,sources:[{source:'unattributed',count:3,percentage:100}]});m.read.mockClear();await expect(caller().getAcquisitionSources({merchantId:21})).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.read).not.toHaveBeenCalled();
});
it('blocks anonymous reads',async()=>{await expect(caller(null).acquisitionWorkspace({period:'all'})).rejects.toMatchObject({code:'UNAUTHORIZED'});expect(m.read).not.toHaveBeenCalled();});
it.each([new Error('PRIVATE_SQL'),new MerchantSettingsAuthorityError('forbidden')])('redacts source errors and never turns them into empty metrics %#',async error=>{m.read.mockRejectedValue(error);await expect(caller().acquisitionWorkspace({period:'all'})).rejects.toMatchObject({message:'acquisition:unavailable',code:error instanceof MerchantSettingsAuthorityError?'FORBIDDEN':'INTERNAL_SERVER_ERROR'});});
