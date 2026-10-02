import {describe,expect,it} from 'vitest';
import {sallaSyncRequest,sallaSyncLookup,sallaSyncReceipt} from '../shared/salla-sync-request';
const requestId='5b9890df-e322-42e7-9767-56d1231ba7fd',revision='a'.repeat(64);
const receipt={actorId:1,merchantId:2,requestId,revision,syncType:'full',outcome:'success',logId:3,itemsSynced:5,createdAt:'2026-10-02T00:00:00.000Z',checkedAt:'2026-10-02T00:00:01.000Z',replayed:true};
describe('reviewed Salla sync contracts',()=>{
 it('normalizes the same UUID and defaults to stock only with a reviewed definition',()=>{expect(sallaSyncRequest.parse({requestId:requestId.toUpperCase(),revision})).toEqual({requestId,revision,syncType:'stock'});expect(sallaSyncLookup.parse({requestId})).toEqual({requestId});});
 it.each([{requestId},{revision},{requestId,revision,actorId:8},{requestId,revision,merchantId:8},{requestId,revision,syncType:'anything'}])('rejects missing review and extra or malformed intent %j',value=>expect(sallaSyncRequest.safeParse(value).success).toBe(false));
 it.each([{itemsSynced:null},{logId:null},{itemsSynced:-1},{itemsSynced:1.1},{outcome:'pending',itemsSynced:5},{outcome:'interrupted',itemsSynced:0},{accessToken:'private'},{outcome:'queued'}])('rejects unsupported completion claims or secrets %j',patch=>expect(sallaSyncReceipt.safeParse({...receipt,...patch}).success).toBe(false));
 it('keeps uncertainty explicit and can retain a confirmed partial count on failure',()=>{expect(sallaSyncReceipt.parse({...receipt,outcome:'interrupted',itemsSynced:null}).outcome).toBe('interrupted');expect(sallaSyncReceipt.parse({...receipt,outcome:'failed',itemsSynced:2}).itemsSynced).toBe(2);});
});
