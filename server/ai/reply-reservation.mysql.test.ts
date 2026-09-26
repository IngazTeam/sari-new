import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const provider = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../channels/whatsapp/providers', () => ({ getWhatsAppProvider: () => provider }));
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants, createDisposableTrialSubscription } from '../tests/helpers/disposable-merchant';
import { buildReplyPlan, dispatchReplyPlan } from '../messaging/reply-plan';
import { stageInteraction, finishInteractionDelivery } from './interaction-jobs';
import { canDispatchConversationReply, ordinaryReplyDigest } from './reply-reservation';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import { transitionConversationOwnership } from './conversation-handoff';

describe.skipIf(!process.env.DATABASE_URL)('shared incoming reply ownership with MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  let conversationId: number, incomingMessageId: number, instanceId: number;
  const query = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const plan = () => buildReplyPlan({ merchantId: owner.merchantId, instanceId, providerAccount: 'fixture', eventId: `source-${incomingMessageId}`,
    conversationId, incomingMessageId, to: '966500000989', text: 'النص المعتمد للرد العادي' });
  const guarded = (p = plan()) => ({ ...p.effects[0], replyGuard: { conversationId: p.conversationId,
    incomingMessageId: p.incomingMessageId, version: p.ownershipVersion!, reservationDigest: ordinaryReplyDigest(p) } });
  beforeEach(async () => {
    owner = await createDisposableMerchant('reply-reservation'); other = await createDisposableMerchant('reply-other');
    await createDisposableTrialSubscription(owner.merchantId);
    conversationId = Number((await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,'966500000989','active')", [owner.merchantId])).insertId);
    incomingMessageId = Number((await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','استفسار')", [conversationId])).insertId);
    instanceId = Number((await query("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,is_primary) VALUES (?,?,'fixture','green_api','active',1)", [owner.merchantId, randomUUID()])).insertId);
    provider.send.mockReset().mockImplementation(async () => ({ accepted: true, status: 'sent', providerMessageId: randomUUID() }));
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants([owner.userId, other.userId]); });
  afterAll(closeDb);
  it('reserves identical plans idempotently and sends the effect once across concurrent dispatches', async () => {
    const p = plan(); await Promise.all([stageInteraction(p), stageInteraction(p), stageInteraction(p)]);
    const results = await Promise.allSettled([dispatchReplyPlan(p), dispatchReplyPlan(p), dispatchReplyPlan(p)]);
    expect(results.some(r => r.status === 'fulfilled' && r.value === 'sent')).toBe(true);
    expect(provider.send).toHaveBeenCalledOnce();
    expect(await query('SELECT state,reply_origin FROM ai_interaction_jobs WHERE merchant_id=?', [owner.merchantId])).toEqual([{ state: 'pending', reply_origin: 'ordinary' }]);
  });
  it.each(['text','recipient','account','key','media','version','tenant','source'] as const)('rejects changed %s under an existing reservation', async change => {
    const p = plan(); await stageInteraction(p); const input = guarded(p);
    if (change === 'text') input.text = 'Different'; if (change === 'recipient') input.to = '966500000988';
    if (change === 'account') input.instanceRecordId!++; if (change === 'key') input.idempotencyKey += 'x';
    if (change === 'media') input.mediaUrl = 'https://example.com/changed.png'; if (change === 'version') input.replyGuard.version++;
    if (change === 'tenant') input.merchantId = other.merchantId; if (change === 'source') input.replyGuard.incomingMessageId!++;
    expect(await canDispatchConversationReply(input, input.instanceRecordId!)).toBe(false);
    expect(provider.send).not.toHaveBeenCalled();
  });
  it('rejects a different competing plan without changing the original learning text or state', async () => {
    const p = plan(), rival = structuredClone(p); rival.effects[0].text = 'Another answer';
    await stageInteraction(p); await expect(stageInteraction(rival)).rejects.toThrow('ownership');
    await finishInteractionDelivery(rival, true);
    expect(await dispatchReplyPlan(rival)).toBe('reply_reserved');
    expect(await query('SELECT reply_text,state FROM ai_interaction_jobs WHERE merchant_id=?', [owner.merchantId]))
      .toEqual([{ reply_text: p.effects[0].text, state: 'waiting_delivery' }]);
    expect(provider.send).not.toHaveBeenCalled();
  });
  it.each(['legacy','reviewed'] as const)('does not replace the %s owner from a direct channel call', async origin => {
    await query(`INSERT INTO ai_interaction_jobs (merchant_id,conversation_id,incoming_message_id,reply_text,reply_origin,state,reply_digest,sales_delivery_id)
      VALUES (?,?,?,'Existing',?,?,?,?)`, [owner.merchantId, conversationId, incomingMessageId, origin,
      origin === 'legacy' ? 'waiting_delivery' : 'reviewed_reserved', origin === 'legacy' ? null : 'a'.repeat(64), origin === 'legacy' ? null : 123]);
    const input = guarded(); delete (input.replyGuard as any).reservationDigest;
    expect(await sendMerchantWhatsApp(input)).toMatchObject({ accepted: false, errorCode: 'conversation_superseded' });
    expect(provider.send).not.toHaveBeenCalled();
  });
  it.each(['pending','suppressed','completed','failed'])('does not reopen an ordinary %s reservation with a fresh transport key', async state => {
    const p = plan(); await stageInteraction(p);
    await query('UPDATE ai_interaction_jobs SET state=? WHERE merchant_id=?', [state, owner.merchantId]);
    expect(await sendMerchantWhatsApp(guarded(p))).toMatchObject({ accepted: false }); expect(provider.send).not.toHaveBeenCalled();
  });
  it('direct anchored compatibility reserves one exact effect and rejects a replacement', async () => {
    const input = guarded(); delete (input.replyGuard as any).reservationDigest; delete input.instanceRecordId;
    expect(await sendMerchantWhatsApp(input)).toMatchObject({ accepted: true });
    expect(await sendMerchantWhatsApp({ ...input, text: 'Replacement', idempotencyKey: randomUUID() })).toMatchObject({ accepted: false });
    expect(provider.send).toHaveBeenCalledOnce();
  });
  it.each(['missing-source','new-source','human','corrupt-plan','wrong-digest'] as const)('fails closed for %s at the final transport boundary', async change => {
    const p = plan(); await stageInteraction(p); const input = guarded(p);
    if (change === 'missing-source') delete input.replyGuard.incomingMessageId;
    if (change === 'new-source') await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','رسالة أحدث')", [conversationId]);
    if (change === 'human') await transitionConversationOwnership(conversationId, { humanTakeover: 1 }, { merchantId: owner.merchantId });
    if (change === 'corrupt-plan') await query("UPDATE ai_interaction_jobs SET reply_plan=JSON_OBJECT('version',1) WHERE merchant_id=?", [owner.merchantId]);
    if (change === 'wrong-digest') input.replyGuard.reservationDigest = 'f'.repeat(64);
    expect(await sendMerchantWhatsApp(input)).toMatchObject({ accepted: false }); expect(provider.send).not.toHaveBeenCalled();
  });
  it('retains the reservation on unknown transport and prevents a different plan from filling the uncertainty', async () => {
    provider.send.mockRejectedValue(Error('Synthetic transport loss')); const p = plan();
    await expect(dispatchReplyPlan(p)).rejects.toThrow('delivery review');
    const rival = structuredClone(p); rival.effects[0].idempotencyKey = randomUUID();
    expect(await dispatchReplyPlan(rival)).toBe('reply_reserved'); expect(provider.send).toHaveBeenCalledOnce();
  });
  it.each([undefined, 0])('does not silently mark an unanchored source %s as successfully suppressed', async source => {
    const p = plan(); p.incomingMessageId = source;
    await expect(dispatchReplyPlan(p)).rejects.toThrow('source ownership'); expect(provider.send).not.toHaveBeenCalled();
    expect(await query('SELECT id FROM ai_interaction_jobs WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
  });
  it('refuses a corrupted learning text at staging, transport, and acceptance even when the plan digest is intact', async () => {
    const p = plan(); await stageInteraction(p);
    await query("UPDATE ai_interaction_jobs SET reply_text='Corrupted learning evidence' WHERE merchant_id=?", [owner.merchantId]);
    await expect(stageInteraction(p)).rejects.toThrow('ownership');
    expect(await canDispatchConversationReply(guarded(p), instanceId)).toBe(false);
    await finishInteractionDelivery(p, true);
    expect((await query('SELECT state FROM ai_interaction_jobs WHERE merchant_id=?', [owner.merchantId]))[0].state).toBe('waiting_delivery');
    expect(provider.send).not.toHaveBeenCalled();
  });
});
