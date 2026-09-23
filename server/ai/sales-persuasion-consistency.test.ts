import { beforeEach, describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ llm: vi.fn() }));
vi.mock('./openai', () => ({ callGPT4: calls.llm }));
import { selectPersuasion } from './sales-arsenal';
import { buildClosingDirective } from './closing-engine';
import { buildMissionBlock, missionToPrompt } from './strategist';
import { buildSalesTurnPolicy, decideSalesTurnGoal } from './sales-turn-policy';
import { determineNextBestAction } from './next-best-action';
import { selectAction, executeAction } from './action-selector';
import type { CustomerIntent } from './session-context';
import { detectIntent } from './session-context';
const arsenal: any = {
  activeDiscounts: [
    {
      id: 1,
      merchantId: 7,
      code: 'SAVE',
      type: 'percentage',
      value: 10,
      minOrderAmount: 500,
      checkedAt: new Date().toISOString(),
    },
  ],
  abandonedCart: { items: ['Item'], total: 100 },
  loyaltyPoints: 200,
  loyaltyTier: null,
  availableRewards: [],
  bestSellers: [
    { name: 'A', price: 100 },
    { name: 'B', price: 200 },
  ],
  crossSellSuggestions: [{ productName: 'C', reason: 'same category' }],
  upcomingBookings: [],
  availableServices: [],
};
const nba = (message: string, intent: CustomerIntent, overrides = {}) =>
  determineNextBestAction({
    merchantId: 7,
    conversationId: 8,
    dealStage: 'ready',
    lastObjection: 'price',
    customerMessage: message,
    intent,
    paymentLinkSent: false,
    timeSinceLastMessage: 200,
    hasDiscount: true,
    messageCount: 30,
    ...overrides,
  });
const close = (message: string, intent: CustomerIntent, previousMessages: any[] = []) =>
  buildClosingDirective({
    message,
    intent,
    previousMessages,
    session: { messageCount: 30, customerIntent: 'objecting', persuasionUsed: ['proactive_discount'] } as any,
    customerProfile: null,
    hasAbandonedCart: true,
    isGoldenHour: true,
  });
beforeEach(() => vi.clearAllMocks());

