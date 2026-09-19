import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { getSession, destroySession, restoreSession } from './session-context';
import { createSessionWithPersist, getSessionWithFallback, invalidateMerchantSessions, updateSessionWithPersist } from './session-store';

describe.skipIf(!process.env.DATABASE_URL)('authoritative conversation sessions', () => {
  let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>;
  let conversationId: number;
  beforeEach(async () => {
    fixture = await createDisposableMerchant('session');
    const [result] = await (await getPool())!.execute<any>(
      "INSERT INTO conversations (merchantId, customerPhone, status) VALUES (?, '966500000011', 'active')", [fixture.merchantId],
    );
    conversationId = result.insertId;
  });
  afterEach(async () => { destroySession(fixture.merchantId, conversationId); await cleanupDisposableMerchants([fixture.userId]); });
  afterAll(closeDb);
  const input = () => ({ merchantId: fixture.merchantId, conversationId, ragFacts: 'verified', ragBehaviors: 'polite',
    relevantProducts: [{ id: 1 }], contextPrompt: 'context', initialSentiment: 'neutral', initialIntent: 'inquiring' as const });

  it('recovers all evolving history after memory loss without resetting the message count', async () => {
    await createSessionWithPersist(input());
    const updated = await updateSessionWithPersist(fixture.merchantId, conversationId, { intent: 'hesitating', topic: 'delivery', sentiment: 'negative', persuasionTactic: 'trust' });
    destroySession(fixture.merchantId, conversationId);
    expect(await getSessionWithFallback(fixture.merchantId, conversationId)).toEqual(updated);
    expect(getSession(fixture.merchantId, conversationId)).toEqual(updated);
    expect(updated).toMatchObject({ messageCount: 2, topicsDiscussed: ['delivery'], persuasionUsed: ['trust'], customerIntent: 'hesitating' });
  });
  it('preserves twenty concurrent patches across independent transactions', async () => {
    await createSessionWithPersist(input());
    await Promise.all(Array.from({ length: 20 }, (_, index) => updateSessionWithPersist(fixture.merchantId, conversationId, { topic: `topic-${index}`, sentiment: 'neutral' })));
    const session = await getSessionWithFallback(fixture.merchantId, conversationId);
    expect(session).toMatchObject({ messageCount: 21, version: 21 });
    expect(session?.topicsDiscussed).toHaveLength(20);
    expect(session?.sentimentTrajectory).toHaveLength(10);
  });
  it('does not count persuasion or context enrichment as another customer message', async () => {
    await createSessionWithPersist(input());
    await updateSessionWithPersist(fixture.merchantId, conversationId, { persuasionTactic: 'trust', countMessage: false });
    await updateSessionWithPersist(fixture.merchantId, conversationId, { contextAppend: ' updated', countMessage: false });
    expect(await getSessionWithFallback(fixture.merchantId, conversationId)).toMatchObject({ messageCount: 1, contextPrompt: 'context updated' });
  });
  it('ignores a stale local cache and rejects a stale topic rebuild by version', async () => {
    const original = await createSessionWithPersist(input());
    const updated = await updateSessionWithPersist(fixture.merchantId, conversationId, { topic: 'new' });
    restoreSession(original);
    expect(await getSessionWithFallback(fixture.merchantId, conversationId)).toEqual(updated);
    await expect(createSessionWithPersist({ ...input(), contextPrompt: 'stale' }, original.version)).rejects.toThrow('changed');
    expect((await getSessionWithFallback(fixture.merchantId, conversationId))?.contextPrompt).toBe('context');
  });
  it('invalidates every worker view and prevents resurrecting a stale rebuild', async () => {
    const original = await createSessionWithPersist(input());
    await invalidateMerchantSessions(fixture.merchantId);
    restoreSession(original);
    expect(await getSessionWithFallback(fixture.merchantId, conversationId)).toBeNull();
    await expect(createSessionWithPersist(input(), original.version)).rejects.toThrow('changed');
    expect((await createSessionWithPersist({ ...input(), contextPrompt: 'fresh' })).contextPrompt).toBe('fresh');
  });
  it('rejects a cross-tenant conversation and never inserts a forged context', async () => {
    await expect(createSessionWithPersist({ ...input(), merchantId: fixture.merchantId + 1 })).rejects.toThrow('tenant mismatch');
    expect(await getSessionWithFallback(fixture.merchantId + 1, conversationId)).toBeNull();
  });
  it('does not overwrite an active context on concurrent initial builds', async () => {
    const sessions = await Promise.all(Array.from({ length: 10 }, (_, index) => createSessionWithPersist({ ...input(), contextPrompt: `build-${index}` })));
    expect(new Set(sessions.map(item => item.contextPrompt)).size).toBe(1);
    expect((await getSessionWithFallback(fixture.merchantId, conversationId))?.messageCount).toBe(1);
  });
});
