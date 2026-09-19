import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const provider = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../channels/whatsapp/providers', () => ({ getWhatsAppProvider: () => provider }));
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { enqueueInbound, claimInbound as claimForMerchant, executeInbound, recoverExpiredInbound, assertInboundOwned,
  heartbeatInbound, finishInbound, persistInboundReplyPlan } from './inbound-jobs';
import { currentInboundExecution } from './inbound-context';
import { buildReplyPlan, dispatchReplyPlan } from './reply-plan';
import { resolveInboundReview, inboundHealth } from './operations';
import { purgeCompletedInboundPayloads } from './retention';
import { recordInboundWhatsAppReceipt, updateWhatsAppDeliveryStatus } from '../channels/whatsapp/service';

describe.skipIf(!process.env.DATABASE_URL)('durable inbound queue with real MySQL', () => {
  let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>;
  let instanceId: number;
  let conversationId: number;
  let account: string;
  const claimInbound = () => claimForMerchant(fixture.merchantId);
  const phone = '966500000009';
  const payload = (id = randomUUID(), chat = `${phone}@c.us`) => ({ typeWebhook: 'incomingMessageReceived',
    instanceData: { idInstance: account }, idMessage: id, timestamp: Math.floor(Date.now() / 1000),
    senderData: { chatId: chat, sender: chat }, messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'fixture' } } });
  beforeEach(async () => {
    fixture = await createDisposableMerchant('inbound');
    account = randomUUID();
    const pool = (await getPool())!;
    const [instance] = await pool.execute<any>(
      "INSERT INTO whatsapp_instances (merchant_id, instance_id, token, provider, status, is_primary) VALUES (?, ?, 'fixture', 'green_api', 'active', 1)",
      [fixture.merchantId, account],
    );
    instanceId = instance.insertId;
    const [conversation] = await pool.execute<any>(
      "INSERT INTO conversations (merchantId, customerPhone, status) VALUES (?, ?, 'active')", [fixture.merchantId, phone],
    );
    conversationId = conversation.insertId;
    provider.send.mockReset().mockResolvedValue({ accepted: true, outcome: 'accepted', status: 'sent', providerMessageId: randomUUID() });
  });
  afterEach(async () => { await cleanupDisposableMerchants([fixture.userId]); });
  afterAll(closeDb);
  async function row(id: number) {
    const [rows] = await (await getPool())!.execute<any[]>('SELECT * FROM whatsapp_inbound_jobs WHERE id = ?', [id]); return rows[0];
  }
  async function expire(id: number) {
    await (await getPool())!.execute('UPDATE whatsapp_inbound_jobs SET lease_until = TIMESTAMPADD(SECOND, -1, UTC_TIMESTAMP(3)) WHERE id = ?', [id]);
  }
  it('deduplicates 16 concurrent webhook/polling receipts before acknowledgement', async () => {
    const event = payload();
    const result = await Promise.all(Array.from({ length: 16 }, (_, index) => enqueueInbound({ payload: event, source: index % 2 ? 'webhook' : 'polling', expectedMerchantId: fixture.merchantId })));
    expect(new Set(result.map(item => item.id)).size).toBe(1);
    expect(result.filter(item => !item.duplicate)).toHaveLength(1);
    expect((await row(result[0].id)).status).toBe('pending');
  });
  it('rejects mismatched tenant, missing event identity and oversized input', async () => {
    await expect(enqueueInbound({ payload: payload(), source: 'polling', expectedMerchantId: fixture.merchantId + 1 })).rejects.toThrow('unavailable');
    await expect(enqueueInbound({ payload: { ...payload(), idMessage: '' }, source: 'webhook' })).rejects.toThrow('identity');
    const event = payload(); event.messageData.textMessageData.textMessage = 'x'.repeat(270_000);
    await expect(enqueueInbound({ payload: event, source: 'webhook' })).rejects.toThrow('storage limit');
  });
  it('serializes a conversation while admitting another partition, even with two claimers', async () => {
    const first = await enqueueInbound({ payload: payload(), source: 'webhook' });
    const second = await enqueueInbound({ payload: payload(), source: 'polling' });
    const other = await enqueueInbound({ payload: payload(undefined, '966500000010@c.us'), source: 'webhook' });
    const claims = (await Promise.all([claimInbound(), claimInbound()])).filter(Boolean);
    expect(claims.map(job => job!.id).sort()).toEqual([first.id, other.id].sort());
    expect(await claimInbound()).toBeNull();
    await finishInbound(claims.find(job => job!.id === first.id)!, true);
    expect((await claimInbound())?.id).toBe(second.id);
  });
  it('recovers a pre-execution crash and fences the old token', async () => {
    await enqueueInbound({ payload: payload(), source: 'webhook' });
    const first = (await claimInbound())!;
    await expire(first.id); await recoverExpiredInbound();
    const replacement = (await claimInbound())!;
    expect(replacement.lease_token).not.toBe(first.lease_token);
    await expect(assertInboundOwned(first)).rejects.toThrow('lease lost');
    await expect(heartbeatInbound(first)).rejects.toThrow('lease lost');
    await expect(finishInbound(first, true)).rejects.toThrow('lease lost');
    await expect(assertInboundOwned(replacement)).resolves.toBeUndefined();
  });
  it('never replays interrupted business logic and blocks later context until review', async () => {
    const first = await enqueueInbound({ payload: payload(), source: 'webhook' });
    await enqueueInbound({ payload: payload(), source: 'webhook' });
    const job = (await claimInbound())!;
    await (await getPool())!.execute('UPDATE whatsapp_inbound_jobs SET started_at = UTC_TIMESTAMP(3) WHERE id = ?', [job.id]);
    await expire(job.id); await recoverExpiredInbound();
    expect(await row(first.id)).toMatchObject({ status: 'review', error_code: 'worker_interrupted' });
    expect(await claimInbound()).toBeNull();
    expect((await inboundHealth()).find(item => item.status === 'review')!.count).toBeGreaterThanOrEqual(1);
  });
  it('records failed processing without treating it as successful or scheduling blind retries', async () => {
    await enqueueInbound({ payload: payload(), source: 'webhook' });
    const job = (await claimInbound())!;
    await executeInbound(job, async () => { throw new Error('fixture failure'); });
    expect((await row(job.id)).status).toBe('review');
    expect(await claimInbound()).toBeNull();
  });
  it('parks a delayed older event without using it to overwrite newer conversation context', async () => {
    const newest = payload(); await enqueueInbound({ payload: newest, source: 'webhook' });
    await executeInbound((await claimInbound())!, async () => ({ success: true }));
    const older = { ...payload(), timestamp: newest.timestamp - 60 };
    const receipt = await enqueueInbound({ payload: older, source: 'polling' });
    const process = vi.fn(); await executeInbound((await claimInbound())!, process);
    expect(process).not.toHaveBeenCalled();
    expect(await row(receipt.id)).toMatchObject({ status: 'review', error_code: 'late_event' });
  });
  it('revalidates instance ownership at execution after a connection is disabled', async () => {
    await enqueueInbound({ payload: payload(), source: 'webhook' }); const job = (await claimInbound())!;
    await (await getPool())!.execute("UPDATE whatsapp_instances SET status = 'inactive', is_primary = 0 WHERE id = ?", [instanceId]);
    const process = vi.fn(); await executeInbound(job, process);
    expect(process).not.toHaveBeenCalled(); expect(await row(job.id)).toMatchObject({ status: 'review', error_code: 'instance_changed' });
  });
  it('namespaces incoming message IDs while retaining the raw provider receipt', async () => {
    const event = payload(); await enqueueInbound({ payload: event, source: 'webhook' }); const job = (await claimInbound())!;
    await executeInbound(job, async canonical => {
      expect(canonical.idMessage).toBe(`inbound:v1:${job.event_key}`);
      expect(canonical.providerMessageId).toBe(event.idMessage); return { success: true };
    });
    expect((await row(job.id)).payload_json.idMessage).toBe(event.idMessage);
  });
  it('does not repeat a completed legacy message on deployment cutover', async () => {
    const event = payload(); await enqueueInbound({ payload: event, source: 'webhook' }); const job = (await claimInbound())!;
    await (await getPool())!.execute("INSERT INTO messages (conversationId, direction, messageType, content, isProcessed, externalId) VALUES (?, 'incoming', 'text', 'fixture', 1, ?)", [conversationId, event.idMessage]);
    const process = vi.fn(); await executeInbound(job, process);
    expect(process).not.toHaveBeenCalled(); expect((await row(job.id)).status).toBe('completed');
  });
  it('stores the entire reply and media plan before the first provider effect', async () => {
    const event = payload(); await enqueueInbound({ payload: event, source: 'webhook' });
    const job = (await claimInbound())!;
    const plan = buildReplyPlan({ merchantId: fixture.merchantId, instanceId, providerAccount: account, eventId: event.idMessage,
      conversationId, to: phone, text: 'reply', welcome: 'welcome', media: [{ type: 'image', url: 'https://example.com/fixture.png' }] });
    provider.send.mockImplementation(async () => {
      expect((await row(job.id)).reply_plan_json.effects).toHaveLength(3);
      return { accepted: true, status: 'sent', providerMessageId: randomUUID() };
    });
    await executeInbound(job, async () => ({ success: await dispatchReplyPlan(plan) === 'sent' }));
    expect(provider.send).toHaveBeenCalledTimes(3);
    expect((await row(job.id)).status).toBe('completed');
    const [receipts] = await (await getPool())!.execute<any[]>('SELECT request_json FROM whatsapp_message_deliveries WHERE merchant_id = ?', [fixture.merchantId]);
    expect(receipts.every(item => item.request_json.inboundJobId === job.id)).toBe(true);
    expect(JSON.stringify(receipts)).not.toContain('token');
  });
  it('retains unknown delivery and never sends the remaining effects after ambiguity', async () => {
    const event = payload(); await enqueueInbound({ payload: event, source: 'webhook' }); const job = (await claimInbound())!;
    provider.send.mockRejectedValue(new Error('Provider accepted but TCP response lost'));
    const plan = buildReplyPlan({ merchantId: fixture.merchantId, instanceId, providerAccount: account, eventId: event.idMessage,
      conversationId, to: phone, text: 'reply', welcome: 'welcome' });
    await executeInbound(job, async () => ({ success: await dispatchReplyPlan(plan) === 'sent' }));
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect((await row(job.id)).status).toBe('review');
    expect(await claimInbound()).toBeNull();
  });
  it('suppresses a planned reply when a human takes over before dispatch', async () => {
    const event = payload(); await enqueueInbound({ payload: event, source: 'webhook' }); const job = (await claimInbound())!;
    await (await getPool())!.execute('UPDATE conversations SET human_takeover = 1, human_expires_at = NULL WHERE id = ?', [conversationId]);
    const plan = buildReplyPlan({ merchantId: fixture.merchantId, instanceId, providerAccount: account, eventId: event.idMessage,
      conversationId, to: phone, text: 'reply' });
    await executeInbound(job, async () => { expect(await dispatchReplyPlan(plan)).toBe('human_takeover'); return { success: true }; });
    expect(provider.send).not.toHaveBeenCalled();
  });
  it('fences stale plan writes and provider calls once ownership expires', async () => {
    await enqueueInbound({ payload: payload(), source: 'webhook' }); const job = (await claimInbound())!;
    await expect(executeInbound(job, async () => {
      await expire(job.id);
      await expect(currentInboundExecution()!.assertOwned()).rejects.toThrow('lease lost');
      await expect(persistInboundReplyPlan({ text: 'stale' })).rejects.toThrow('lease lost');
      return { success: true };
    })).rejects.toThrow('lease lost');
    expect(provider.send).not.toHaveBeenCalled();
  });
  it('requires an active administrator and matching tenant for a documented resolution', async () => {
    const first = await enqueueInbound({ payload: payload(), source: 'webhook' });
    const job = (await claimInbound())!; await finishInbound(job, false);
    const resolution = { id: first.id, merchantId: fixture.merchantId, actorId: fixture.userId,
      outcome: 'dismissed' as const, note: 'Verified fixture event; no external effects occurred.' };
    await expect(resolveInboundReview(resolution)).rejects.toThrow('administrator');
    await (await getPool())!.execute("UPDATE users SET role = 'admin' WHERE id = ?", [fixture.userId]);
    await expect(resolveInboundReview({ ...resolution, merchantId: fixture.merchantId + 1 })).rejects.toThrow('available');
    await expect(resolveInboundReview(resolution)).resolves.toEqual({ success: true });
    await expect(resolveInboundReview(resolution)).rejects.toThrow('available');
    expect(await row(first.id)).toMatchObject({ status: 'dismissed', resolved_by: fixture.userId, resolution_note: resolution.note });
  });
  it('redacts terminal payloads after 30 days without forgetting deduplication or unresolved effects', async () => {
    const oldEvent = payload();
    const old = await enqueueInbound({ payload: oldEvent, source: 'webhook' });
    const review = await enqueueInbound({ payload: payload(undefined, '966500000020@c.us'), source: 'webhook' });
    const recent = await enqueueInbound({ payload: payload(undefined, '966500000021@c.us'), source: 'webhook' });
    const pool = (await getPool())!;
    await pool.execute("UPDATE whatsapp_inbound_jobs SET status = 'completed', reply_plan_json = JSON_OBJECT('fixture', true), updated_at = TIMESTAMPADD(DAY, -31, UTC_TIMESTAMP()) WHERE id = ?", [old.id]);
    await pool.execute("UPDATE whatsapp_inbound_jobs SET status = 'review', updated_at = TIMESTAMPADD(DAY, -31, UTC_TIMESTAMP()) WHERE id = ?", [review.id]);
    await pool.execute("UPDATE whatsapp_inbound_jobs SET status = 'completed' WHERE id = ?", [recent.id]);
    for (const status of ['sent', 'queued']) {
      await pool.execute("INSERT INTO whatsapp_message_deliveries (merchant_id, instance_id, provider, idempotency_key, direction, status, request_json, status_updated_at) VALUES (?, ?, 'green_api', ?, 'outgoing', ?, JSON_OBJECT('text','fixture'), TIMESTAMPADD(DAY, -31, UTC_TIMESTAMP()))",
        [fixture.merchantId, instanceId, randomUUID(), status]);
    }
    await purgeCompletedInboundPayloads();
    expect(await row(old.id)).toMatchObject({ payload_json: { redacted: true }, reply_plan_json: null });
    expect((await row(review.id)).payload_json.messageData).toBeDefined();
    expect((await row(recent.id)).payload_json.messageData).toBeDefined();
    expect(await enqueueInbound({ payload: oldEvent, source: 'polling' })).toEqual({ id: old.id, duplicate: true });
    const [receipts] = await pool.execute<any[]>('SELECT status, request_json FROM whatsapp_message_deliveries WHERE merchant_id = ?', [fixture.merchantId]);
    expect(receipts.find(item => item.status === 'sent').request_json).toBeNull();
    expect(receipts.find(item => item.status === 'queued').request_json).toEqual({ text: 'fixture' });
    await expect(purgeCompletedInboundPayloads(0)).rejects.toThrow('batch');
  });
  it('isolates identical provider receipt IDs by connected account and direction', async () => {
    const pool = (await getPool())!;
    const other = await createDisposableMerchant('receipt-scope');
    try {
      const otherAccount = randomUUID();
      const [second] = await pool.execute<any>("INSERT INTO whatsapp_instances (merchant_id, instance_id, token, provider, status, is_primary) VALUES (?, ?, 'fixture', 'green_api', 'active', 1)", [other.merchantId, otherAccount]);
      const receiptId = randomUUID();
      for (const [merchantId, instance] of [[fixture.merchantId, instanceId], [other.merchantId, second.insertId]]) {
        const receipt = { merchantId, instanceRecordId: instance, provider: 'green_api' as const, providerMessageId: receiptId };
        expect(await recordInboundWhatsAppReceipt(receipt)).toBe('recorded');
        expect(await recordInboundWhatsAppReceipt(receipt)).toBe('duplicate');
        await pool.execute("INSERT INTO whatsapp_message_deliveries (merchant_id, instance_id, provider, provider_message_id, idempotency_key, direction, status) VALUES (?, ?, 'green_api', ?, ?, 'outgoing', 'sent')", [merchantId, instance, receiptId, randomUUID()]);
      }
      expect(await updateWhatsAppDeliveryStatus({ provider: 'green_api', providerAccount: account, providerMessageId: receiptId, status: 'read' })).toBe('updated');
      expect(await updateWhatsAppDeliveryStatus({ provider: 'green_api', providerAccount: randomUUID(), providerMessageId: receiptId, status: 'failed' })).toBe('not_found');
      const [rows] = await pool.execute<any[]>('SELECT merchant_id, direction, status FROM whatsapp_message_deliveries WHERE provider_message_id = ?', [receiptId]);
      expect(rows).toHaveLength(4);
      expect(rows.find(item => item.merchant_id === other.merchantId && item.direction === 'outgoing').status).toBe('sent');
      expect(rows.filter(item => item.direction === 'incoming').every(item => item.status === 'received')).toBe(true);
      expect(await updateWhatsAppDeliveryStatus({ provider: 'green_api', providerAccount: account, providerMessageId: receiptId, status: 'sent' })).toBe('ignored');
    } finally { await cleanupDisposableMerchants([other.userId]); }
  });
  it('splits long replies without dropping characters or splitting an emoji, with stable effect keys', () => {
    const input = { merchantId: fixture.merchantId, instanceId, providerAccount: account, eventId: randomUUID(),
      conversationId, to: phone, text: 'أ'.repeat(4095) + '😀' + 'ب'.repeat(4200) };
    const plan = buildReplyPlan(input);
    expect(plan.effects).toHaveLength(3);
    expect(plan.effects.every(effect => effect.text!.length <= 4096)).toBe(true);
    expect(plan.effects.map(effect => effect.text).join('')).toBe(input.text);
    expect(plan.effects[1].text?.startsWith('😀')).toBe(true);
    expect(new Set(plan.effects.map(effect => effect.idempotencyKey)).size).toBe(3);
    expect(buildReplyPlan(input)).toEqual(plan);
  });
});
