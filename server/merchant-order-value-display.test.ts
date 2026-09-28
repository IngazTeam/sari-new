import { describe, expect, it } from 'vitest';
import { orderValuesByCurrency } from '../shared/order-value-summary';
import { formatMinorMoney } from '../shared/product-money';

describe('order amounts remain in their recorded currency and minor units',()=>{
  it('formats 31500 minor units as 315, including product line totals',()=>{
    expect(formatMinorMoney(31500,'SAR','en-US')).toBe('315 SAR');
    expect(formatMinorMoney(4500*2,'USD','en-US')).toBe('$90');
  });
  it('separates currencies and excludes cancelled orders without removing pending ones from order value',()=>{
    expect(orderValuesByCurrency([{status:'paid',currency:'SAR',totalAmount:4500},{status:'pending',currency:'USD',totalAmount:8000},{status:'cancelled',currency:'SAR',totalAmount:1200}])).toEqual([{currency:'SAR',totalMinor:4500},{currency:'USD',totalMinor:8000}]);
  });
});
