import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, afterAll, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { buildScheduledAuthorization, writeScheduledAuthorization, revokeScheduledAuthorization, parseScheduledAuthorization, ensureScheduledAuthoritySchema } from './scheduled-message-authorization';
describe.skipIf(!process.env.DATABASE_URL)('scheduled weekly authority storage', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, id: number;
  const q = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
  const contract = () => buildScheduledAuthorization({ actorId: owner.userId, merchantId: owner.merchantId, scheduledMessageId: id, reviewRevision: 'a'.repeat(64), instanceId: 12,
    definition: { title: 'Weekly', message: 'Hello', dayOfWeek: 6, time: '12:00', timezone: 'Asia/Riyadh' } }, new Date('2026-10-03T08:00:00Z'));
  const history = () => q('SELECT * FROM scheduled_message_authorizations WHERE scheduled_message_id=? ORDER BY id', [id]);
  const grant = async () => { const tx = await (await getPool())!.getConnection(); try { await tx.beginTransaction(); await tx.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE', [owner.merchantId]); const result = await writeScheduledAuthorization(tx, contract()); await tx.commit(); return result; } catch (e) { await tx.rollback(); throw e; } finally { tx.release(); } };
  beforeEach(async () => {
    owner = await createDisposableMerchant('weekly-grant'); other = await createDisposableMerchant('weekly-other');
    id = Number((await q("INSERT INTO scheduled_messages (merchant_id,title,message,day_of_week,time,is_active) VALUES (?,'Weekly','Hello',6,'12:00',1)", [owner.merchantId])).insertId);
  });
  afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId])); afterAll(closeDb);
  it('requires every schema constraint without inventing approval for legacy enabled definitions', async () => {
    await ensureScheduledAuthoritySchema(); expect(await history()).toEqual([]);
    expect((await q('SELECT is_active FROM scheduled_messages WHERE id=?', [id]))[0].is_active).toBe(1);
  });
  it('persists the actor and canonical reviewed contract after MySQL JSON normalization', async () => {
    await grant(); const [row] = await history(); expect(parseScheduledAuthorization(row, owner.merchantId, id)).toEqual(contract());
    expect(parseScheduledAuthorization(row, other.merchantId, id)).toBeNull(); expect(parseScheduledAuthorization(row, owner.merchantId, id + 1)).toBeNull();
  });
  it('serializes concurrent renewals to one active grant and retains revoked history', async () => {
    await Promise.all([grant(), grant(), grant()]); const rows = await history(); expect(rows).toHaveLength(3); expect(rows.filter((r: any) => r.active === 1)).toHaveLength(1);
    expect(rows.slice(0, 2).every((r: any) => r.revoked_at !== null)).toBe(true); expect(new Set(rows.map((r: any) => r.grant_key)).size).toBe(3);
  });
  it('rolls back a revocation together with its failed replacement', async () => {
    await grant(); const tx = await (await getPool())!.getConnection(); try { await tx.beginTransaction(); await revokeScheduledAuthorization(tx, owner.merchantId, id); await tx.rollback(); } finally { tx.release(); }
    expect(parseScheduledAuthorization((await history())[0], owner.merchantId, id)).toEqual(contract());
  });
  it('rejects duplicate active grants and invalid revocation pairs', async () => {
    await grant(); const [row] = await history();
    for (const update of ['active=0', 'active=NULL', 'revoked_at=UTC_TIMESTAMP(3)']) await expect(q('UPDATE scheduled_message_authorizations SET ' + update + ' WHERE id=?', [row.id])).rejects.toThrow();
    await expect(q(`INSERT INTO scheduled_message_authorizations (grant_key,scheduled_message_id,merchant_id,actor_id,review_revision,contract_digest,reviewed_contract)
      SELECT UUID(),scheduled_message_id,merchant_id,actor_id,review_revision,contract_digest,reviewed_contract FROM scheduled_message_authorizations WHERE id=?`, [row.id])).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });
  it('prevents the same weekly occurrence from reappearing under a new authorization and preserves history on definition deletion', async () => {
    const first = await grant(), due = '2026-10-03 09:00:00', expires = '2026-10-04 09:00:00';
    const insert = (authorization: number, date = due, end = expires) => q('INSERT INTO scheduled_message_occurrences (merchant_id,scheduled_message_id,authorization_id,due_at,expires_at) VALUES (?,?,?,?,?)', [owner.merchantId, id, authorization, date, end]);
    await insert(first); const second = await grant(); await expect(insert(second)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    await expect(insert(second, '2026-10-10 09:00:00', '2026-10-10 09:00:00')).rejects.toThrow();
    await q('DELETE FROM scheduled_messages WHERE id=?', [id]); expect(await history()).toHaveLength(2); expect(await q('SELECT id FROM scheduled_message_occurrences WHERE scheduled_message_id=?', [id])).toHaveLength(1);
  });
  it('rejects partial campaign bindings and duplicate markers', async () => {
    const auth = await grant(), occurrence = Number((await q("INSERT INTO scheduled_message_occurrences (merchant_id,scheduled_message_id,authorization_id,due_at,expires_at) VALUES (?,?,?,'2026-10-03 09:00:00','2026-10-04 09:00:00')", [owner.merchantId, id, auth])).insertId);
    await expect(q('UPDATE scheduled_message_occurrences SET campaign_id=77 WHERE id=?', [occurrence])).rejects.toThrow();
    await q("INSERT INTO campaigns (merchantId,name,message,scheduled_message_occurrence_id) VALUES (?,'Weekly','Hello',?)", [owner.merchantId, occurrence]);
    await expect(q("INSERT INTO campaigns (merchantId,name,message,scheduled_message_occurrence_id) VALUES (?,'Weekly duplicate','Hello',?)", [owner.merchantId, occurrence])).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });
  it('scopes action identities by tenant, retains closure without a digest, and refuses digestless successful writes', async () => {
    const key = randomUUID(), insert = (merchant: number, state: string) => q('INSERT INTO scheduled_message_action_receipts (merchant_id,actor_id,request_key,state,result_json) VALUES (?,?,?,?,?)', [merchant, owner.userId, key, state, JSON.stringify({ state })]);
    await insert(owner.merchantId, 'cancelled'); await insert(other.merchantId, 'cancelled'); await expect(insert(owner.merchantId, 'cancelled')).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    await expect(q("UPDATE scheduled_message_action_receipts SET state='saved' WHERE merchant_id=? AND request_key=?", [owner.merchantId, key])).rejects.toThrow();
  });
});
