import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ pool: vi.fn(), connection: vi.fn(), execute: vi.fn(), query: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), destroy: vi.fn() }));
vi.mock('./db/connection', () => ({ getPool: m.pool }));
import { createDashboardDiscount, getDashboardDiscount, listDashboardDiscounts, updateDashboardDiscount, deleteDashboardDiscount } from './discount-dashboard-store';
const input = { code: 'SAVE10', type: 'percentage' as const, value: 10 };
let role: any, active: number, status: string, account: string;
beforeEach(() => {
  vi.resetAllMocks(); role = 'manager'; active = 1; status = 'active'; account = 'active'; m.pool.mockResolvedValue({ getConnection: m.connection }); m.connection.mockResolvedValue(m);
  m.execute.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM users')) return [[{ account_status: account }]];
    if (sql.includes('FROM merchants')) return [[{ userId: 7, status }]];
    if (sql.includes('FROM merchant_members')) return [[{ role, is_active: active }]];
    if (sql.startsWith('INSERT')) return [{ affectedRows: 1, insertId: 4 }];
    if (sql.startsWith('UPDATE') || sql.startsWith('DELETE')) return [{ affectedRows: 1 }];
    return [[{ id: 4, merchantId: 20, ...input, isActive: 1, usedCount: 0, createdAt: new Date('2026-10-02Z'), updatedAt: new Date('2026-10-02Z') }]];
  });
});
it('does not manufacture success when the DB is absent', async () => { m.pool.mockResolvedValue(null); await expect(listDashboardDiscounts(7, 20)).rejects.toMatchObject({ reason: 'unavailable' }); });
it.each(['revoked', 'viewer', 'suspended', 'blocked', 'unknown'])('rechecks %s authority inside the write transaction', async state => {
  if (state === 'revoked') active = 0; if (state === 'viewer') role = 'viewer'; if (state === 'suspended') status = 'suspended'; if (state === 'blocked') account = 'blocked'; if (state === 'unknown') role = 'agent';
  await expect(createDashboardDiscount(7, 20, input)).rejects.toMatchObject({ reason: 'forbidden' }); expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false); expect(m.rollback).toHaveBeenCalledOnce();
});
it('retains authority locks until commit and restricts both target writes by tenant', async () => {
  const revision = (await getDashboardDiscount(7, 20, 4)).revision; await updateDashboardDiscount(7, 20, { id: 4, expectedRevision: revision, isActive: false }); await deleteDashboardDiscount(7, 20, 4, revision);
  const writes = m.execute.mock.calls.filter(([sql]) => /^(UPDATE|DELETE)/.test(sql)); expect(writes).toHaveLength(2);
  for (const [sql, args] of writes) { expect(sql).toContain('WHERE merchantId=? AND id=?'); expect(args.slice(-2)).toEqual([20, 4]); }
  expect(m.execute.mock.calls.some(([sql]) => sql.includes('FROM merchant_members') && sql.endsWith('FOR SHARE'))).toBe(true); expect(m.commit).toHaveBeenCalledTimes(3);
});
it('destroys a connection after unknown COMMIT without reporting success or retrying', async () => { m.commit.mockRejectedValue(Error('lost ack')); await expect(createDashboardDiscount(7, 20, input)).rejects.toMatchObject({ reason: 'unavailable' }); expect(m.destroy).toHaveBeenCalledOnce(); expect(m.release).not.toHaveBeenCalled(); expect(m.rollback).not.toHaveBeenCalled(); expect(m.execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT'))).toHaveLength(1); });
it('destroys a connection after rollback failure', async () => { m.execute.mockRejectedValue(Error('PRIVATE SQL')); m.rollback.mockRejectedValue(Error()); await expect(listDashboardDiscounts(7, 20)).rejects.toMatchObject({ reason: 'unavailable' }); expect(m.destroy).toHaveBeenCalledOnce(); });
it('translates a duplicate-key race without exposing SQL', async () => { m.execute.mockRejectedValueOnce(Object.assign(Error('PRIVATE SQL'), { code: 'ER_DUP_ENTRY' })); await expect(createDashboardDiscount(7, 20, input)).rejects.toMatchObject({ reason: 'duplicate' }); expect(m.rollback).toHaveBeenCalledOnce(); });
it('keeps zero minimum explicit and does not round entered values', async () => { await createDashboardDiscount(7, 20, { ...input, minOrderAmount: 0 }); expect(m.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT'))?.[1]).toEqual([20, 'SAVE10', 'percentage', 10, 0, null, null]); await expect(async () => createDashboardDiscount(7, 20, { ...input, value: 10.5 })).rejects.toThrow(); });
