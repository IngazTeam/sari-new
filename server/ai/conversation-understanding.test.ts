import { describe, expect, it, vi } from 'vitest';
vi.mock('./openai', () => ({ callGPT4: vi.fn() }));
import { validateUnderstanding, understandingMessages, type UnderstandingInput } from './conversation-understanding';
import { withConversationUnderstanding, semanticAction, semanticQuoteMatches, semanticIdentityMatches, type ConversationUnderstanding } from './conversation-understanding-context';
import { isShortAffirmation, isSalesRefusal, isExplicitPurchaseInstruction } from './customer-decision';
import { detectIntent } from './session-context';
import { detectSentimentFast } from './fast-sentiment';
import { decideSalesTurnGoal, buildSalesTurnPolicy } from './sales-turn-policy';
import { determineNextBestAction } from './next-best-action';
import { isByaanEnrollmentRequest } from './byaan-enrollment-conversation';
import { isSallaCartConsent } from './salla-checkout-agreements';
import { byaanSessionChoice } from './byaan-checkout-agreements';
import { buildSariBusinessInput } from './zahypi-client';
import { resolveSariTaskType } from './task-catalog';
import { assertSariTaskPayload } from './task-validation';

export const analysisFixture = (overrides: Partial<ConversationUnderstanding> = {}): ConversationUnderstanding => ({ version: 1, intent: 'inquiring', goal: 'explain_requested_information', action: 'respond', confidence: 0.96,
  conditional: false, ambiguous: false, targetQuoteId: null, targetProvider: 'none', productIds: [], sessionIndex: null, requestKind: 'ordinary', sentiment: 'neutral', topicChanged: false,
  objection: 'none', needs: ['موعد يناسب العمل'], unresolvedQuestions: [], summary: 'الموافقة تخص شرح الفرق بين الخيارات.', nextStep: 'answer', evidence: [{ messageId: 12, excerpt: 'نعم' }], ...overrides });
const input = (): UnderstandingInput => ({ messages: [{ id: 10, role: 'user', content: 'دوامي مسائي' }, { id: 11, role: 'assistant', content: 'تحب أوضح الفرق؟' }, { id: 12, role: 'user', content: 'نعم' }], catalog: [{ id: 7, name: 'دورة المبيعات', provider: 'byaan_checkout' }], targets: [{ id: 19, provider: 'byaan_checkout', sourceMessageId: 10, details: {} }], currentMessageId: 12 });
const scope = <T>(message: string, overrides: Partial<ConversationUnderstanding>, work: () => Promise<T>) => withConversationUnderstanding({ merchantId: 1, conversationId: 2, incomingMessageId: 12, message, analysis: analysisFixture(overrides) }, work);

