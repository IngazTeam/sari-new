import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({getDb:vi.fn(),where:vi.fn()}));
vi.mock('./db/connection',async importOriginal=>({...await importOriginal<typeof import('./db/connection')>(),getDb:m.getDb}));
import {updateMerchant} from './db';
beforeEach(()=>{vi.resetAllMocks();m.getDb.mockResolvedValue({update:()=>({set:()=>({where:m.where})})});});
it('does not acknowledge a merchant update without a database',async()=>{
 m.getDb.mockResolvedValue(null);await expect(updateMerchant(12,{businessName:'Local'})).rejects.toThrow('MERCHANT_UPDATE_UNCONFIRMED');expect(m.where).not.toHaveBeenCalled();
});
it.each([0,2,undefined])('does not acknowledge an update with affectedRows=%s',async affectedRows=>{
 m.where.mockResolvedValue([{affectedRows}]);await expect(updateMerchant(12,{businessName:'Local'})).rejects.toThrow('MERCHANT_UPDATE_UNCONFIRMED');
});
it('accepts a matched unchanged row as well as a changed row',async()=>{
 for(const changedRows of [0,1]){m.where.mockResolvedValue([{affectedRows:1,changedRows}]);await expect(updateMerchant(12,{businessName:'Local'})).resolves.toBeUndefined();}
});
it('does not swallow a lost write response',async()=>{
 m.where.mockRejectedValue(new Error('connection lost'));await expect(updateMerchant(12,{businessName:'Local'})).rejects.toThrow();expect(m.where).toHaveBeenCalledOnce();
});
