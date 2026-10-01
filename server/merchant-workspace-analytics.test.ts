import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MySqlDialect } from 'drizzle-orm/mysql-core';
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), select: vi.fn(), where: vi.fn(), execute: vi.fn() }));
vi.mock('./db', () => ({ getDb: mocks.getDb }));
import { getDashboardStats, getTopProducts, getOrdersTrend, getRevenueTrend, getDashboardSummary, getComparisonStats } from './dashboard-analytics';
import { dashboardWindow } from '../shared/dashboard-window';
const dialect = new MySqlDialect();
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));
  mocks.where.mockReturnValue(Object.assign(Promise.resolve([{ totalOrders: 2, totalRevenue: 300, completedOrders: 1 }]), { groupBy: () => Promise.resolve([]) }));
  mocks.select.mockReturnValue({ from: () => ({ where: mocks.where }) });
  mocks.execute.mockResolvedValue([[{ productName: 'قهوة', totalSales: '2', totalRevenue: '300', averagePrice: '150' }]]);
  mocks.getDb.mockResolvedValue({ select: mocks.select, execute: mocks.execute });
});
afterEach(() => vi.useRealTimers());
describe('merchant dashboard period and order status', () => {
  it('keeps every summary metric in the merchant currency and period', async () => {
    const summary = await getDashboardSummary(73, 7, 5, 'USD');
    expect(summary.currency).toBe('USD');
    for (const [where] of mocks.where.mock.calls) {
      const query = dialect.sqlToQuery(where);
      expect(query.params).toContain(73);
      expect(query.params).toContain('USD');
    }
    expect(dialect.sqlToQuery(mocks.execute.mock.calls[0][0]).params).toEqual([73, 'USD', '2026-09-17 12:00:00', '2026-09-24 12:00:00', 5]);
    expect(summary).toMatchObject({merchantId:73,days:7,from:'2026-09-17T12:00:00.000Z',through:'2026-09-24T12:00:00.000Z',timeZone:'UTC'});
  });
  it.each([7, 30, 90])('scopes headline metrics to merchant and selected %i days', async days => {
    const stats = await getDashboardStats(73, days);
    const query = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.params).toEqual([73, new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' '), '2026-09-24 12:00:00']);
    expect(dialect.sqlToQuery(mocks.select.mock.calls[0][0].completedOrders).sql).toContain("'delivered'");
    expect(stats.averageOrderValue).toBe(150);
  });
  it('uses the same period and delivered status for product ranking', async () => {
    const result = await getTopProducts(73, 5, 7);
    const query = dialect.sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(query.sql).toContain("'delivered'");
    expect(query.params).toEqual([73, '2026-09-17 12:00:00', '2026-09-24 12:00:00', 5]);
    expect(result[0]).toEqual({ productName: 'قهوة', totalSales: 2, totalRevenue: 300, averagePrice: 150 });
  });
  it('excludes undelivered orders from the delivered-value trend', async () => {
    await getRevenueTrend(73, 7);
    const query = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.sql).toContain("'delivered'");
    expect(query.params).toContain(73);
  });
  it('does not count the exact period boundary twice', async () => {
    await getComparisonStats(73, 7);
    const current = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
    const previous = dialect.sqlToQuery(mocks.where.mock.calls[1][0]);
    expect(current.sql).toContain('>=');
    expect(previous.sql).toContain(' < ');
    expect(previous.sql).not.toContain('<=');
    expect(previous.params.at(-1)).toBe(current.params.at(-2));
  });
  it('handles hostile product names in the fallback without mutating object prototypes', async () => {
    mocks.execute.mockRejectedValue(new Error('JSON_TABLE unavailable'));
    mocks.where.mockResolvedValue([{ items: JSON.stringify([
      { name: '__proto__', price: 100, quantity: 2 },
      { name: 'constructor', price: 300, quantity: 1 },
    ]) }]);
    const result = await getTopProducts(73, 5, 7);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ productName: '__proto__', totalSales: 2, totalRevenue: 200, averagePrice: 100 });
    expect(Object.prototype).not.toHaveProperty('totalSales');
    expect(Object).not.toHaveProperty('totalSales');
  });
  it.each([getDashboardStats,getComparisonStats,getOrdersTrend,getRevenueTrend,getDashboardSummary])('does not present unavailable storage as successful empty metrics (%#)',async reader=>{
    mocks.getDb.mockResolvedValue(null);await expect(reader(73,7)).rejects.toThrow('unavailable');
  });
  it('also fails closed for product ranking and unexpected query failure',async()=>{
    mocks.getDb.mockResolvedValueOnce(null);await expect(getTopProducts(73)).rejects.toThrow('unavailable');
    mocks.where.mockRejectedValue(new Error('database offline'));await expect(getDashboardStats(73)).rejects.toThrow('database offline');
  });
  it('scopes both native and fallback product queries to the same exclusive end',async()=>{
    mocks.execute.mockRejectedValueOnce(new Error('unsupported JSON_TABLE'));mocks.where.mockResolvedValueOnce([]);
    await getTopProducts(73,5,7,'USD');const native=dialect.sqlToQuery(mocks.execute.mock.calls[0][0]),fallback=dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(native.params.slice(0,4)).toEqual(fallback.params);expect(native.sql).toContain(' < ');expect(fallback.sql).toContain(' < ');
  });
  it('keeps one summary clock even if storage access moves across a second boundary',async()=>{
    mocks.getDb.mockImplementation(()=>{vi.advanceTimersByTime(1200);return {select:mocks.select,execute:mocks.execute};});
    const summary=await getDashboardSummary(73,7,5,'USD');
    expect(summary.through).toBe('2026-09-24T12:00:00.000Z');
    for(const [where] of mocks.where.mock.calls){const params=dialect.sqlToQuery(where).params;expect(params.some(v=>typeof v==='string'&&v.startsWith('2026-09-24')&&v!=='2026-09-24 12:00:00')).toBe(false);}
  });
  it.each([0,-1,1.2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])('rejects invalid merchant %s before storage',async merchant=>{
    await expect(getDashboardStats(merchant,7)).rejects.toThrow('merchant');expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it.each([0,-1,1.2,367,NaN,Infinity])('rejects invalid period %s before storage',async days=>{
    await expect(getOrdersTrend(73,days)).rejects.toThrow('period');expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it('uses adjacent UTC periods and refuses invalid clocks or currencies',async()=>{
    expect(dashboardWindow(73,7,new Date('2026-09-24T12:00:00.987Z'))).toMatchObject({sqlFrom:'2026-09-17 12:00:00',sqlThrough:'2026-09-24 12:00:00',sqlPreviousFrom:'2026-09-10 12:00:00'});
    expect(()=>dashboardWindow(73,7,new Date('bad'))).toThrow('clock');
    await expect(getDashboardStats(73,7,'EUR' as any)).rejects.toThrow('currency');
  });
});
