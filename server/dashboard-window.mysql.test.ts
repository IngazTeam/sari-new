import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { getPool, closeDb } from './db/connection';
import { getDashboardSummary, getDashboardStats } from './dashboard-analytics';
describe.skipIf(!process.env.DATABASE_URL)('dashboard time and tenant boundaries (MySQL)',()=>{
  const users:number[]=[];let merchantId:number;
  const now=new Date('2026-10-01T12:00:00.987Z');
  const query=async(sql:string,args:unknown[]=[])=> (await (await getPool())!.execute(sql,args))[0] as any;
  const account=async()=>{const a=await createDisposableMerchant('dashboard-time');users.push(a.userId);return a.merchantId;};
  beforeEach(async()=>{merchantId=await account();});
  afterEach(async()=>{await cleanupDisposableMerchants(users);users.length=0;});afterAll(closeDb);
  const order=async(merchant:number,date:string,amount:number,currency='SAR',status='delivered')=>query(
    "INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,currency,status,createdAt) VALUES (?,'local-fixture','Fixture',?, ?,?,?,?)",
    [merchant,JSON.stringify([{name:'Fixture coffee',quantity:1,price:amount}]),amount,currency,status,date]);
  it('returns genuine empty data with explicit scope and a bounded clock',async()=>{
    const result=await getDashboardSummary(merchantId,7,5,'SAR',now);
    expect(result).toMatchObject({merchantId,days:7,currency:'SAR',timeZone:'UTC',from:'2026-09-24T12:00:00.000Z',through:'2026-10-01T12:00:00.000Z'});
    expect(result.stats.totalOrders).toBe(0);expect(result.ordersTrend).toEqual([]);expect(result.topProducts).toEqual([]);
  });
  it('excludes the end boundary, future timestamps, foreign tenants and foreign currency from every summary section',async()=>{
    const other=await account();
    await order(merchantId,'2026-09-24 12:00:00',1000);
    await order(merchantId,'2026-09-30 12:00:00',2000,'SAR','pending');
    await order(merchantId,'2026-10-01 12:00:00',3000);
    await order(merchantId,'2026-10-02 00:00:00',4000);
    await order(merchantId,'2026-09-30 12:00:00',5000,'USD');
    await order(other,'2026-09-30 12:00:00',6000);
    const result=await getDashboardSummary(merchantId,7,5,'SAR',now);
    expect(result.stats).toMatchObject({totalOrders:2,totalRevenue:3000,pendingOrders:1,completedOrders:1,averageOrderValue:1500});
    expect(result.comparison.current.totalRevenue).toBe(3000);
    expect(result.ordersTrend.reduce((n,row)=>n+Number(row.count),0)).toBe(2);
    expect(result.revenueTrend.reduce((n,row)=>n+Number(row.revenue),0)).toBe(1000);
    expect(result.topProducts).toEqual([{productName:'Fixture coffee',totalSales:1,totalRevenue:1000,averagePrice:1000}]);
    expect((await getDashboardStats(merchantId,7,'USD',now)).totalRevenue).toBe(5000);
  });
  it('counts a boundary order in exactly one comparison period',async()=>{
    await order(merchantId,'2026-09-17 12:00:00',100);
    await order(merchantId,'2026-09-24 11:59:59',200);
    await order(merchantId,'2026-09-24 12:00:00',300);
    await order(merchantId,'2026-09-17 11:59:59',400);
    const {comparison}=await getDashboardSummary(merchantId,7,5,'SAR',now);
    expect(comparison.previous).toMatchObject({totalOrders:2,totalRevenue:300});
    expect(comparison.current).toMatchObject({totalOrders:1,totalRevenue:300});
  });
});
