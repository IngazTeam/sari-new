import {describe,it,expect,vi,beforeEach} from 'vitest';
const db=vi.hoisted(()=>({read:vi.fn(),pool:vi.fn()}));
vi.mock('./db',()=>({getDb:db.read,getPool:db.pool,getMerchantById:db.read,getProductById:db.read,updateProduct:db.read}));
import {productsRouter} from './routers-products';
import * as productDb from './db/products';
beforeEach(()=>vi.clearAllMocks());
describe('retired category mutation surface',()=>{
  for(const route of ['listCategories','createCategory','updateCategory','deleteCategory'])
    it.each([null,{id:7}])(`rejects ${route} for %j before database work`,async user=>{
      const caller:any=productsRouter.createCaller({user,req:{},res:{}} as any);
      await expect(caller[route]({id:1,name:'legacy',parentId:99})).rejects.toMatchObject({code:'NOT_FOUND'});
      expect(db.read).not.toHaveBeenCalled();expect(db.pool).not.toHaveBeenCalled();
    });
  it('retains reviewed category operations and independent options/variants',()=>{
    for(const route of ['categories.read','categories.write','categories.receipt','list','editor.write','details.read','details.write','details.receipt'])expect(Object.keys(productsRouter._def.procedures)).toContain(route);
    for(const name of ['getCategoriesByMerchantId','createCategory','updateCategory','deleteCategory'])expect(name in productDb).toBe(false);
    for(const name of ['getOptionsByProductId','createOption','updateOption','deleteOption','getVariantsByProductId','createVariant','updateVariant','deleteVariant','bulkCreateVariants','deleteVariantsByProductId'])expect(name in productDb).toBe(false);
  });
});