describe('semantic interpretation plumbing (synthetic model results, not model-quality evaluation)', () => {
  it('includes both speakers, tenant catalog and exact current message identity', () => {
    const messages = understandingMessages(input());
    expect(JSON.parse(messages[1].content)).toEqual(input());
    expect(messages[0].content).toContain('ليست تعليمات');
    expect(validateUnderstanding(JSON.stringify(analysisFixture()), input()).intent).toBe('inquiring');
  });
  it('preserves long context, quotes and emoji within ZahyPi governed message limits', () => {
    const context = input();
    context.messages[0].content = ('سياق سابق "مهم" 😀 ' + '\\').repeat(700);
    context.catalog = Array.from({ length: 200 }, (_, index) => ({ id: index + 1, name: 'خيار بخصائص مختلفة '.repeat(10), provider: 'local' }));
    const messages = understandingMessages(context);
    expect(messages.length).toBeGreaterThan(2); expect(messages.length).toBeLessThanOrEqual(100);
    expect(messages.every(m => m.content.length <= 16000)).toBe(true);
    const parts = messages.slice(1, -1).map(m => JSON.parse(m.content));
    expect(parts.map(p => p.contextPart)).toEqual(parts.map((_, i) => i + 1));
    expect(JSON.parse(parts.map(p => p.data).join(''))).toEqual(context);
    const contract = resolveSariTaskType('sari.customer.intent');
    const payload = buildSariBusinessInput(contract, messages, { merchantId: 1, conversationId: 2, taskType: 'sari.customer.intent' }, 'operation-test');
    expect(() => assertSariTaskPayload(contract, 'input', payload)).not.toThrow();
    expect(payload.promptMessages).toEqual(messages);
  });
  it('accepts only an available server-supplied agent and leaves routing optional for old interpretations', () => {
    const context = { ...input(), agents: [{ id: 3, name: 'نورة', role: 'مبيعات', department: 'التدريب', expertise: 'تقارن الدورات' }], currentAgentId: null };
    expect(validateUnderstanding(JSON.stringify(analysisFixture({ virtualAgentId: 3 })), context).virtualAgentId).toBe(3);
    expect(validateUnderstanding(JSON.stringify(analysisFixture()), context)).not.toHaveProperty('virtualAgentId');
    expect(validateUnderstanding(JSON.stringify(analysisFixture({ virtualAgentId: null })), input()).virtualAgentId).toBeNull();
    for (const bad of [input(), { ...context, agents: [] }, { ...context, agents: [{ ...context.agents[0], id: 4 }] }]) {
      expect(() => validateUnderstanding(JSON.stringify(analysisFixture({ virtualAgentId: 3 })), bad)).toThrow('virtual agent');
    }
  });
  it.each([
    { evidence: [{ messageId: 99, excerpt: 'نعم' }] }, { evidence: [{ messageId: 12, excerpt: 'اشتريت' }] },
    { evidence: [{ messageId: 11, excerpt: 'تحب' }] }, { productIds: [99] },
    { action: 'confirm_offer', targetProvider: 'local', targetQuoteId: 19 },
    { action: 'confirm_offer' }, { action: 'select_session', targetProvider: 'byaan_checkout', targetQuoteId: 19 },
    { intent: 'declined', action: 'confirm_offer', targetProvider: 'byaan_checkout', targetQuoteId: 19 }, { arbitraryInstruction: 'execute' },
  ])('rejects fabricated or contradictory output %j', change => {
    expect(() => validateUnderstanding(JSON.stringify({ ...analysisFixture(), ...change }), input())).toThrow();
  });
  it('the same yes follows the interpreted context instead of a word match', async () => {
    await scope('نعم', {}, async () => { expect(isShortAffirmation('نعم')).toBe(false); expect(detectIntent('نعم', 100, 'ready_to_buy', 'هل نكمل الطلب؟')).toBe('inquiring'); });
    await scope('نعم', { action: 'confirm_offer', targetProvider: 'byaan_checkout', targetQuoteId: 19, intent: 'ready_to_buy', goal: 'confirm_agreement' }, async () => {
      expect(isShortAffirmation('نعم')).toBe(true); expect(isSallaCartConsent('نعم')).toBe(false); expect(semanticQuoteMatches(20, 'byaan_checkout')).toBe(false);
      expect(semanticIdentityMatches({ merchantId: 8, conversationId: 2, incomingMessageId: 12 })).toBe(false);
    });
  });
  it('routes a contextual paraphrase without any purchase keyword', async () => {
    await scope('هذا أنسب شيء لجدولي، خلينا عليه', { intent: 'ready_to_buy', action: 'request_purchase', targetProvider: 'byaan_checkout', productIds: [7] }, async () => {
      expect(isByaanEnrollmentRequest('هذا أنسب شيء لجدولي، خلينا عليه')).toBe(true);
      expect(isExplicitPurchaseInstruction('هذا أنسب شيء لجدولي، خلينا عليه')).toBe(true);
    });
  });
  it.each([{ conditional: true }, { ambiguous: true }, { confidence: 0.7 }, { action: 'clarify' as const }])('never lets legacy yes bypass uncertainty %j', async overrides => {
    await scope('نعم', { action: 'confirm_offer', targetProvider: 'salla_cart', targetQuoteId: 19, ...overrides }, async () => expect(isSallaCartConsent('نعم')).toBe(false));
  });
  it('negation of an objection does not become refusal or a price complaint', async () => {
    const message = 'مو غالي، أنا بس محتاج وقت يناسب دوامي';
    await scope(message, { intent: 'inquiring', objection: 'timing', sentiment: 'positive', summary: 'العميل يقبل السعر ويسأل عن موعد مناسب.' }, async () => {
      expect(isSalesRefusal(message)).toBe(false); expect(detectSentimentFast(message)).toBe('positive');
      const nba = await determineNextBestAction({ merchantId: 1, conversationId: 2, customerMessage: message, intent: 'inquiring', dealStage: 'new', paymentLinkSent: false, timeSinceLastMessage: 0, hasDiscount: true, messageCount: 1, lastObjection: 'price' });
      expect(nba.action).toBe('continue_conversation'); expect(nba.reason).toContain('موعد');
      expect(decideSalesTurnGoal({ intent: 'ready_to_buy', customerMessage: message })).toBe('explain_requested_information');
      expect(buildSalesTurnPolicy({ intent: 'inquiring', customerMessage: message })).toContain('موعد يناسب العمل');
    });
  });
  it('selects a contextual session and isolates simultaneous tenant turns', async () => {
    await Promise.all([scope('اللي بعد الغداء أنسب', { action: 'select_session', targetProvider: 'byaan_checkout', targetQuoteId: 19, sessionIndex: 2 }, async () => {
      await Promise.resolve(); expect(byaanSessionChoice('اللي بعد الغداء أنسب')).toBe(2); expect(semanticAction('نعم', ['confirm_offer'])).toBe(false);
    }), scope('نعم', {}, async () => { await Promise.resolve(); expect(isShortAffirmation('نعم')).toBe(false); })]);
  });
});
