import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),read:vi.fn(),write:vi.fn(),receipt:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./product-categories',()=>({readProductCategories:m.read,writeProductCategory:m.write,readProductCategoryReceipt:m.receipt}));
import {productCategoryRouter} from './routers-product-categories';
import {CategoryPlanFailure} from '../shared/product-categories';
import {ProductEditorConflict,ProductEditorLocked,ProductEditorForbidden,ProductEditorMissing} from './product-editor';
const requestId='22222222-2222-4222-8222-222222222222';
const input={kind:'create' as const,requestId,reviewed:true as const,expectedDigest:'a'.repeat(64),fields:{name:'Coffee',nameEn:null,parentId:null,sortOrder:0,isActive:1 as const}};
const caller=()=>productCategoryRouter.createCaller({user:{id:9},req:{headers:{'x-merchant-id':'7'}},res:{}} as any);
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({merchantId:7,role:'manager'});});
describe('category API authority and error boundary',()=>{
  it('uses the selected merchant and actor for all operations',async()=>{
    await caller().read();await caller().write(input);await caller().receipt({requestId});
    expect(m.read).toHaveBeenCalledWith(7,9);expect(m.write).toHaveBeenCalledWith(7,9,input);expect(m.receipt).toHaveBeenCalledWith(7,9,{requestId});
  });
  it('allows viewers to read but blocks edits',async()=>{
    m.access.mockResolvedValue({merchantId:7,role:'viewer'});await caller().read();await expect(caller().write(input)).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.write).not.toHaveBeenCalled();
  });
  it.each([{reviewed:false},{merchantId:8},{expectedDigest:'bad'},{fields:{...input.fields,name:''}}])('rejects malformed writes %j before storage',async patch=>{
    await expect(caller().write({...input,...patch} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.write).not.toHaveBeenCalled();
  });
  it.each([[new ProductEditorConflict(),'CONFLICT'],[new ProductEditorLocked(),'PRECONDITION_FAILED'],[new ProductEditorForbidden(),'FORBIDDEN'],[new ProductEditorMissing(),'NOT_FOUND'],[new Error('mysql://private connection'),'INTERNAL_SERVER_ERROR']] as const)('maps errors without leaking provider/storage text',async(error,code)=>{
    m.write.mockRejectedValue(error);await expect(caller().write(input)).rejects.toMatchObject({code,message:'Category operation unavailable'});
  });
  it('returns only the bounded category reason for a review failure',async()=>{
    m.write.mockRejectedValue(new CategoryPlanFailure('cycle'));await expect(caller().write(input)).rejects.toMatchObject({code:'BAD_REQUEST',message:'category:cycle'});
  });
});
