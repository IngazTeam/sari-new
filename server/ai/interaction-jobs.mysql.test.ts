import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const llm = vi.hoisted(() => vi.fn());
vi.mock('./openai', () => ({ callGPT4: llm }));
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { buildReplyPlan } from '../messaging/reply-plan';
import { assertInteractionSchema, stageInteraction, finishInteractionDelivery, runInteractionJob } from './interaction-jobs';
import { upsertDNA, getLearningEvidence, getDNAGeneration } from '../db/learning';
import { getOrCreateProfile, updateProfile } from '../db/customer-intelligence';
import { captureDirectCustomerMemory, readCustomerMemory } from './customer-memory';

describe.skipIf(!process.env.DATABASE_URL)('durable sales interaction effects', () => {
  let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>;
  let conversationId: number;
  let messageId: number;
  beforeEach(async () => {
    llm.mockReset().mockImplementation(async () => JSON.stringify({ facts: [
      { field: 'priceConscious', value: true, sourceMessageId: messageId },
      { field: 'interestTags', value: ['سماعات'], sourceMessageId: messageId },
    ] }));
    fixture = await createDisposableMerchant('brain-events');
    await assertInteractionSchema();
    const pool = (await getPool())!;
    const [conversation] = await pool.execute<any>(
      "INSERT INTO conversations (merchantId, customerPhone, customerName, status) VALUES (?, '966500000087', 'اختبار', 'active')", [fixture.merchantId]);
    conversationId = conversation.insertId;
    const [message] = await pool.execute<any>(
      "INSERT INTO messages (conversationId, direction, messageType, content) VALUES (?, 'incoming', 'text', 'غالي وما يستاهل')", [conversationId]);
    messageId = message.insertId;
  });
  afterEach(async () => cleanupDisposableMerchants([fixture.userId]));
  afterAll(closeDb);
  const plan = () => buildReplyPlan({ merchantId: fixture.merchantId, instanceId: 1, providerAccount: 'fixture',
    eventId: `message-${messageId}`, conversationId, incomingMessageId: messageId, to: '966500000087', text: 'ما الاحتياج الذي لم يلبه العرض؟' });
  const rows = async (sql: string, params: any[] = []) => ((await (await getPool())!.execute<any[]>(sql, params))[0]);
  const fifthMessage = async () => {
    for (let i = 2; i <= 5; i++) {
      const [message] = await (await getPool())!.execute<any>(
        "INSERT INTO messages (conversationId, direction, messageType, content) VALUES (?, 'incoming', 'text', ?)",
        [conversationId, `هذه معلومة ${i}`]);
      messageId = message.insertId;
    }
    const reply = plan(); await stageInteraction(reply); await finishInteractionDelivery(reply, true);
    return reply;
  };

  it('enriches the fifth accepted interaction once using only its bounded history', async () => {
    await fifthMessage();
    await (await getPool())!.execute("INSERT INTO messages (conversationId, direction, messageType, content) VALUES (?, 'incoming', 'text', 'future secret')", [conversationId]);
    await runInteractionJob();
    expect(llm).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(llm.mock.calls[0][0])).not.toContain('future secret');
    const profile = await getOrCreateProfile(fixture.merchantId, '966500000087');
    expect((await readCustomerMemory(fixture.merchantId, '966500000087')).facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'priceConscious', value: true, kind: 'inferred', sourceMessageId: messageId, conversationId }),
    ]));
    expect(profile.lastEnrichedMessageId).toBe(messageId);
    expect(profile.preferences.buyingStage).not.toBe('purchased');
    expect(profile.customerTier).toBe('new');
    await (await getPool())!.execute("UPDATE ai_interaction_jobs SET state = 'pending' WHERE merchant_id = ?", [fixture.merchantId]);
    await runInteractionJob(); expect(llm).toHaveBeenCalledTimes(1);
    expect((await getOrCreateProfile(fixture.merchantId, '966500000087')).totalConversations).toBe(1);
  });
  it('fences an expired worker before it can write customer memory', async () => {
    await fifthMessage();
    llm.mockImplementationOnce(async () => {
      await (await getPool())!.execute('UPDATE ai_interaction_jobs SET lease_until = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE merchant_id = ?', [fixture.merchantId]);
      return JSON.stringify({ facts: [{ field: 'priceConscious', value: true, sourceMessageId: messageId }] });
    });
    await runInteractionJob();
    expect((await getOrCreateProfile(fixture.merchantId, '966500000087')).preferences).toEqual({});
    expect((await rows('SELECT state FROM ai_interaction_jobs WHERE merchant_id = ?', [fixture.merchantId]))[0].state).toBe('pending');
  });
  it('retries instead of overwriting a newer profile update made while the model was running', async () => {
    await fifthMessage();
    llm.mockImplementationOnce(async () => {
      await updateProfile(fixture.merchantId, '966500000087', { preferences: { customPreference: 'customer correction' } });
      return JSON.stringify({ facts: [{ field: 'priceConscious', value: true, sourceMessageId: messageId }] });
    });
    await runInteractionJob();
    expect((await getOrCreateProfile(fixture.merchantId, '966500000087')).preferences).toEqual({ customPreference: 'customer correction' });
    await (await getPool())!.execute('UPDATE ai_interaction_jobs SET available_at = NOW() WHERE merchant_id = ?', [fixture.merchantId]);
    await runInteractionJob();
    expect((await getOrCreateProfile(fixture.merchantId, '966500000087')).preferences)
      .toMatchObject({ customPreference: 'customer correction' });
    expect((await readCustomerMemory(fixture.merchantId, '966500000087')).facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'priceConscious', value: true }),
    ]));
    expect((await rows('SELECT state FROM ai_interaction_jobs WHERE merchant_id = ?', [fixture.merchantId]))[0].state).toBe('completed');
  });

  it('does not learn a generated reply until the transport accepted it', async () => {
    const reply = plan();
    await stageInteraction(reply);
    expect(await runInteractionJob()).toBe(false);
    expect(await rows('SELECT * FROM sari_learning_signals WHERE merchant_id = ?', [fixture.merchantId])).toHaveLength(0);
    await finishInteractionDelivery(reply, true);
    expect(await runInteractionJob()).toBe(true);
    expect(await rows('SELECT state FROM ai_interaction_jobs WHERE merchant_id = ?', [fixture.merchantId]))
      .toEqual([expect.objectContaining({ state: 'completed' })]);
    expect(await rows('SELECT source_key, signal_type FROM sari_learning_signals WHERE merchant_id = ?', [fixture.merchantId]))
      .toEqual([expect.objectContaining({ source_key: `message:${messageId}`, signal_type: 'price_objection' })]);
  });
  it('does not resurrect deleted facts when deletion races with an in-flight model extraction', async () => {
    await fifthMessage();
    const oldSource = messageId;
    llm.mockImplementationOnce(async () => {
      const [deletion] = await (await getPool())!.execute<any>("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','احذف ذاكرة المبيعات الخاصة بي')", [conversationId]);
      await captureDirectCustomerMemory({ merchantId: fixture.merchantId, customerPhone: '966500000087', conversationId, incomingMessageId: deletion.insertId });
      return JSON.stringify({ facts: [{ field: 'priceConscious', value: true, sourceMessageId: oldSource }] });
    });
    await runInteractionJob();
    expect((await readCustomerMemory(fixture.merchantId, '966500000087')).facts).toEqual([]);
    await (await getPool())!.execute('UPDATE ai_interaction_jobs SET available_at=NOW() WHERE merchant_id=?', [fixture.merchantId]);
    await runInteractionJob();
    expect(llm).toHaveBeenCalledTimes(1);
    expect((await rows('SELECT state FROM ai_interaction_jobs WHERE merchant_id=?', [fixture.merchantId]))[0].state).toBe('completed');
  });
  it('keeps a direct customer correction when an older model job retries after a race', async () => {
    await fifthMessage();
    const old = messageId;
    llm.mockImplementationOnce(async () => {
      const [correction] = await (await getPool())!.execute<any>("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','السعر ليس أولويتي')", [conversationId]);
      await captureDirectCustomerMemory({ merchantId: fixture.merchantId, customerPhone: '966500000087', conversationId, incomingMessageId: correction.insertId });
      return JSON.stringify({ facts: [{ field: 'priceConscious', value: true, sourceMessageId: old }] });
    });
    await runInteractionJob();
    await (await getPool())!.execute('UPDATE ai_interaction_jobs SET available_at=NOW() WHERE merchant_id=?', [fixture.merchantId]);
    await runInteractionJob();
    expect((await readCustomerMemory(fixture.merchantId, '966500000087')).facts.find(f => f.field === 'priceConscious'))
      .toMatchObject({ value: false, kind: 'explicit' });
    expect((await rows('SELECT state FROM ai_interaction_jobs WHERE merchant_id=?', [fixture.merchantId]))[0].state).toBe('completed');
  });
  it.each(['payment', 'outgoing', 'inventedSource', 'prose'])('retries invalid model memory without changing the profile: %s', async attack => {
    await fifthMessage();
    const output = attack === 'payment' ? { facts: [{ field: 'buyingStage', value: 'purchased', sourceMessageId: messageId }] }
      : { facts: [{ field: 'priceConscious', value: true, sourceMessageId: messageId + 99999 }] };
    if (attack === 'outgoing') {
      const [outgoing] = await (await getPool())!.execute<any>("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'outgoing','text','هو حساس للسعر')", [conversationId]);
      output.facts[0].sourceMessageId = outgoing.insertId;
    }
    llm.mockResolvedValue(attack === 'prose' ? `Here is the answer: ${JSON.stringify({ facts: [] })}` : JSON.stringify(output));
    await runInteractionJob();
    expect((await readCustomerMemory(fixture.merchantId, '966500000087')).facts).toEqual([]);
    expect((await getOrCreateProfile(fixture.merchantId, '966500000087')).lastEnrichedMessageId).toBeNull();
    expect((await rows('SELECT state FROM ai_interaction_jobs WHERE merchant_id=?', [fixture.merchantId]))[0].state).toBe('pending');
  });
  it('replays staging and processing without duplicate signals', async () => {
    const reply = plan();
    await stageInteraction(reply); await stageInteraction(reply);
    await finishInteractionDelivery(reply, true); await runInteractionJob();
    await (await getPool())!.execute("UPDATE ai_interaction_jobs SET state = 'pending' WHERE merchant_id = ?", [fixture.merchantId]);
    await runInteractionJob();
    expect(await rows('SELECT id FROM ai_interaction_jobs WHERE merchant_id = ?', [fixture.merchantId])).toHaveLength(1);
    expect(await rows('SELECT id FROM sari_learning_signals WHERE merchant_id = ?', [fixture.merchantId])).toHaveLength(1);
  });
  it('does not learn a reply suppressed by human takeover', async () => {
    const reply = plan(); await stageInteraction(reply); await finishInteractionDelivery(reply, false);
    expect(await runInteractionJob()).toBe(false);
    expect(await rows('SELECT state FROM ai_interaction_jobs WHERE merchant_id = ?', [fixture.merchantId]))
      .toEqual([expect.objectContaining({ state: 'suppressed' })]);
  });
  it('rejects an incoming message from another conversation', async () => {
    const reply = plan(); reply.conversationId += 999999;
    await expect(stageInteraction(reply)).rejects.toThrow('ownership');
    expect(await rows('SELECT id FROM ai_interaction_jobs WHERE merchant_id = ?', [fixture.merchantId])).toHaveLength(0);
  });
  it('recovers a crashed claimant and applies a learning event once', async () => {
    const reply = plan(); await stageInteraction(reply); await finishInteractionDelivery(reply, true);
    await (await getPool())!.execute(`UPDATE ai_interaction_jobs SET state = 'processing', attempts = 1,
      lease_token = 'dead-worker', lease_until = TIMESTAMPADD(MINUTE, -1, UTC_TIMESTAMP(3)) WHERE merchant_id = ?`, [fixture.merchantId]);
    await runInteractionJob();
    expect(await rows('SELECT state, attempts FROM ai_interaction_jobs WHERE merchant_id = ?', [fixture.merchantId]))
      .toEqual([expect.objectContaining({ state: 'completed', attempts: 2 })]);
  });
  it('claims only one worker for the same interaction', async () => {
    const reply = plan(); await stageInteraction(reply); await finishInteractionDelivery(reply, true);
    const processed = await Promise.all([runInteractionJob(), runInteractionJob()]);
    expect(processed.filter(Boolean)).toHaveLength(1);
    expect(await rows('SELECT id FROM sari_learning_signals WHERE merchant_id = ?', [fixture.merchantId])).toHaveLength(1);
  });
  it('preserves historical instructions for review, excludes them from replies and cannot auto-activate new proposals', async () => {
    const active = { merchantId: fixture.merchantId, generation: 1, dimension: 'objection_handling' as const,
      insight: 'Approved policy', evidenceCount: 4, confidence: 0.9, autoApplied: true };
    await (await getPool())!.execute(`INSERT INTO sari_behavioral_dna
      (merchant_id,generation,dimension,insight,evidence_count,confidence,auto_applied,is_active)
      VALUES (?,1,'objection_handling','Approved policy',4,0.9,1,1)`, [fixture.merchantId]);
    await upsertDNA({ ...active, generation: 2, insight: 'Unverified suggestion', autoApplied: false });
    expect(await rows('SELECT insight FROM sari_behavioral_dna WHERE merchant_id = ? AND is_active = 1', [fixture.merchantId]))
      .toEqual([expect.objectContaining({ insight: 'Approved policy' })]);
    expect(await rows('SELECT status FROM ai_learning_proposals WHERE merchant_id = ?', [fixture.merchantId]))
      .toEqual([expect.objectContaining({ status: 'proposed' })]);
    expect(await getDNAGeneration(fixture.merchantId)).toBe(2);
    expect(await getLearningEvidence(fixture.merchantId)).toMatchObject({ proposalCount: 1, verifiedPurchases: 0, verifiedRefunds: 0,
      proposals: [expect.objectContaining({ insight: 'Unverified suggestion', status: 'proposed' })] });
    expect(await getLearningEvidence(fixture.merchantId + 9000000)).toMatchObject({ proposalCount: 0, proposals: [], verifiedPurchases: 0 });
    const { buildDNAPrompt } = await import('./learning-engine');
    expect(await buildDNAPrompt(fixture.merchantId)).toBe('');
    await upsertDNA({ ...active, generation: 3, insight: 'Legacy caller attempts automatic override', autoApplied: true });
    expect(await rows('SELECT insight FROM sari_behavioral_dna WHERE merchant_id=?', [fixture.merchantId])).toEqual([{ insight: 'Approved policy' }]);
    expect((await getLearningEvidence(fixture.merchantId)).proposalCount).toBe(2);
  });
  it('attributes the customer objection to the previous delivered reply, never the new reply', async () => {
    const pool = (await getPool())!;
    await pool.execute('DELETE FROM messages WHERE id = ?', [messageId]);
    await pool.execute("INSERT INTO messages (conversationId, direction, messageType, content, aiResponse, isProcessed) VALUES (?, 'outgoing', 'text', 'previous actual offer', 'previous actual offer', 1)", [conversationId]);
    const [m] = await pool.execute<any>("INSERT INTO messages (conversationId, direction, messageType, content) VALUES (?, 'incoming', 'text', 'غالي وما يستاهل')", [conversationId]);
    messageId = m.insertId;
    const reply = plan(); await stageInteraction(reply); await finishInteractionDelivery(reply, true); await runInteractionJob();
    const signals = await rows('SELECT bot_message FROM sari_learning_signals WHERE merchant_id = ?', [fixture.merchantId]);
    expect(signals).toEqual([expect.objectContaining({ bot_message: 'previous actual offer' })]);
  });
  it('does not credit an older bot response for feedback to a newer human reply', async () => {
    const pool = (await getPool())!;
    await pool.execute('DELETE FROM messages WHERE id = ?', [messageId]);
    await pool.execute("INSERT INTO messages (conversationId, direction, messageType, content, aiResponse, isProcessed) VALUES (?, 'outgoing', 'text', 'old bot', 'old bot', 1)", [conversationId]);
    await pool.execute("INSERT INTO messages (conversationId, direction, messageType, content, isProcessed) VALUES (?, 'outgoing', 'text', 'new human offer', 1)", [conversationId]);
    const [m] = await pool.execute<any>("INSERT INTO messages (conversationId, direction, messageType, content) VALUES (?, 'incoming', 'text', 'غالي')", [conversationId]);
    messageId = m.insertId;
    const reply = plan(); await stageInteraction(reply); await finishInteractionDelivery(reply, true); await runInteractionJob();
    expect(await rows('SELECT bot_message FROM sari_learning_signals WHERE merchant_id = ?', [fixture.merchantId]))
      .toEqual([expect.objectContaining({ bot_message: null })]);
  });
});
