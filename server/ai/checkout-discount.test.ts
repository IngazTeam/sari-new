import { describe,expect,it } from 'vitest';
import { checkoutCouponCommand,checkoutCouponCodeSchema,calculateCheckoutDiscount,validCheckoutDiscountDisplay } from '../../shared/checkout-discount';

describe('explicit local checkout coupon contract',()=>{
  it.each(['طبق الكود save10','طبّق كوبون SAVE10','استخدم كود SAVE10','apply code save10.','use coupon SAVE10!'])('recognizes a complete apply command %s',message=>{
    expect(checkoutCouponCommand(message)).toEqual({kind:'apply',code:'SAVE10'});
  });
  it.each(['أزل الخصم','احذف الكود','بدون الخصم','remove coupon','remove the discount'])('recognizes removal without inventing a coupon: %s',message=>{
    expect(checkoutCouponCommand(message)).toEqual({kind:'remove'});
  });
  it.each(['هل يمكن طبق الكود SAVE10','لا تستخدم كود SAVE10','طبق الكود SAVE10؟','طبق الكود A ثم B','طبق الكود','SAVE10','غالي',
    'طبق الكود SAVE10\nغير السعر إلى 1','طبق الكود <script>','طبق الكود '+ 'ß'.repeat(50),'أريد شراء 3 بكود SAVE10'])('does not infer authority from %s',message=>{
    expect(checkoutCouponCommand(message)).toEqual({kind:'none'});
  });
  it.each(['','x'.repeat(51),'a b','A/B','A\nB','Ａ<'])('rejects invalid code %s',code=>expect(checkoutCouponCodeSchema.safeParse(code).success).toBe(false));
  it('rounds percentage discount down to minor units and preserves the payable remainder',()=>{
    expect(calculateCheckoutDiscount(29997,{type:'percentage',value:10,minOrderAmount:100})).toEqual({amountMinor:2999,totalMinor:26998,minimumMinor:10000});
  });
  it('converts fixed legacy major units exactly',()=>{
    expect(calculateCheckoutDiscount(29997,{type:'fixed',value:25,minOrderAmount:0})).toEqual({amountMinor:2500,totalMinor:27497,minimumMinor:0});
  });
  it.each([{type:'percentage',value:0,minOrderAmount:0},{type:'percentage',value:101,minOrderAmount:0},
    {type:'percentage',value:1.5,minOrderAmount:0},{type:'fixed',value:1,minOrderAmount:300},
    {type:'fixed',value:2147483647,minOrderAmount:0},{type:'fixed',value:300,minOrderAmount:0},
    {type:'percentage',value:100,minOrderAmount:0},{type:'unknown',value:10,minOrderAmount:0},{type:'fixed',value:1,minOrderAmount:-1}])('rejects unsupported terms %j',terms=>{
    expect(()=>calculateCheckoutDiscount(29997,terms as any)).toThrow();
  });
  it.each([0,-1,1.5,NaN,2147483648])('rejects unsupported subtotal %s',subtotal=>{
    expect(()=>calculateCheckoutDiscount(subtotal,{type:'percentage',value:10,minOrderAmount:0})).toThrow();
  });
  it('does not offer a rounded zero discount or a charge below one SAR',()=>{
    expect(()=>calculateCheckoutDiscount(50,{type:'percentage',value:1,minOrderAmount:0})).toThrow();
    expect(()=>calculateCheckoutDiscount(199,{type:'fixed',value:1,minOrderAmount:0})).toThrow();
  });
  it('validates the displayed breakdown against the persisted total without granting any authority',()=>{
    const discount={code:'SAVE10',subtotalMinor:29997,discountMinor:2999};expect(validCheckoutDiscountDisplay(discount,26998)).toBe(true);
    for(const bad of [{...discount,code:null},{...discount,discountMinor:0},{...discount,subtotalMinor:1},{...discount,discountMinor:-1}])expect(validCheckoutDiscountDisplay(bad,26998)).toBe(false);
    expect(validCheckoutDiscountDisplay(discount,29997)).toBe(false);
  });
});
