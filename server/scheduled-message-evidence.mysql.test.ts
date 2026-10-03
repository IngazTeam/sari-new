import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, afterAll, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { readScheduledMessageWorkspace, readScheduledMessageHistory } from './scheduled-message-workspace';
import { scheduledMessageSelection } from '../shared/scheduled-message-workspace';
import { reviewScheduledAction, applyScheduledAction } from './scheduled-message-actions';
import { prepareScheduledMessage } from './scheduled-message-preparation';
describe.skipIf(!process.env.DATABASE_URL)('weekly authorization and occurrence evidence on local tenants', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, id: number, instanceId: number;
  const q = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
  const workspace = () => readScheduledMessageWorkspace(owner.userId, owner.merchantId, scheduledMessageSelection.parse({}));
  const history = (page = 1, actor = owner.userId, merchant = owner.merchantId) => readScheduledMessageHistory(actor, merchant, { id, page });
  const authorize = async () => {
    const target = { action: 'toggle' as const, id, enabled: true }, r = await reviewScheduledAction(owner.userId, owner.merchantId, target);
    return applyScheduledAction(owner.userId, owner.merchantId, { target, requestKey: randomUUID(), checkedAt: r.checkedAt, reviewRevision: r.reviewRevision });
  };
  const prepare = async () => {
    const saved = await authorize(); expect(await prepareScheduledMessage(owner.merchantId, id, () => new Date(Date.parse(saved.nextDueAt!) + 60000))).toBe('prepared');
    return (await q('SELECT * FROM scheduled_message_occurrences WHERE scheduled_message_id=?', [id]))[0];
  };
  beforeEach(async () => {
    owner = await createDisposableMerchant('weekly-evidence'); other = await createDisposableMerchant('weekly-foreign');
    await q("UPDATE merchants SET timezone='UTC' WHERE id=?", [owner.merchantId]);
    id = Number((await q("INSERT INTO scheduled_messages (merchant_id,title,message,day_of_week,time,is_active,last_sent_at) VALUES (?,'Weekly','Hello',4,'10:00',1,UTC_TIMESTAMP())", [owner.merchantId])).insertId);
    instanceId = Number((await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,is_primary) VALUES (?,?,'test-token','mock','active',1)", [owner.merchantId, `fixture-${randomUUID()}`])).insertId);
  });
  afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId])); afterAll(closeDb);
  it('keeps legacy time separate from proof and exposes an explicit current store zone', async () => {
    const data = await workspace(); expect(data.timezone).toBe('UTC'); expect(data.rows[0]).toMatchObject({ authorization: { state: 'missing' }, nextDueAt: null, occurrenceCount: 0, latestOccurrence: null });
    expect(data.rows[0].legacyLastSentAt).not.toBeNull(); expect(await history()).toMatchObject({ total: 0, rows: [] });
  });
  it('shows recorded approval, catches definition changes, revocation and forged contracts without leaking their content', async () => {
    await authorize(); expect((await workspace()).rows[0]).toMatchObject({ authorization: { state: 'recorded', actorId: owner.userId, timezone: 'UTC', instanceId }, nextDueAt: expect.any(String) });
    await q("UPDATE scheduled_messages SET message='New text' WHERE id=?", [id]); expect((await workspace()).rows[0]).toMatchObject({ authorization: { state: 'changed' }, nextDueAt: null });
    await q('UPDATE scheduled_message_authorizations SET active=NULL,revoked_at=UTC_TIMESTAMP(3) WHERE scheduled_message_id=?', [id]); expect((await workspace()).rows[0]).toMatchObject({ authorization: { state: 'revoked', actorId: null } });
    await authorize(); await q("UPDATE scheduled_message_authorizations SET contract_digest=REPEAT('b',64) WHERE scheduled_message_id=? AND active=1", [id]); expect((await workspace()).rows[0]).toMatchObject({ authorization: { state: 'invalid', actorId: null }, nextDueAt: null });
  });
  it('reads all 105 weekly occurrences across pages, including retained history after deletion', async () => {
    const start = Date.parse('2026-01-01T10:00:00Z');
    for (let i = 0; i < 105; i++) await q('INSERT INTO scheduled_message_occurrences (merchant_id,scheduled_message_id,authorization_id,due_at,expires_at) VALUES (?,?,1,?,?)', [owner.merchantId, id, new Date(start + i * 7 * 86400000), new Date(start + i * 7 * 86400000 + 86400000)]);
    const pages = await Promise.all([1, 2, 3, 4, 5].map(p => history(p))); expect(pages[0]).toMatchObject({ total: 105, pages: 5 }); expect(pages[4].rows).toHaveLength(5);
    expect(new Set(pages.flatMap(p => p.rows.map(r => r.id))).size).toBe(105); expect((await history(900)).currentPage).toBe(5);
    expect((await workspace()).rows[0]).toMatchObject({ occurrenceCount: 105, latestOccurrence: { id: pages[0].rows[0].id, linkState: 'missing', acceptedByProvider: null } });
    await q('DELETE FROM scheduled_messages WHERE id=?', [id]); expect((await history()).total).toBe(105);
  });
  it('uses provider receipt identity instead of inflated campaign or legacy success counters', async () => {
    const occurrence = await prepare(), statuses = ['sent', 'sent', 'manual_review', 'failed'];
    for (let i = 0; i < statuses.length; i++) {
      const delivery = Number((await q('INSERT INTO campaign_delivery_outbox (campaign_id,merchant_id,customer_phone,status) VALUES (?,?,?,?)', [occurrence.campaign_id, owner.merchantId, '96650000000' + i, statuses[i]])).insertId);
      const states = ['sent', 'sent', 'queued', 'failed'];
      await q("INSERT INTO whatsapp_message_deliveries (merchant_id,instance_id,provider,idempotency_key,direction,status,provider_message_id) VALUES (?,?,'mock',?,'outgoing',?,?)", [owner.merchantId, instanceId, `campaign:${occurrence.campaign_id}:${delivery}`, states[i], i === 0 || i === 3 ? 'fixture-receipt-' + i : null]);
    }
    await q('UPDATE campaigns SET sentCount=999,totalRecipients=999 WHERE id=?', [occurrence.campaign_id]);
    expect((await history()).rows[0]).toMatchObject({ linkState: 'verified', recipients: 4, acceptedByProvider: 2, unconfirmed: 2, needsReview: 1, salesVerified: false });
    expect((await workspace()).rows[0].latestOccurrence).toMatchObject({ acceptedByProvider: 2 });
  });
  it.each(['marker', 'digest', 'foreign'])('does not expose campaign facts when its %s link is invalid', async mode => {
    const occurrence = await prepare();
    if (mode === 'marker') await q('UPDATE campaigns SET scheduled_message_occurrence_id=NULL WHERE id=?', [occurrence.campaign_id]);
    if (mode === 'digest') await q("UPDATE campaigns SET message='Changed content' WHERE id=?", [occurrence.campaign_id]);
    if (mode === 'foreign') await q('UPDATE campaigns SET merchantId=? WHERE id=?', [other.merchantId, occurrence.campaign_id]);
    const row = (await history()).rows[0]; expect(row.linkState).not.toBe('verified'); expect(row).toMatchObject({ campaignId: null, campaignState: null, recipients: null, acceptedByProvider: null });
  });
  it('scopes histories to selected tenant membership, never an arbitrary definition ID', async () => {
    await prepare(); await expect(history(1, other.userId, other.merchantId)).rejects.toMatchObject({ reason: 'missing' });
    await expect(history(1, other.userId, owner.merchantId)).rejects.toMatchObject({ reason: 'forbidden' });
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)", [owner.merchantId, other.userId]); expect((await history(1, other.userId, owner.merchantId)).total).toBe(1);
    await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [owner.merchantId, other.userId]); await expect(history(1, other.userId, owner.merchantId)).rejects.toMatchObject({ reason: 'forbidden' });
  });
});
