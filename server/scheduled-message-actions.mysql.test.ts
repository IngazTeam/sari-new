import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { reviewScheduledAction, applyScheduledAction, readScheduledActionReceipt, resolveScheduledActionReceipt } from './scheduled-message-actions';
import { parseScheduledAuthorization } from './scheduled-message-authorization';
import type { ScheduledActionReview, ScheduledActionTarget } from '../shared/scheduled-message-actions';
describe.skipIf(!process.env.DATABASE_URL)('weekly actions and atomic receipts on disposable tenants', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, instanceId: number;
  const q = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
  const data = { title: 'Weekly fixture', message: 'Fixture', dayOfWeek: 3, time: '12:00', timezone: 'UTC' };
  const createTarget = (): ScheduledActionTarget => ({ action: 'create', data });
  const review = (target: ScheduledActionTarget = createTarget()) => reviewScheduledAction(owner.userId, owner.merchantId, target);
  const input = (r: ScheduledActionReview, requestKey = randomUUID()) => ({ target: r.target, reviewRevision: r.reviewRevision, checkedAt: r.checkedAt, requestKey });
  const save = (value: unknown) => applyScheduledAction(owner.userId, owner.merchantId, value);
  const create = async () => save(input(await review()));
  const definitions = () => q('SELECT * FROM scheduled_messages WHERE merchant_id=?', [owner.merchantId]);
  const grants = () => q('SELECT * FROM scheduled_message_authorizations WHERE merchant_id=? ORDER BY id', [owner.merchantId]);
  const receipts = () => q('SELECT * FROM scheduled_message_action_receipts WHERE merchant_id=?', [owner.merchantId]);
  beforeEach(async () => {
    owner = await createDisposableMerchant('weekly-actions'); other = await createDisposableMerchant('weekly-other');
    await q("UPDATE merchants SET timezone='UTC' WHERE id=?", [owner.merchantId]);
    instanceId = Number((await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,is_primary) VALUES (?,?,'test-token','mock','active',1)", [owner.merchantId, `fixture-${randomUUID()}`])).insertId);
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants([owner.userId, other.userId]); }); afterAll(closeDb);
  it('saves new definitions paused and creates no inferred weekly authority', async () => {
    const r = await review(); expect(r).toMatchObject({ effect: 'create_paused', instanceId: null, nextDueAt: null, sendsImmediately: false });
    const result = await save(input(r)); expect(result).toMatchObject({ enabled: false, authorizationId: null, nextDueAt: null });
    expect((await definitions())[0].is_active).toBe(0); expect(await grants()).toEqual([]); expect(await receipts()).toHaveLength(1);
  });
  it('binds activation to reviewed future time and the exact author, tenant and current channel', async () => {
    const row = await create(), r = await review({ action: 'toggle', id: row.id, enabled: true });
    expect(r).toMatchObject({ effect: 'enable', instanceId, proposed: data, repeat: 'weekly_until_paused', audienceLimit: 2000, admissionMinutes: 15, deliveryMinutes: 1440 });
    expect(Date.parse(r.nextDueAt!)).toBeGreaterThan(Date.now()); const saved = await save(input(r)), [grant] = await grants();
    expect(saved).toMatchObject({ enabled: true, authorizationId: grant.id, nextDueAt: r.nextDueAt });
    expect(parseScheduledAuthorization(grant, owner.merchantId, row.id)).toMatchObject({ actorId: owner.userId, instanceId, reviewRevision: r.reviewRevision, firstDueAt: r.nextDueAt, reviewedAt: r.checkedAt });
  });
  it('updates pause delivery and preserve old authorization history', async () => {
    const row = await create(); await save(input(await review({ action: 'toggle', id: row.id, enabled: true })));
    await save(input(await review({ action: 'update', id: row.id, data: { ...data, message: 'New message' } })));
    expect((await definitions())[0]).toMatchObject({ message: 'New message', is_active: 0 }); expect((await grants())[0]).toMatchObject({ active: null }); expect((await grants())[0].revoked_at).not.toBeNull();
  });
  it('pauses and deletes malformed old definitions without inventing a time or destroying grant history', async () => {
    const row = await create(); await save(input(await review({ action: 'toggle', id: row.id, enabled: true })));
    await q("UPDATE scheduled_messages SET time='99:99',day_of_week=8 WHERE id=?", [row.id]);
    await expect(review({ action: 'toggle', id: row.id, enabled: true })).rejects.toMatchObject({ reason: 'invalid' });
    const pause = await review({ action: 'toggle', id: row.id, enabled: false }); expect(pause.before?.issues).toEqual(expect.arrayContaining(['day', 'time'])); await save(input(pause));
    await save(input(await review({ action: 'delete', id: row.id }))); expect(await definitions()).toEqual([]); expect(await grants()).toHaveLength(1);
  });
  it('serializes duplicate creates and activations by request identity', async () => {
    const value = input(await review()), results = await Promise.all([save(value), save(value), save(value)]); expect(new Set(results.map(r => r.id)).size).toBe(1);
    const activation = input(await review({ action: 'toggle', id: results[0].id, enabled: true })); await Promise.all([save(activation), save(activation)]);
    expect(await definitions()).toHaveLength(1); expect(await grants()).toHaveLength(1); expect(await receipts()).toHaveLength(2);
  });
  it.each(['definition', 'channel', 'timezone', 'grant'])('invalidates an activation review after %s changes', async mode => {
    const row = await create(), r = input(await review({ action: 'toggle', id: row.id, enabled: true }));
    if (mode === 'definition') await q("UPDATE scheduled_messages SET message='Changed' WHERE id=?", [row.id]);
    if (mode === 'channel') await q('UPDATE whatsapp_instances SET is_primary=0 WHERE id=?', [instanceId]);
    if (mode === 'timezone') await q("UPDATE merchants SET timezone='Asia/Riyadh' WHERE id=?", [owner.merchantId]);
    if (mode === 'grant') await save(input(await review({ action: 'toggle', id: row.id, enabled: true })));
    await expect(save(r)).rejects.toMatchObject({ reason: mode === 'channel' ? 'channel' : 'stale' });
  });
  it('will not activate after the reviewed next occurrence has begun', async () => {
    const next = new Date(Date.now() + 120000); next.setUTCSeconds(0, 0);
    const row = await save(input(await review({ action: 'create', data: { ...data, dayOfWeek: next.getUTCDay(), time: next.toISOString().slice(11, 16) } })));
    const value = input(await review({ action: 'toggle', id: row.id, enabled: true })); vi.spyOn(Date, 'now').mockReturnValue(next.getTime());
    await expect(save(value)).rejects.toMatchObject({ reason: 'stale' }); expect(await grants()).toEqual([]);
  });
  it('rejects a store timezone mismatch on saving and allows activation only with a connected primary', async () => {
    await expect(review({ action: 'create', data: { ...data, timezone: 'Asia/Riyadh' } })).rejects.toMatchObject({ reason: 'timezone' });
    const row = await create(); await q('UPDATE whatsapp_instances SET is_primary=0 WHERE id=?', [instanceId]);
    await expect(review({ action: 'toggle', id: row.id, enabled: true })).rejects.toMatchObject({ reason: 'channel' });
    await expect(review({ action: 'toggle', id: row.id, enabled: false })).resolves.toMatchObject({ effect: 'disable' });
  });
  it('blocks cross-tenant IDs and overprivileged actions while allowing selected managers', async () => {
    const row = await create(); await expect(reviewScheduledAction(other.userId, other.merchantId, { action: 'delete', id: row.id })).rejects.toMatchObject({ reason: 'missing' });
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)", [owner.merchantId, other.userId]);
    await expect(reviewScheduledAction(other.userId, owner.merchantId, createTarget())).rejects.toMatchObject({ reason: 'forbidden' });
    await q("UPDATE merchant_members SET role='manager' WHERE merchant_id=? AND user_id=?", [owner.merchantId, other.userId]);
    const r = await reviewScheduledAction(other.userId, owner.merchantId, { action: 'toggle', id: row.id, enabled: true });
    await applyScheduledAction(other.userId, owner.merchantId, input(r)); expect((await grants())[0].actor_id).toBe(other.userId);
  });
  it('rechecks permissions for apply but allows an actor with remaining read access to recover or close their request', async () => {
    const value = input(await review()), saved = await save(value), pending = input(await review());
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)", [owner.merchantId, owner.userId]);
    await expect(save(pending)).rejects.toMatchObject({ reason: 'forbidden' });
    expect(await readScheduledActionReceipt(owner.userId, owner.merchantId, { requestKey: value.requestKey })).toMatchObject({ state: 'saved', result: saved });
    expect(await resolveScheduledActionReceipt(owner.userId, owner.merchantId, { requestKey: pending.requestKey })).toMatchObject({ state: 'cancelled' });
    await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [owner.merchantId, owner.userId]);
    await expect(readScheduledActionReceipt(owner.userId, owner.merchantId, { requestKey: value.requestKey })).rejects.toMatchObject({ reason: 'forbidden' });
  });
  it('does not reveal or reuse another actor receipt even to a manager', async () => {
    const value = input(await review()); await save(value); await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)", [owner.merchantId, other.userId]);
    await expect(readScheduledActionReceipt(other.userId, owner.merchantId, { requestKey: value.requestKey })).rejects.toMatchObject({ reason: 'reused' });
    await expect(resolveScheduledActionReceipt(other.userId, owner.merchantId, { requestKey: value.requestKey })).rejects.toMatchObject({ reason: 'reused' });
    await expect(applyScheduledAction(other.userId, owner.merchantId, value)).rejects.toMatchObject({ reason: 'reused' });
    expect(await readScheduledActionReceipt(other.userId, other.merchantId, { requestKey: value.requestKey })).toEqual({ state: 'missing', result: null });
  });
  it('rejects reused keys with different payloads and closes absent requests against delayed saves', async () => {
    const value = input(await review()); await save(value); await expect(save({ ...value, target: { action: 'create', data: { ...data, title: 'Changed' } } })).rejects.toMatchObject({ reason: 'reused' });
    const pending = input(await review()); expect(await readScheduledActionReceipt(owner.userId, owner.merchantId, { requestKey: pending.requestKey })).toEqual({ state: 'missing', result: null });
    const closed = await resolveScheduledActionReceipt(owner.userId, owner.merchantId, { requestKey: pending.requestKey }); expect(closed.state).toBe('cancelled');
    expect(await resolveScheduledActionReceipt(owner.userId, owner.merchantId, { requestKey: pending.requestKey })).toEqual(closed); await expect(save(pending)).rejects.toMatchObject({ reason: 'cancelled' }); expect(await definitions()).toHaveLength(1);
  });
  it('serializes resolving a request against an in-flight save', async () => {
    const value = input(await review()); const [saved, resolved] = await Promise.all([save(value).then(result => ({ result }), error => ({ error })), resolveScheduledActionReceipt(owner.userId, owner.merchantId, { requestKey: value.requestKey })]);
    if (resolved.state === 'saved') { expect(saved).toMatchObject({ result: resolved.result }); expect(await definitions()).toHaveLength(1); }
    else { expect(saved).toMatchObject({ error: expect.objectContaining({ reason: 'cancelled' }) }); expect(await definitions()).toHaveLength(0); }
    expect(await receipts()).toHaveLength(1);
  });
  it('rolls back the definition, grant and revocation when receipt persistence fails', async () => {
    const row = await create(); await save(input(await review({ action: 'toggle', id: row.id, enabled: true }))); const value = input(await review({ action: 'delete', id: row.id }));
    const pool = (await getPool())!, tx = await pool.getConnection(), execute = tx.execute.bind(tx); vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(tx);
    vi.spyOn(tx, 'execute').mockImplementation((async (sql: any, args: any) => { if (String(sql).startsWith('INSERT INTO scheduled_message_action_receipts')) throw Error('Disk failure'); return execute(sql, args); }) as any);
    await expect(save(value)).rejects.toMatchObject({ reason: 'unavailable' }); vi.restoreAllMocks(); expect(await definitions()).toHaveLength(1); expect((await grants())[0].active).toBe(1); expect(await receipts()).toHaveLength(2);
  });
  it('recovers a committed save after lost acknowledgement without duplicate definitions', async () => {
    const value = input(await review()), pool = (await getPool())!, tx = await pool.getConnection(), commit = tx.commit.bind(tx); vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(tx);
    vi.spyOn(tx, 'commit').mockImplementation(async () => { await commit(); throw Error('Lost response'); });
    await expect(save(value)).rejects.toMatchObject({ reason: 'unknown' }); vi.restoreAllMocks(); const receipt = await readScheduledActionReceipt(owner.userId, owner.merchantId, { requestKey: value.requestKey });
    expect(receipt.state).toBe('saved'); expect(await save(value)).toEqual(receipt.result); expect(await resolveScheduledActionReceipt(owner.userId, owner.merchantId, { requestKey: value.requestKey })).toEqual(receipt); expect(await definitions()).toHaveLength(1);
  });
  it('expires reviews while retaining authorized receipt recovery', async () => {
    const value = input(await review()), saved = await save(value), pending = input(await review()); vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001);
    await expect(save(pending)).rejects.toMatchObject({ reason: 'stale' }); expect(await save(value)).toEqual(saved);
  });
  it('rolls back a review that expires during receipt persistence', async () => {
    const value = input(await review()), pool = (await getPool())!, tx = await pool.getConnection(), execute = tx.execute.bind(tx), now = Date.now(); vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(tx);
    vi.spyOn(tx, 'execute').mockImplementation((async (sql: any, args: any) => { const result = await execute(sql, args); if (String(sql).startsWith('INSERT INTO scheduled_message_action_receipts')) vi.spyOn(Date, 'now').mockReturnValue(now + 300001); return result; }) as any);
    await expect(save(value)).rejects.toMatchObject({ reason: 'stale' }); vi.restoreAllMocks(); expect(await definitions()).toEqual([]); expect(await receipts()).toEqual([]);
  });
});
