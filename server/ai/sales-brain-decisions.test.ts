import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ llm: vi.fn() }));
vi.mock('./openai', () => ({ callGPT4: mocks.llm }));
vi.mock('../db', () => ({ getPool: async () => null, createOrder: vi.fn(),
  getMerchantPaymentSettings: vi.fn(), getOrdersByCustomerPhone: vi.fn(), getProductsByMerchantId: vi.fn() }));
import { detectIntent } from './session-context';
import { isSalesRefusal, isExplicitPurchaseInstruction, pendingDecisionFromQuestion } from './customer-decision';
import { determineNextBestAction } from './next-best-action';
import { selectAction } from './action-selector';
import { buildClosingDirective } from './closing-engine';
import { buildMissionBlock } from './strategist';
import { selectPersuasion } from './sales-arsenal';

beforeEach(() => {
  mocks.llm.mockReset().mockResolvedValue(JSON.stringify({ action: 'confirm_order', details: { items: ['سماعة'] } }));
});

describe('sales decisions preserve current consent', () => {
  it.each(['لا أريد الشراء الآن', 'كنت أبي أشتري لكن غيرت رأيي', 'لا تحجز لي الآن', 'مش عايز أشتري',
    'ما أبي أطلب', 'لا شكراً', 'لا', 'غير موافق', 'لا أوافق', 'مو موافق', 'not okay', 'stop messaging', "I don't want to buy", 'cancel my order'])('blocks refusal despite a ready profile: %s', async message => {
    expect(detectIntent(message, 8, 'ready')).toBe('declined');
    const next = await determineNextBestAction({ merchantId: 1, conversationId: 2, dealStage: 'ready',
      lastObjection: 'price', customerMessage: message, intent: 'ready_to_buy', paymentLinkSent: false,
      timeSinceLastMessage: 0, hasDiscount: true, messageCount: 8 });
    expect(next.action).toBe('continue_conversation');
    expect(next.promptInjection).toContain('رفض');
    expect(await selectAction({ merchantId: 1, customerMessage: message, botResponse: 'نؤكد الطلب',
      intent: 'ready_to_buy', profile: null })).toEqual({ type: 'text_only' });
    expect(mocks.llm).not.toHaveBeenCalled();
    const closing = buildClosingDirective({ message, intent: 'ready_to_buy', previousMessages: [],
      session: { messageCount: 20, customerIntent: 'objecting' } as any, customerProfile: null,
      hasAbandonedCart: true, isGoldenHour: true });
    expect(closing.mode).toBe('none');
    const mission = buildMissionBlock({ message, intent: 'ready_to_buy', customerProfile: null,
      salesPersona: 'fast_closer', closingHint: { mode: 'direct_close', confidence: 100, prompt: 'close now' } });
    expect(mission).toMatchObject({ customerState: 'declined', primaryStrategy: 'none', ctaLevel: 'none',
      nextTwoMoves: [], closingHint: undefined });
    expect(selectPersuasion({} as any, { abandonedCart: { id: 1 } } as any, 'declined', 'angry', []).strategy).toBe('none');
  });

  it.each(['أبغى أطلب سماعة', 'أريد الشراء', 'تمام كمل الطلب'])('leaves purchases to saved agreement checkout: %s', async customerMessage => {
    const action = await selectAction({ merchantId: 1, customerMessage, botResponse: 'نتحقق من تفاصيل الطلب',
      intent: detectIntent(customerMessage), profile: null });
    expect(action.type).toBe('text_only');
    expect(mocks.llm).toHaveBeenCalledTimes(1);
  });

  it('does not equate a short yes with a purchase without a pending purchase question', async () => {
    expect(detectIntent('نعم', 8, 'ready', 'تبي أرسل لك التفاصيل؟')).toBe('inquiring');
    expect(detectIntent('نعم', 8, 'ready')).toBe('unknown');
    const result = await selectAction({ merchantId: 1, customerMessage: 'نعم', botResponse: 'سأرسل التفاصيل',
      intent: 'ready_to_buy', profile: null, conversationHistory: [{ role: 'assistant', content: 'تبي أرسل لك التفاصيل؟' }] });
    expect(result.type).toBe('text_only');
    expect(mocks.llm).not.toHaveBeenCalled();
  });

  it('resolves a yes against the previous purchase question, not the freshly generated reply', async () => {
    const question = 'السماعة 230 ريال. هل تبغى أكمل الطلب؟';
    expect(pendingDecisionFromQuestion(question)).toBe('purchase');
    expect(detectIntent('نعم', 1, null, question)).toBe('ready_to_buy');
    expect((await selectAction({ merchantId: 1, customerMessage: 'نعم', botResponse: 'نتحقق من الطلب',
      intent: 'ready_to_buy', profile: null, conversationHistory: [{ role: 'assistant', content: question }] })).type).toBe('text_only');
  });

  it('keeps an existing order issue out of sales closing', async () => {
    expect(detectIntent('طلبي تأخر والسعر غالي')).toBe('post_purchase');
    const result = await selectAction({ merchantId: 1, customerMessage: 'طلبي تأخر والسعر غالي',
      botResponse: 'نتحقق من الطلب', intent: 'post_purchase', profile: null });
    expect(result.type).toBe('text_only');
    expect(mocks.llm).not.toHaveBeenCalled();
  });

  it('does not confuse uncertainty with refusal or a how-to question with consent', async () => {
    expect(isSalesRefusal("I don't know which product fits me")).toBe(false);
    expect(isSalesRefusal('لا مشكلة، أريد الشراء')).toBe(false);
    expect(isExplicitPurchaseInstruction('كيف أطلب السماعة؟')).toBe(false);
    const result = await selectAction({ merchantId: 1, customerMessage: 'كيف أطلب السماعة؟',
      botResponse: 'نشرح طريقة الطلب', intent: 'ready_to_buy', profile: null });
    expect(result.type).toBe('text_only');
  });

  it('does not infer scarcity from time or a short assent to information', () => {
    const params = { message: 'تمام', intent: 'inquiring' as const,
      previousMessages: [{ role: 'assistant', content: 'تبي أرسل لك التفاصيل؟' }],
      session: { messageCount: 3, customerIntent: 'objecting' } as any, customerProfile: null,
      hasAbandonedCart: false, isGoldenHour: true };
    expect(buildClosingDirective(params).mode).toBe('none');
    const directive = buildClosingDirective({ ...params, message: 'كم السعر؟', session: { messageCount: 10 } as any,
      previousMessages: [{ role: 'user', content: 'بكم المنتج؟' }] });
    expect(directive.mode).toBe('none');
    expect(directive.suggestedCTA).toBeUndefined();
  });
});
