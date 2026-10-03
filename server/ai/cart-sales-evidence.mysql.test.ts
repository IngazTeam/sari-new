import {beforeEach,afterEach,afterAll,describe,it,expect} from 'vitest';
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {loadArsenal,selectPersuasion} from './sales-arsenal';
import {loadLightweightArsenal} from './lightweight-arsenal';
describe.skipIf(!process.env.DATABASE_URL)('cart evidence on local MySQL',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,cartId:number;
 const phone='966500000001',q=async(sql:string,args:any[]=[])=>(await (await getPool())!.execute<any>(sql,args))[0];
 const add=async(merchantId:number,customerPhone:string,name:string)=>{const r=await q('INSERT INTO abandoned_carts (merchantId,customerPhone,customerName,items,totalAmount,reminderSent,recovered) VALUES (?,?,?,?,250,0,0)',[merchantId,customerPhone,'Example',JSON.stringify([{productId:8,productName:name,quantity:2,price:125}])]);return Number(r.insertId);};
 beforeEach(async()=>{owner=await createDisposableMerchant('cart-evidence');other=await createDisposableMerchant('other-cart');cartId=await add(owner.merchantId,'+'+phone,'حقيبة صحيحة');await add(owner.merchantId,'966500000002','عميل آخر');await add(other.merchantId,phone,'تيننت آخر');});
 afterEach(async()=>{await cleanupDisposableMerchants([owner?.userId,other?.userId].filter(Boolean));});afterAll(closeDb);
 for(const [label,load] of [['full',loadArsenal],['fast',loadLightweightArsenal]] as const){
  it(`keeps ${label} context scoped and never exposes the raw amount as a quote`,async()=>{
   const arsenal=await load(owner.merchantId,phone+'@c.us');expect(arsenal.abandonedCart).toMatchObject({id:cartId,merchantId:owner.merchantId,items:[{name:'حقيبة صحيحة',quantity:2}],recordedTotal:250,currency:null});
   const plan=selectPersuasion({} as any,arsenal,'inquiring','neutral',[],{customerMessage:'ما المنتجات في سلتي؟'});expect(plan.strategy).toBe('cart_recovery');expect(plan.prompt).toContain('حقيبة صحيحة');expect(plan.prompt).not.toMatch(/عميل آخر|تيننت آخر|"(?:total|price|recordedTotal)"\s*:|ريال|SAR/);
   const deliveries=await q('SELECT COUNT(*) total FROM whatsapp_message_deliveries WHERE merchant_id=?',[owner.merchantId]);expect(Number(deliveries[0].total)).toBe(0);
  });
  it(`refreshes ${label} evidence after recording recovery and excludes malformed source`,async()=>{
   expect((await load(owner.merchantId,phone)).abandonedCart?.id).toBe(cartId);
   await q('UPDATE abandoned_carts SET recovered=1,recoveredAt=UTC_TIMESTAMP() WHERE id=? AND merchantId=?',[cartId,owner.merchantId]);expect((await load(owner.merchantId,phone)).abandonedCart).toBeNull();
   await q("UPDATE abandoned_carts SET recovered=0,recoveredAt=NULL,items='{}' WHERE id=? AND merchantId=?",[cartId,owner.merchantId]);expect((await load(owner.merchantId,phone)).abandonedCart).toBeNull();
  });
 }
 it('keeps full and fast evidence aligned on actual storage field names',async()=>{const full=(await loadArsenal(owner.merchantId,phone)).abandonedCart!,fast=(await loadLightweightArsenal(owner.merchantId,phone)).abandonedCart!;const {checkedAt:a,...one}=full,{checkedAt:b,...two}=fast;expect(one).toEqual(two);expect(a).toBeTruthy();expect(b).toBeTruthy();});
});