describe('a current customer decision dominates sales tactics', () => {
  it.each(['كيف أطلب؟', 'طريقة الطلب', 'كيف أدفع؟', 'How do I order?', 'Can I pay online?'])(
    'answers process question %s without treating it as consent',
    async (message) => {
      expect(detectIntent(message, 20, 'ready')).toBe('inquiring');
      expect(decideSalesTurnGoal({ intent: 'ready_to_buy', customerMessage: message })).toBe(
        'explain_requested_information',
      );
      expect(close(message, 'ready_to_buy').mode).toBe('none');
      expect((await nba(message, 'ready_to_buy')).action).toBe('continue_conversation');
    },
  );
  it.each(['لا أريد الشراء', 'غيرت رأيي', 'no thanks'])(
    'suppresses every incentive after %s despite a ready profile',
    async (customerMessage) => {
      expect(
        selectPersuasion({ customerTier: 'vip' } as any, arsenal, 'ready_to_buy', 'angry', [], {
          customerMessage,
        }).strategy,
      ).toBe('none');
      expect(close(customerMessage, 'ready_to_buy').mode).toBe('none');
      expect((await nba(customerMessage, 'ready_to_buy')).action).toBe('continue_conversation');
    },
  );
  it.each(['نعم', 'تمام', 'yes'])(
    'keeps %s to information away from checkout, upsell and cart recovery',
    async (customerMessage) => {
      const lastAssistantMessage = 'تبي أرسل لك التفاصيل؟';
      expect(
        selectPersuasion({} as any, arsenal, 'ready_to_buy', 'neutral', [], {
          customerMessage,
          lastAssistantMessage,
        }).strategy,
      ).toBe('none');
      expect(
        close(customerMessage, 'ready_to_buy', [{ role: 'assistant', content: lastAssistantMessage }]).mode,
      ).toBe('none');
      expect(
        buildMissionBlock({
          message: customerMessage,
          intent: 'ready_to_buy',
          customerProfile: null,
          lastAssistantMessage,
          closingHint: { mode: 'direct_close', confidence: 95, prompt: 'stale close' },
        }),
      ).toMatchObject({ customerState: 'inquiring', closingHint: undefined });
      expect((await nba(customerMessage, 'ready_to_buy', { lastAssistantMessage })).action).toBe(
        'continue_conversation',
      );
    },
  );
  it.each(['بكم السعر؟', 'how much?', 'والثاني بكم؟'])(
    'does not turn repeated price inquiry %s into closing or scarcity',
    async (message) => {
      expect(close(message, 'inquiring', [{ role: 'user', content: 'بكم؟' }]).mode).toBe('none');
      const result = await nba(message, 'inquiring', { dealStage: 'qualified', timeSinceLastMessage: 0 });
      expect(result.action).not.toMatch(/urgency|payment|discount|followup/);
    },
  );
  it.each(['hesitating', 'objecting', 'comparing'] as const)(
    'resolves the %s reason before any stale cart/discount opportunity',
    async (intent) => {
      const message = 'غالي ولا أعرف هل يناسب احتياجي';
      const plan = selectPersuasion({} as any, arsenal, intent, 'neutral', [], { customerMessage: message });
      expect(plan.strategy).toBe('value_comparison');
      expect(plan.sweetener).toBeUndefined();
      expect((await nba(message, intent)).action).toBe('offer_alternative');
      expect(decideSalesTurnGoal({ intent, customerMessage: message })).not.toBe('answer_then_qualify');
    },
  );
  it('handles frustration without gifting a coupon or claiming compensation', () => {
    const plan = selectPersuasion({} as any, arsenal, 'objecting', 'angry', [], {
      customerMessage: 'الشرح سيء والسعر غالي',
    });
    expect(plan.strategy).toBe('empathy_resolve');
    expect(plan.prompt).not.toContain('SAVE');
    expect(plan.sweetener).toBeUndefined();
  });
  it('answers an actual discount request with the explicit minimum and no invented exclusivity', async () => {
    const message = 'هل يوجد خصم؟';
    const plan = selectPersuasion({} as any, arsenal, 'inquiring', 'neutral', [], {
      customerMessage: message,
    });
    expect(plan.sweetener).toBe('SAVE');
    expect(plan.prompt).toContain('500');
    expect(plan.prompt).toContain('minOrderAmount');
    expect((await nba(message, 'inquiring')).action).toBe('offer_discount');
  });
  it('does not reinterpret completed agreement as an upsell opportunity', () => {
    expect(
      selectPersuasion({} as any, arsenal, 'ready_to_buy', 'neutral', [], { customerMessage: 'كمل الطلب' })
        .strategy,
    ).toBe('none');
  });
  it.each(['premium_consultative', 'fast_closer', 'balanced'] as const)(
    'keeps %s persona subordinate to direct answers',
    (salesPersona) => {
      const mission = missionToPrompt(
        buildMissionBlock({ message: 'كم السعر؟', intent: 'objecting', customerProfile: null, salesPersona }),
      );
      expect(mission).not.toContain('لا تذكر السعر كأول معلومة');
      expect(mission).toContain('أجب عن السعر المطلوب أولاً');
      expect(buildSalesTurnPolicy({ intent: 'objecting', customerMessage: 'غالي' })).toContain(
        '[understand_objection]',
      );
    },
  );
  it('cannot use model output alone as permission to issue an incentive', async () => {
    calls.llm.mockResolvedValue('{"action":"offer_discount","reason":"special compensation"}');
    expect(
      await selectAction({
        merchantId: 7,
        customerMessage: 'غالي',
        botResponse: 'نوضح القيمة',
        intent: 'objecting',
        profile: null,
      }),
    ).toEqual({ type: 'text_only' });
  });
  it.each([undefined, 'غالي', 'بدون خصم', 'لا أريد الشراء حتى لو فيه خصم'])(
    'blocks a forged supplementary discount without an allowed request: %s',
    async (customerMessage) => {
      const send = vi.fn();
      await executeAction({
        merchantId: 7,
        conversationId: 8,
        customerPhone: '966500000009',
        customerMessage,
        sendMessage: send,
        action: { type: 'offer_discount', reason: 'model' },
      });
      expect(send).not.toHaveBeenCalled();
    },
  );
  it('does not let an old price objection override the current trust question', async () => {
    expect((await nba('هل الجهة معتمدة وموثوقة؟', 'inquiring')).action).not.toBe('offer_discount');
  });
});
