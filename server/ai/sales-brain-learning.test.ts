import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), signal: vi.fn(), count: vi.fn(), schema: vi.fn() }));
vi.mock('../db', () => ({ getPool: async () => ({ execute: mocks.execute }), getAllMerchants: async () => [] }));
vi.mock('../db/schema-readiness', () => ({ assertRuntimeSchema: mocks.schema }));
vi.mock('./openai', () => ({ callGPT4: vi.fn() }));
import { captureConversationSignals, selectSignalsForAnalysis } from './learning-engine';
import { upsertDNA } from '../db/learning';
import { getOrCreateProfile } from '../db/customer-intelligence';
import { runWeeklyAnalysis } from './sales-conductor';
import { cacheSuccessfulResponse, findCachedResponse } from './rag-engine';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockImplementation(async (sql: string) => sql.includes('COUNT(') ? [[{ cnt: 0 }]] : [[]]);
});
describe('sales memory and learning boundaries', () => {
  it('only marks the exact bounded sample shown to the analyst as analyzed', () => {
    const signals = Array.from({ length: 25 }, (_, index) => ({ id: index + 1,
      signalType: index < 15 ? 'price_objection' : 'purchase_completed' })) as any[];
    expect(selectSignalsForAnalysis(signals).map(signal => signal.id)).toEqual([1, 2, 3, 4, 5, 16, 17, 18, 19, 20]);
  });
  it('retains a price objection even when the customer expresses anger', async () => {
    await captureConversationSignals({ merchantId: 1, conversationId: 2,
      customerMessage: 'غالي وما يستاهل', botResponse: 'ما الاحتياج الذي لم يلبه العرض؟', sourceKey: 'message:4', strict: true });
    const insert = mocks.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO sari_learning_signals'));
    expect(insert).toBeDefined();
    expect(insert![1]).toContain('price_objection');
    expect(insert![1]).toContain('message:4');
  });
  it.each([false, true])('persists learning only as a proposal even for autoApplied=%s', async autoApplied => {
    await upsertDNA({ merchantId: 1, generation: 2, dimension: 'objection_handling', insight: 'Explain relevant value',
      evidenceCount: 1, confidence: 0.99, autoApplied });
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO ai_learning_proposals'))).toBe(true);
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO sari_behavioral_dna'))).toBe(false);
  });
  it('reads a profile without incrementing the conversation count', async () => {
    mocks.execute.mockImplementation(async (sql: string) => sql.startsWith('SELECT')
      ? [[{ id: 3, merchant_id: 1, customer_phone: 'fixture', total_conversations: 1, preferences: '{}', pain_points: '[]', purchase_history: '[]' }]] : [{}]);
    const first = await getOrCreateProfile(1, 'fixture');
    const second = await getOrCreateProfile(1, 'fixture');
    expect(second.totalConversations).toBe(first.totalConversations);
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('total_conversations + 1'))).toBe(false);
  });
  it('uses the real signal schema in weekly analysis', async () => {
    await runWeeklyAnalysis(1);
    const query = mocks.execute.mock.calls.find(([sql]) => sql.includes('FROM sari_learning_signals'))![0];
    expect(query).toContain('COUNT(DISTINCT conversation_id)');
    expect(query).toContain("'price_objection'");
    expect(query).not.toContain('GROUP BY signal_type, signal_value');
  });
  it('never stores or replays a legacy personalized final response', async () => {
    await cacheSuccessfulResponse(1, 'كم سعر الدورة؟', 'أهلاً أحمد، سعر عرض حسابك الخاص 230 ريال');
    expect(await findCachedResponse(1, 'كم سعر الدورة؟')).toBeNull();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
