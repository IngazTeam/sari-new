import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MySqlDialect } from 'drizzle-orm/mysql-core';
const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  snapshot: vi.fn(),
  execute: vi.fn(),
}));
vi.mock('../db/connection', () => ({ getDb: mocks.db }));
vi.mock('../dashboard-workspace', () => ({
  readDashboardWorkspace: mocks.snapshot,
}));
import { readInsightSignals } from './insight-signals';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.mockResolvedValue({ execute: mocks.execute });
  mocks.execute.mockResolvedValue([
    [
      {
        id: 20,
        currency: 'USD',
        conversations: 3,
        campaigns: '2',
        activeProducts: 5,
      },
    ],
    [],
  ]);
  mocks.snapshot.mockResolvedValue({
    currency: 'USD',
    from: '2026-09-24T00:00:00Z',
    through: '2026-10-01T00:00:00Z',
    timeZone: 'UTC',
    days: 7,
    growth: { orders: null, value: null },
    current: {
      totalOrders: 4,
      totalValueMinor: 250,
      excludedValueOrders: 1,
      averageValueMinor: 83,
      deliveredOrders: 2,
    },
    products: [{ name: 'Sample' }],
    productSample: {
      inspectedOrders: 2,
      omittedOrders: 0,
      excludedOrders: 0,
      excludedItems: 0,
    },
  });
});
describe('suggestion signals', () => {
  it('uses one canonical seven-day snapshot and scoped scalar counts without loading records', async () => {
    const now = new Date('2026-10-01T00:00:00Z'),
      v = await readInsightSignals(20, now);
    expect(mocks.snapshot).toHaveBeenCalledWith(20, { days: 7 }, now);
    expect(v).toMatchObject({
      currency: 'USD',
      ordersPeriod: { days: 7 },
      knownOrderValueMinor: 250,
      excludedOrderValues: 1,
      orderValueGrowthPercent: null,
      storeLifetimeCounts: {
        conversations: 3,
        campaigns: 2,
        activeProducts: 5,
      },
    });
    const q = new MySqlDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(q.params).toEqual([20]);
    expect(q.sql.match(/merchantId=m.id/g)).toHaveLength(3);
    expect(q.sql).toContain('p.isActive=1');
    expect(JSON.stringify(v)).not.toContain('customerPhone');
  });
  it.each([
    undefined,
    { id: 21, currency: 'USD' },
    { id: 20, currency: 'SAR' },
    { id: 20, currency: 'USD', conversations: -1 },
    {
      id: 20,
      currency: 'USD',
      conversations: 1,
      campaigns: 2,
      activeProducts: 'bad',
    },
  ])('rejects missing, foreign or malformed aggregates', async row => {
    mocks.execute.mockResolvedValue([row ? [row] : [], []]);
    await expect(readInsightSignals(20)).rejects.toThrow();
  });
  it('does not invent zero counts when storage fails', async () => {
    mocks.db.mockResolvedValue(null);
    await expect(readInsightSignals(20)).rejects.toThrow('unavailable');
  });
});
