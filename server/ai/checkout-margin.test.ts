import { describe, expect, it } from 'vitest';
import { calculateCheckoutMargin, invoiceCostsSchema, invoiceApprovalSchema, marginPolicySchema, reviewedCostFromText } from '../../shared/checkout-margin';
const zero={taxMinor:0,shippingCostMinor:0,otherCostMinor:0};
describe('exact reviewed order margin',()=>{
  it.each([['12.34',1234],['١٢٫٣٤',1234],['۱۲٫۳۴',1234],['٠',0],[' 0.50 ',50]])('parses reviewed input %s without losing cents', (text,minor)=>{
    expect(reviewedCostFromText(String(text))).toBe(minor);
  });
  it.each(['',' ','1,000','١٬٠٠٠','1e2','0.001','-1'])('rejects ambiguous or unreviewed amount %s',text=>{
    expect(()=>reviewedCostFromText(text)).toThrow();
  });
  it('subtracts included tax and actual order costs without changing the invoice',()=>{
    expect(calculateCheckoutMargin(10000,5000,{taxMinor:1500,shippingCostMinor:500,otherCostMinor:250},30))
      .toEqual({netRevenueMinor:8500,totalCostMinor:5750,profitMinor:2750,marginBps:3235,passes:true});
  });
  it('does not pass a ratio that rounds up to the floor on screen',()=>{
    expect(calculateCheckoutMargin(10001,7001,zero,30)).toMatchObject({profitMinor:3000,marginBps:2999,passes:false});
    expect(calculateCheckoutMargin(10000,7000,zero,30).passes).toBe(true);
  });
  it('treats verified zero cost as zero and rejects loss at a zero percent floor',()=>{
    expect(calculateCheckoutMargin(10000,0,zero,100).passes).toBe(true);
    expect(calculateCheckoutMargin(10000,10001,zero,0)).toMatchObject({profitMinor:-1,passes:false});
  });
  it.each([0,-1,NaN,Infinity,0.5,2147483648])('rejects unsupported invoice %s',total=>{
    expect(()=>calculateCheckoutMargin(total,0,zero,0)).toThrow();
  });
  it.each([-1,NaN,1.5,2147483648])('rejects unsupported product cost %s',cost=>{
    expect(()=>calculateCheckoutMargin(10000,cost,zero,0)).toThrow();
  });
  it.each([10000,10001])('rejects zero or negative net revenue at tax %s',taxMinor=>{
    expect(()=>calculateCheckoutMargin(10000,100,{...zero,taxMinor},0)).toThrow();
  });
  it('does not overflow aggregate costs even when each input fits',()=>{
    expect(()=>calculateCheckoutMargin(10000,2147483647,{...zero,otherCostMinor:1},0)).toThrow();
  });
  it.each([-1,101,30.5,'30',NaN])('rejects invalid floor %s',minPercent=>{
    expect(marginPolicySchema.safeParse({enabled:true,minPercent}).success).toBe(false);
  });
  it.each([{taxMinor:-1},{shippingCostMinor:0.5},{otherCostMinor:'0'},{productCostMinor:1}])('rejects invented or malformed cost fields %j',attack=>{
    expect(invoiceCostsSchema.safeParse({...zero,...attack}).success).toBe(false);
  });
  it.each([{reviewedCosts:false},{evidence:'fake'},{policy:{enabled:false}},{costs:{...zero,taxMinor:0.1}}])('rejects forged proof %j',attack=>{
    expect(invoiceApprovalSchema.safeParse({orderId:1,expectedAmountMinor:100,totalIsFinal:true,
      margin:{costs:zero,evidence:'a'.repeat(64),reviewedCosts:true,...attack}}).success).toBe(false);
  });
});
