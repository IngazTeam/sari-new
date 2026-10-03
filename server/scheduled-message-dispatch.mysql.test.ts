import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn(), quiet: vi.fn() }));
vi.mock('./channels/whatsapp/providers', () => ({ getWhatsAppProvider: () => ({ send: mocks.send }) }));
vi.mock('./automation/campaign-guard', async original => ({ ...await original<typeof import('./automation/campaign-guard')>(), isQuietHours: mocks.quiet }));
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, createDisposableTrialSubscription, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { buildScheduledAuthorization, writeScheduledAuthorization } from './scheduled-message-authorization';
import { prepareScheduledMessage, validateScheduledCampaignAdmission, ScheduledPreparationUnknown } from './scheduled-message-preparation';
import { campaignDefinitionKey } from './campaign-definition';
import { enqueueCampaignDeliveries, completeCampaignWithoutRecipients, CampaignDispatchConflictError, runCampaignDeliveryBatch } from './automation/campaign-delivery-outbox';
import { reserveCampaignQuota } from './campaign-quota';
import { withCampaignOptOutNotice } from './automation/campaign-guard';
import { sendMerchantWhatsApp } from './channels/whatsapp/service';

describe.skipIf(!process.env.DATABASE_URL)('weekly schedule preparation, admission and transport with a stub provider', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, id: number, campaignId: number, instanceId: number, at: Date, due: Date;
  const token = 'a'.repeat(64), q = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
  const campaign = async () => (await q('SELECT * FROM campaigns WHERE id=?', [campaignId]))[0];
  const occurrences = () => q('SELECT * FROM scheduled_message_occurrences WHERE scheduled_message_id=?', [id]);
  const queued = () => q('SELECT * FROM campaign_delivery_outbox WHERE campaign_id=?', [campaignId]);
  const grant = async () => {
    const contract = buildScheduledAuthorization({ actorId: owner.userId, merchantId: owner.merchantId, scheduledMessageId: id, instanceId, reviewRevision: 'a'.repeat(64),
      definition: { title: 'Weekly fixture', message: 'Fixture', dayOfWeek: due.getUTCDay(), time: due.toISOString().slice(11, 16), timezone: 'UTC' } }, new Date(due.getTime() - 86400000));
    const tx = await (await getPool())!.getConnection(); try { await tx.beginTransaction(); await tx.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE', [owner.merchantId]); await writeScheduledAuthorization(tx, contract); await tx.commit(); } finally { tx.release(); }
  };
  const prepare = () => prepareScheduledMessage(owner.merchantId, id);
  const prepared = async () => { expect(await prepare()).toBe('prepared'); campaignId = (await occurrences())[0].campaign_id; };
  const enqueue = async () => enqueueCampaignDeliveries({ campaignId, merchantId: owner.merchantId, expectedDefinition: campaignDefinitionKey(await campaign()), recipients: [{ phone: '966500000001' }] });
  const claim = async () => {
    await prepared(); await enqueue(); const row = (await queued())[0];
    await q("UPDATE campaign_delivery_outbox SET status='processing',processing_token=?,claimed_at=UTC_TIMESTAMP(3) WHERE id=?", [token, row.id]);
    expect(await reserveCampaignQuota({ id: row.id, campaign_id: campaignId, merchant_id: owner.merchantId, processing_token: token })).toEqual({ accepted: true });
  };
  const input = async () => {
    const row = (await queued())[0], definition = await campaign();
    return { merchantId: owner.merchantId, instanceRecordId: instanceId, to: row.customer_phone, kind: 'text' as const, text: withCampaignOptOutNotice(definition.message), idempotencyKey: `campaign:${campaignId}:${row.id}`, retryFailed: true, campaignGuard: { campaignId, deliveryId: row.id, token } };
  };
  const mutate = async (mode: string) => {
    if (mode === 'revoked') await q('UPDATE scheduled_message_authorizations SET active=NULL,revoked_at=UTC_TIMESTAMP(3) WHERE scheduled_message_id=?', [id]);
    if (mode === 'missing') await q('DELETE FROM scheduled_message_authorizations WHERE scheduled_message_id=?', [id]);
    if (mode === 'actor-inactive') await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [owner.userId]);
    if (mode === 'role-revoked') await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)", [owner.merchantId, owner.userId]);
    if (mode === 'paused') await q('UPDATE scheduled_messages SET is_active=0 WHERE id=?', [id]);
    if (mode === 'deleted') await q('DELETE FROM scheduled_messages WHERE id=?', [id]);
    if (mode === 'definition') await q("UPDATE scheduled_messages SET message='Changed' WHERE id=?", [id]);
    if (mode === 'timezone') await q("UPDATE merchants SET timezone='Asia/Riyadh' WHERE id=?", [owner.merchantId]);
    if (mode === 'channel') await q('UPDATE whatsapp_instances SET is_primary=0 WHERE id=?', [instanceId]);
    if (mode === 'channel-inactive') await q("UPDATE whatsapp_instances SET status='inactive',is_primary=0 WHERE id=?", [instanceId]);
    if (mode === 'renewed') await grant();
    if (mode === 'message') await q("UPDATE campaigns SET message='Changed' WHERE id=?", [campaignId]);
    if (mode === 'marker') await q('UPDATE campaigns SET scheduled_message_occurrence_id=NULL WHERE id=?', [campaignId]);
    if (mode === 'occurrence') await q('DELETE FROM scheduled_message_occurrences WHERE scheduled_message_id=?', [id]);
    if (mode === 'foreign-occurrence') await q('UPDATE scheduled_message_occurrences SET merchant_id=? WHERE scheduled_message_id=?', [other.merchantId, id]);
    if (mode === 'expired') vi.setSystemTime(new Date(due.getTime() + 86400000));
  };
  beforeEach(async () => {
    due = new Date(); due.setUTCSeconds(0, 0); at = new Date(due.getTime() + 60000);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(at); vi.clearAllMocks(); mocks.quiet.mockReturnValue(false);
    mocks.send.mockResolvedValue({ accepted: true, status: 'sent', outcome: 'accepted', providerMessageId: 'local-weekly-receipt' });
    owner = await createDisposableMerchant('weekly-dispatch'); other = await createDisposableMerchant('weekly-foreign'); await createDisposableTrialSubscription(owner.merchantId);
    await q("UPDATE merchants SET timezone='UTC' WHERE id=?", [owner.merchantId]);
    instanceId = Number((await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,is_primary) VALUES (?,?,'test-token','mock','active',1)", [owner.merchantId, `fixture-${randomUUID()}`])).insertId);
    await q("INSERT INTO campaign_consent_state (merchant_id,customer_phone,status,consent_version,source,evidence_digest,last_decided_at) VALUES (?,'966500000001','granted','fixture','whatsapp_text',REPEAT('a',64),UTC_TIMESTAMP(3))", [owner.merchantId]);
    id = Number((await q("INSERT INTO scheduled_messages (merchant_id,title,message,day_of_week,time,is_active) VALUES (?,'Weekly fixture','Fixture',?,?,1)", [owner.merchantId, due.getUTCDay(), due.toISOString().slice(11, 16)])).insertId);
    await grant();
  });
  afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await cleanupDisposableMerchants([owner.userId, other.userId]); }); afterAll(closeDb);
  it('prepares once across concurrent replicas, never claims sending through the legacy timestamp', async () => {
    const outcomes = await Promise.all([prepare(), prepare(), prepare()]); expect(outcomes.filter(v => v === 'prepared')).toHaveLength(1); expect(await occurrences()).toHaveLength(1);
    expect((await q('SELECT last_sent_at FROM scheduled_messages WHERE id=?', [id]))[0].last_sent_at).toBeNull(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('keeps the weekly identity after renewing its grant', async () => { await prepared(); await grant(); expect(await prepare()).toBe('skipped'); expect(await occurrences()).toHaveLength(1); });
  it.each(['missing', 'revoked', 'actor-inactive', 'role-revoked', 'paused', 'deleted', 'definition', 'timezone', 'channel', 'channel-inactive'])('refuses preparation after %s', async mode => {
    await mutate(mode); expect(await prepare()).toBe('skipped'); expect(await occurrences()).toEqual([]); expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([-1, 15, 60, 1440])('does not prepare outside the fifteen-minute occurrence window (%s)', async minutes => {
    vi.setSystemTime(new Date(due.getTime() + minutes * 60000)); expect(await prepare()).toBe('skipped'); expect(await occurrences()).toEqual([]);
  });
  it('does not backfill an occurrence before the reviewed first occurrence', async () => {
    vi.setSystemTime(new Date(due.getTime() - 7 * 86400000 + 60000)); expect(await prepare()).toBe('skipped'); expect(await occurrences()).toEqual([]);
  });
  it('cannot prepare a definition through another tenant', async () => {
    expect(await prepareScheduledMessage(other.merchantId, id)).toBe('skipped'); expect(await occurrences()).toEqual([]);
  });
  it('checks a delegated author and the owner independently', async () => {
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)", [owner.merchantId, other.userId]);
    const [row] = await q('SELECT * FROM scheduled_message_authorizations WHERE scheduled_message_id=? AND active=1', [id]);
    const existing = typeof row.reviewed_contract === 'string' ? JSON.parse(row.reviewed_contract) : row.reviewed_contract;
    const tx = await (await getPool())!.getConnection(); try { await tx.beginTransaction(); await tx.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE', [owner.merchantId]); await writeScheduledAuthorization(tx, { ...existing, actorId: other.userId }); await tx.commit(); } finally { tx.release(); }
    await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [owner.userId]); expect(await prepare()).toBe('skipped');
    await q("UPDATE users SET account_status='active' WHERE id=?", [owner.userId]); expect(await prepare()).toBe('prepared');
  });
  it('rolls preparation back when its window expires during persistence', async () => {
    const pool = (await getPool())!, tx = await pool.getConnection(), native = tx.execute.bind(tx); vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(tx);
    vi.spyOn(tx, 'execute').mockImplementation((async (sql: any, args: any) => { const result = await native(sql, args); if (String(sql).startsWith('INSERT INTO campaigns')) vi.setSystemTime(new Date(due.getTime() + 15 * 60000)); return result; }) as any);
    expect(await prepare()).toBe('skipped'); vi.restoreAllMocks(); expect(await occurrences()).toEqual([]);
    expect(await q('SELECT id FROM campaigns WHERE merchantId=?', [owner.merchantId])).toEqual([]);
  });
  it('rolls back a failed campaign insert and safely retries preparation', async () => {
    const pool = (await getPool())!, tx = await pool.getConnection(), native = tx.execute.bind(tx); vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(tx);
    vi.spyOn(tx, 'execute').mockImplementation((async (sql: any, args: any) => { if (String(sql).startsWith('INSERT INTO campaigns')) throw Error('Injected write failure'); return native(sql, args); }) as any);
    await expect(prepare()).rejects.toThrow('Injected'); vi.restoreAllMocks(); expect(await occurrences()).toEqual([]); expect(await prepare()).toBe('prepared');
  });
  it('retains an acknowledged-lost preparation and refuses to create it twice', async () => {
    const pool = (await getPool())!, tx = await pool.getConnection(), commit = tx.commit.bind(tx); vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(tx);
    vi.spyOn(tx, 'commit').mockImplementation(async () => { await commit(); throw Error('Lost acknowledgement'); });
    await expect(prepare()).rejects.toBeInstanceOf(ScheduledPreparationUnknown); vi.restoreAllMocks(); expect(await occurrences()).toHaveLength(1); expect(await prepare()).toBe('skipped');
  });
  it('admits and accepts once through the guarded tenant provider and durable receipt', async () => {
    await claim(); const value = await input(); expect(await sendMerchantWhatsApp(value)).toMatchObject({ accepted: true, duplicate: false });
    expect(await sendMerchantWhatsApp(value)).toMatchObject({ accepted: true, duplicate: true }); expect(mocks.send).toHaveBeenCalledOnce();
  });
  for (const mode of ['missing', 'revoked', 'actor-inactive', 'role-revoked', 'paused', 'deleted', 'definition', 'timezone', 'channel', 'channel-inactive', 'renewed', 'message', 'marker', 'occurrence', 'foreign-occurrence', 'expired']) {
    it(`rejects ${mode} at admission including the empty audience path`, async () => {
      await prepared(); await mutate(mode); await expect(enqueue()).rejects.toBeInstanceOf(CampaignDispatchConflictError);
      expect(await completeCampaignWithoutRecipients(campaignId, owner.merchantId, campaignDefinitionKey(await campaign()))).toBe(false); expect(await queued()).toEqual([]);
    });
    it(`rejects ${mode} after admission before provider I/O`, async () => {
      await claim(); await mutate(mode); expect(await sendMerchantWhatsApp(await input())).toMatchObject({ accepted: false }); expect(mocks.send).not.toHaveBeenCalled();
    });
  }
  it('retires expired generated campaigns so they cannot permanently occupy the scheduled batch', async () => {
    await prepared(); await mutate('expired'); expect(await validateScheduledCampaignAdmission(owner.merchantId, campaignId)).toBe(false); expect((await campaign()).status).toBe('failed');
  });
  it('allows an ordinary scheduled campaign without a weekly grant', async () => {
    campaignId = Number((await q("INSERT INTO campaigns (merchantId,name,message,status,scheduledAt) VALUES (?,'Ordinary','Fixture','scheduled',UTC_TIMESTAMP())", [owner.merchantId])).insertId);
    expect(await validateScheduledCampaignAdmission(owner.merchantId, campaignId)).toBe(true); expect(await enqueue()).toEqual({ queued: 1 });
  });
  it('does not resend an unknown provider outcome after revocation', async () => {
    await claim(); const value = await input(); mocks.send.mockRejectedValueOnce(Error('Lost provider response'));
    expect(await sendMerchantWhatsApp(value)).toMatchObject({ accepted: false, status: 'queued' }); await mutate('revoked');
    expect(await sendMerchantWhatsApp(value)).toMatchObject({ accepted: false, duplicate: true }); expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('holds the weekly grant until provider acceptance is persisted and retains that evidence after revocation', async () => {
    await claim(); const value = await input(); let finish!: () => void, started!: () => void;
    const gate = new Promise<void>(r => finish = r), entered = new Promise<void>(r => started = r);
    mocks.send.mockImplementation(async () => { started(); await gate; return { accepted: true, status: 'sent', outcome: 'accepted', providerMessageId: 'local-weekly-receipt' }; });
    const sending = sendMerchantWhatsApp(value); await entered; let revoked = false; const revoking = mutate('revoked').then(() => { revoked = true; });
    try { await new Promise(r => setTimeout(r, 60)); expect(revoked).toBe(false); } finally { finish(); await sending; await revoking; }
    await q("UPDATE campaign_delivery_outbox SET status='pending',processing_token=NULL,claimed_at=NULL,available_at=UTC_TIMESTAMP(3) WHERE campaign_id=?", [campaignId]);
    await runCampaignDeliveryBatch(1); expect((await queued())[0].status).toBe('sent'); expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('rechecks expiry after transport locks waited, immediately before the provider', async () => {
    await claim(); const value = await input(), pool = (await getPool())!, tx = await pool.getConnection(), native = tx.execute.bind(tx); vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(tx);
    vi.spyOn(tx, 'execute').mockImplementation((async (sql: any, args: any) => { const result = await native(sql, args); if (String(sql).includes('claimed_at BETWEEN')) vi.setSystemTime(new Date(due.getTime() + 86400000)); return result; }) as any);
    expect(await sendMerchantWhatsApp(value)).toMatchObject({ accepted: false }); expect(mocks.send).not.toHaveBeenCalled();
  });
});
