import { beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { readScheduledMessageWorkspace } from './scheduled-message-workspace';
import { scheduledMessageSelection } from '../shared/scheduled-message-workspace';
describe.skipIf(!process.env.DATABASE_URL)('scheduled definitions selected-tenant source', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  const q = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
  const read = (input: object = {}, actor = owner.userId, merchant = owner.merchantId) => readScheduledMessageWorkspace(actor, merchant, scheduledMessageSelection.parse(input));
  const create = async (title: string, merchant = owner.merchantId, active = 1, day = 4, time = '10:00') => Number((await q(
    'INSERT INTO scheduled_messages (merchant_id,title,message,day_of_week,time,is_active) VALUES (?,?,?,?,?,?)', [merchant, title, 'Synthetic message only', day, time, active])).insertId);
  beforeEach(async () => { owner = await createDisposableMerchant('scheduled-source'); other = await createDisposableMerchant('scheduled-other'); });
  afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId])); afterAll(closeDb);
  it('finds every one of 105 definitions and clamps pages without foreign rows', async () => {
    const first = await create('oldest_%_target'); for (let i = 0; i < 104; i++) await create('Later ' + i);
    await create('FOREIGN-PRIVATE', other.merchantId); const pages = await Promise.all([1, 2, 3, 4, 5].map(page => read({ page })));
    expect(pages[0]).toMatchObject({ total: 105, matched: 105, pages: 5, counts: { enabled: 105, disabled: 0, unknown: 0 } });
    expect(new Set(pages.flatMap(p => p.rows.map(r => r.id))).size).toBe(105); expect(pages[4].rows).toHaveLength(5); expect(pages[4].rows[4].id).toBe(first);
    expect((await read({ query: '%' })).rows.map(r => r.id)).toEqual([first]); expect(await read({ page: 900 })).toMatchObject({ currentPage: 5 }); expect(JSON.stringify(pages)).not.toContain('FOREIGN-PRIVATE');
  });
  it('composes day, stored state, message search and stable schedule ordering', async () => {
    const a = await create('A', owner.merchantId, 0, 0, '23:59'), b = await create('B', owner.merchantId, 1, 0, '00:00');
    await q("UPDATE scheduled_messages SET message='Needle text' WHERE id=?", [a]);
    expect((await read({ query: 'Needle', day: 0, state: 'disabled' })).rows.map(r => r.id)).toEqual([a]);
    expect((await read({ sort: 'schedule' })).rows.map(r => r.id)).toEqual([b, a]); expect((await read({ query: String(b) })).rows.map(r => r.id)).toEqual([b]);
  });
  it('keeps malformed schedules visible and refuses to turn a timestamp into a sent count', async () => {
    const id = await create('Malformed', owner.merchantId, 2, 9, '99:99'); await q('UPDATE scheduled_messages SET last_sent_at=UTC_TIMESTAMP() WHERE id=?', [id]);
    const data = await read({ state: 'unknown' }); expect(data).toMatchObject({ matched: 1, definitionsWithRecordedTimestamp: 1, timeBasis: 'legacy_server_local', timezone: null, deliveryEvidence: 'legacy_timestamp_only', salesAttribution: 'not_verified' });
    expect(data.rows[0]).toMatchObject({ state: 'unknown', enabled: null, time: null, dayOfWeek: null }); expect(data.rows[0].issues).toEqual(['day', 'time', 'active']);
  });
  it('uses selected membership and separates viewing from campaign management', async () => {
    await create('Selected', other.merchantId); await expect(read({}, owner.userId, other.merchantId)).rejects.toMatchObject({ reason: 'forbidden' });
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)", [other.merchantId, owner.userId]);
    expect(await read({}, owner.userId, other.merchantId)).toMatchObject({ total: 1, canManage: false });
    await q("UPDATE merchant_members SET role='sales_supervisor' WHERE merchant_id=? AND user_id=?", [other.merchantId, owner.userId]); expect((await read({}, owner.userId, other.merchantId)).canManage).toBe(false);
    await q("UPDATE merchant_members SET role='manager' WHERE merchant_id=? AND user_id=?", [other.merchantId, owner.userId]); expect((await read({}, owner.userId, other.merchantId)).canManage).toBe(true);
    await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [other.merchantId, owner.userId]); await expect(read({}, owner.userId, other.merchantId)).rejects.toMatchObject({ reason: 'forbidden' });
  });
  it('honors revoked owners, deleted accounts and suspended tenants', async () => {
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)", [owner.merchantId, owner.userId]); await expect(read()).rejects.toMatchObject({ reason: 'forbidden' });
    await q('DELETE FROM merchant_members WHERE merchant_id=? AND user_id=?', [owner.merchantId, owner.userId]);
    await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [owner.userId]); await expect(read()).rejects.toMatchObject({ reason: 'forbidden' });
    await q("UPDATE users SET account_status='active' WHERE id=?", [owner.userId]); await q("UPDATE merchants SET status='suspended' WHERE id=?", [owner.merchantId]); await expect(read()).rejects.toMatchObject({ reason: 'forbidden' });
  });
});
