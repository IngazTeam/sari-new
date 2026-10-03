import {beforeEach,afterEach,afterAll,describe,it,expect} from 'vitest';
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {loadArsenal} from './sales-arsenal';
import {loadLightweightArsenal} from './lightweight-arsenal';
describe.skipIf(!process.env.DATABASE_URL)('fresh promotion evidence in both sales paths',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,id:number,productId:number;
 const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
 const add=async(merchantId:number,title:string)=>{const row=await q("INSERT INTO promotions (merchant_id,title,description,type,value,scope,min_order_amount,min_quantity,product_ids,view_count,click_count) VALUES (?,?,'Saved terms','fixed',25,'products',100,2,?,9,4)",[merchantId,title,JSON.stringify([productId])]);return Number(row.insertId);};
 beforeEach(async()=>{owner=await createDisposableMerchant('promo-arsenal');other=await createDisposableMerchant('promo-arsenal-other');productId=Number((await q("INSERT INTO products (merchantId,name,nameAr,price) VALUES (?,'Arsenal item','منتج حالي',100)",[owner.merchantId])).insertId);id=await add(owner.merchantId,'Local current offer');await add(other.merchantId,'Private other tenant');});
 afterEach(async()=>{await cleanupDisposableMerchants([owner?.userId,other?.userId].filter(Boolean));});afterAll(closeDb);
 for(const [name,load] of [['full',loadArsenal],['fast',loadLightweightArsenal]] as const){
  it(`${name} keeps conditions, scope and uncertainty and never increments engagement`,async()=>{const offers=(await load(owner.merchantId,'966500000001')).activePromotions;expect(offers).toHaveLength(1);expect(offers![0]).toMatchObject({id,merchantId:owner.merchantId,scope:'products',productIds:[productId],scopeTargetEvidence:'current_store_names',scopeTargets:[{id:productId,name:'Arsenal item',alternateName:'منتج حالي'}],value:25,minOrderAmount:100,minQuantity:2,currency:null,amountUnit:'source_unspecified',customerEligibility:'not_verified',salesAttribution:'not_verified'});expect(JSON.stringify(offers)).not.toContain('Private other tenant');expect(await q('SELECT view_count,click_count FROM promotions WHERE id=?',[id])).toEqual([{view_count:9,click_count:4}]);});
  it.each(["is_active=0","starts_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY)","expires_at=UTC_TIMESTAMP()","product_ids='bad'"])(`${name} rereads and rejects invalidated definition %s`,async patch=>{expect((await load(owner.merchantId,'966500000001')).activePromotions).toHaveLength(1);await q('UPDATE promotions SET '+patch+' WHERE id=?',[id]);expect((await load(owner.merchantId,'966500000001')).activePromotions).toEqual([]);});
 }
 it('keeps full and fast evidence aligned on actual database fields',async()=>{const full=(await loadArsenal(owner.merchantId,'966500000001')).activePromotions![0],fast=(await loadLightweightArsenal(owner.merchantId,'966500000001')).activePromotions![0];const {checkedAt:a,...one}=full,{checkedAt:b,...two}=fast;expect(one).toEqual(two);expect(a).toBeTruthy();expect(b).toBeTruthy();});
});
