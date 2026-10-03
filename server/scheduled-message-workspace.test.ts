import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ getPool: vi.fn() }));
vi.mock('./db/connection', () => db);
import { scheduledMessageSelection } from '../shared/scheduled-message-workspace';
import { projectScheduledMessage, readScheduledMessageWorkspace } from './scheduled-message-workspace';
const record = () => ({ id: 1, merchant_id: 2, title: 'عرض الأسبوع', message: 'Welcome', day_of_week: 0, time: '00:00', is_active: 1,
  last_sent_at: null, created_at: '2026-10-03 12:00:00', updated_at: '2026-10-03 12:00:00' });
describe('scheduled message source projection', () => {
  it('preserves stored text and a UTC timestamp without inventing sending evidence', () => {
    const row = projectScheduledMessage(record()); expect(row).toMatchObject({ title: 'عرض الأسبوع', message: 'Welcome', dayOfWeek: 0, time: '00:00', enabled: true, legacyLastSentAt: null, createdAt: '2026-10-03T12:00:00.000Z', issues: [] });
  });
  it('preserves literal markup and includes malformed original values in revision', () => {
    const value = { ...record(), message: '<img src=x onerror=alert(1)>', time: '99:99' };
    expect(projectScheduledMessage(value)).toMatchObject({ message: value.message, time: null, issues: ['time'] });
    expect(projectScheduledMessage(value).revision).not.toBe(projectScheduledMessage({ ...value, time: '88:88' }).revision);
  });
  it('distinguishes malformed old values from disabled and unsent states', () => {
    const row = projectScheduledMessage({ ...record(), title: ' ', message: '', day_of_week: 8, time: '10:99', is_active: 2, last_sent_at: 'bad', created_at: 'bad', updated_at: 'bad' });
    expect(row).toMatchObject({ title: null, message: null, dayOfWeek: null, time: null, enabled: null, state: 'unknown', legacyLastSentAt: null });
    expect(row.issues).toEqual(['title', 'message', 'day', 'time', 'active', 'last_sent_at', 'created_at', 'updated_at']);
  });
  it.each([{ page: 0 }, { page: 1.2 }, { page: 1000001 }, { day: 7 }, { day: .5 }, { query: 'x'.repeat(101) }, { merchantId: 3 }, { state: 'delivered' }, { sort: 'id;DELETE' }])('rejects invalid selection %j', input => {
    expect(scheduledMessageSelection.safeParse(input).success).toBe(false);
  });
});
describe('scheduled source authority failures', () => {
  let tx: any;
  beforeEach(() => {
    tx = { query: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), destroy: vi.fn(), execute: vi.fn(async (sql: string) => [
      sql.includes('FROM merchants') ? [{ userId: 1, status: 'active' }] : sql.includes('FROM users') ? [{ account_status: 'active' }]
        : sql.includes('AS enabled') ? [{ total: 0, enabled: 0, disabled: 0, unknown: 0, stamped: 0 }]
        : sql.includes('COUNT(*)') ? [{ total: 0 }] : []]) };
    db.getPool.mockResolvedValue({ getConnection: async () => tx });
  });
  const read = () => readScheduledMessageWorkspace(1, 2, scheduledMessageSelection.parse({}));
  it('reports database failure instead of an empty success', async () => { db.getPool.mockResolvedValue(null); await expect(read()).rejects.toMatchObject({ reason: 'unavailable' }); });
  it('does not release an uncertain snapshot as success', async () => { tx.commit.mockRejectedValue(Error()); await expect(read()).rejects.toMatchObject({ reason: 'unavailable' }); expect(tx.destroy).toHaveBeenCalledOnce(); expect(tx.release).not.toHaveBeenCalled(); });
  it('destroys a connection whose rollback failed', async () => { tx.execute.mockRejectedValue(Error()); tx.rollback.mockRejectedValue(Error()); await expect(read()).rejects.toMatchObject({ reason: 'unavailable' }); expect(tx.destroy).toHaveBeenCalledOnce(); });
});
