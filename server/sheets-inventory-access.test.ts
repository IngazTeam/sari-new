import { describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({read:vi.fn(),update:vi.fn()}));
vi.mock('./db',()=>({
  getGoogleIntegration:vi.fn().mockResolvedValue({isActive:1,sheetId:'fixture'}),
  getProductsByMerchantId:vi.fn().mockResolvedValue([{id:4}]),
  updateProduct:mocks.update,
  updateGoogleIntegration:vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./_core/googleSheets',()=>({readFromSheet:mocks.read}));
import { updateInventoryFromSheets } from './sheetsSync';
describe('spreadsheet inventory tenant boundary',()=>{
  it('rejects foreign IDs, negative/fractional stock and malformed numeric strings',async()=>{
    mocks.read.mockResolvedValue({success:true,values:[
      ['4','','','','2'],['99','','','','5'],['4','','','','-1'],
      ['4','','','','1.5'],['4x','','','','4'],['4','','','','2147483648'],
    ]});
    const result=await updateInventoryFromSheets(7);
    expect(result.updatedCount).toBe(1);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(4,{stock:2},'major');
  });
});
