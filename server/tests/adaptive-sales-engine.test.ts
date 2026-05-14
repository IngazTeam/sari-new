/**
 * Adaptive Sales Engine — Comprehensive Tests
 * Tests all 5 phases: Session Cache, Customer Intelligence, Sales Arsenal,
 * Cultural Engine, and AI Directives.
 */

import { describe, it, expect } from 'vitest';
import {
  getSession, createSession, updateSession, destroySession,
  detectIntent, detectTopicChange,
} from '../ai/session-context';
import { detectDialect, extractChildName, buildInitialCulturalProfile, buildCulturalPrompt } from '../ai/cultural-engine';
import { selectPersuasion, buildCrossSellSuggestions } from '../ai/sales-arsenal';
import { classifyTier, buildProfileContext } from '../db/customer-intelligence';

// ═══════════════════════════════════════════════════════════════
// Phase 1: Session Context Cache
// ═══════════════════════════════════════════════════════════════

describe('Session Context Cache', () => {
  it('should create session and retrieve it', () => {
    const session = createSession({
      merchantId: 1, conversationId: 999,
      ragFacts: 'test facts', ragBehaviors: 'test behaviors',
      relevantProducts: [{ name: 'Product A' }],
      contextPrompt: 'context',
      initialSentiment: 'neutral',
      initialIntent: 'browsing',
    });
    expect(session.merchantId).toBe(1);
    expect(session.messageCount).toBe(1);

    const retrieved = getSession(1, 999);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.ragFacts).toBe('test facts');

    // Cleanup
    destroySession(1, 999);
  });

  it('should return null for non-existent session', () => {
    expect(getSession(999, 999)).toBeNull();
  });

  it('should update session with new sentiment and intent', () => {
    createSession({
      merchantId: 2, conversationId: 100,
      ragFacts: '', ragBehaviors: '',
      relevantProducts: [], contextPrompt: '',
      initialSentiment: 'neutral', initialIntent: 'browsing',
    });

    updateSession(2, 100, { sentiment: 'happy', intent: 'ready_to_buy', topic: 'phones' });
    const session = getSession(2, 100);
    expect(session!.sentimentTrajectory).toContain('happy');
    expect(session!.customerIntent).toBe('ready_to_buy');
    expect(session!.topicsDiscussed).toContain('phones');
    expect(session!.messageCount).toBe(2);

    destroySession(2, 100);
  });

  it('should destroy session', () => {
    createSession({
      merchantId: 3, conversationId: 200,
      ragFacts: '', ragBehaviors: '',
      relevantProducts: [], contextPrompt: '',
      initialSentiment: 'neutral', initialIntent: 'browsing',
    });
    destroySession(3, 200);
    expect(getSession(3, 200)).toBeNull();
  });

  it('should not duplicate topics', () => {
    createSession({
      merchantId: 4, conversationId: 300,
      ragFacts: '', ragBehaviors: '',
      relevantProducts: [], contextPrompt: '',
      initialSentiment: 'neutral', initialIntent: 'browsing',
    });
    updateSession(4, 300, { topic: 'phones' });
    updateSession(4, 300, { topic: 'phones' }); // duplicate
    updateSession(4, 300, { topic: 'laptops' });
    const session = getSession(4, 300);
    expect(session!.topicsDiscussed).toEqual(['phones', 'laptops']);
    destroySession(4, 300);
  });
});

// ═══════════════════════════════════════════════════════════════
// Intent Detection (keyword-based — no API)
// ═══════════════════════════════════════════════════════════════

describe('Intent Detection', () => {
  it('should detect ready_to_buy intent', () => {
    expect(detectIntent('ابغى اطلب')).toBe('ready_to_buy');
    expect(detectIntent('كيف اطلب')).toBe('ready_to_buy');
    expect(detectIntent('أبي أشتري')).toBe('ready_to_buy');
    expect(detectIntent('i want to buy')).toBe('ready_to_buy');
  });

  it('should detect objecting intent (price)', () => {
    expect(detectIntent('غالي مرة')).toBe('objecting');
    expect(detectIntent('عندكم خصم؟')).toBe('objecting');
    expect(detectIntent('ليش غالي')).toBe('objecting');
    expect(detectIntent('too expensive')).toBe('objecting');
  });

  it('should detect comparing intent', () => {
    expect(detectIntent('أيهم أفضل')).toBe('comparing');
    expect(detectIntent('وش الفرق بين هذا وهذا')).toBe('comparing');
    expect(detectIntent('which is better')).toBe('comparing');
  });

  it('should detect post_purchase intent', () => {
    expect(detectIntent('وين وصل طلبي')).toBe('post_purchase');
    expect(detectIntent('ابغى استرجاع')).toBe('post_purchase');
    expect(detectIntent('tracking my order')).toBe('post_purchase');
  });

  it('should detect inquiring intent', () => {
    expect(detectIntent('كم سعر الجوال')).toBe('inquiring');
    expect(detectIntent('عندكم لابتوب')).toBe('inquiring');
    expect(detectIntent('how much is this')).toBe('inquiring');
  });

  it('should detect browsing intent', () => {
    expect(detectIntent('السلام عليكم')).toBe('browsing');
    expect(detectIntent('مرحبا')).toBe('browsing');
    expect(detectIntent('hello')).toBe('browsing');
  });

  it('should return unknown for ambiguous messages', () => {
    expect(detectIntent('ممتاز')).toBe('unknown');
    expect(detectIntent('أوكي')).toBe('unknown');
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 4: Cultural Engine
// ═══════════════════════════════════════════════════════════════

describe('Cultural Engine — Dialect Detection', () => {
  it('should detect Saudi dialect', () => {
    const { dialect } = detectDialect('ابغى استفسر عن السعر وش عندكم');
    expect(dialect).toBe('saudi');
  });

  it('should detect Egyptian dialect', () => {
    const { dialect } = detectDialect('عايز اعرف السعر كام ده');
    expect(dialect).toBe('egyptian');
  });

  it('should detect Gulf dialect', () => {
    const { dialect } = detectDialect('شلونك هلا شنو عندكم');
    expect(dialect).toBe('gulf');
  });

  it('should detect Shami dialect', () => {
    const { dialect } = detectDialect('بدي اعرف السعر كيفك');
    expect(dialect).toBe('shami');
  });

  it('should detect English', () => {
    const { dialect } = detectDialect('I want to know the price please');
    expect(dialect).toBe('english');
  });

  it('should default to saudi for ambiguous messages', () => {
    const { dialect } = detectDialect('مرحبا');
    expect(dialect).toBe('saudi'); // Default market
  });
});

describe('Cultural Engine — Child Name Extraction', () => {
  it('should extract child name from "ولدي عبدالله"', () => {
    expect(extractChildName('ولدي عبدالله معاي')).toBe('عبدالله');
  });

  it('should extract child name from "ابني محمد"', () => {
    expect(extractChildName('ابني محمد يبي جوال')).toBe('محمد');
  });

  it('should extract from "ولدي اسمه خالد"', () => {
    expect(extractChildName('ولدي اسمه خالد')).toBe('خالد');
  });

  it('should extract from "بنتي سارة"', () => {
    expect(extractChildName('بنتي سارة تبي تاب')).toBe('سارة');
  });

  it('should return null when no child mentioned', () => {
    expect(extractChildName('ابغى استفسر عن المنتج')).toBeNull();
  });

  it('should NOT extract customer own name (critical cultural rule)', () => {
    // "اسمي محمد" should NOT trigger child name extraction
    expect(extractChildName('اسمي محمد')).toBeNull();
  });
});

describe('Cultural Engine — Critical Rule: أبو فلان', () => {
  it('should NOT use أبو + customer own name', () => {
    // Customer name is محمد, no child mentioned
    const profile = buildInitialCulturalProfile('ابغى استفسر', 'محمد', null);
    // Should be "محمد", NOT "أبو محمد"
    expect(profile.preferredAddress).toBe('محمد');
    expect(profile.preferredAddress).not.toContain('أبو محمد');
  });

  it('should use أبو + child name when child is mentioned', () => {
    const profile = buildInitialCulturalProfile('ابغى استفسر', 'محمد', 'عبدالله');
    expect(profile.preferredAddress).toBe('أبو عبدالله');
  });

  it('should include cultural rule warning in prompt', () => {
    const profile = buildInitialCulturalProfile('ابغى استفسر', 'محمد', null);
    const prompt = buildCulturalPrompt(profile);
    expect(prompt).toContain('لا تنادي العميل "أبو + اسمه"');
    expect(prompt).toContain('خطأ ثقافي فادح');
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 3: Sales Arsenal — Persuasion Strategy
// ═══════════════════════════════════════════════════════════════

describe('Sales Arsenal — Persuasion Selection', () => {
  const baseProfile = {
    customerTier: 'new' as const,
    preferences: {},
    painPoints: [],
    purchaseHistory: [],
    totalSpent: 0,
  };

  const baseArsenal = {
    activeDiscounts: [],
    loyaltyPoints: 0,
    loyaltyTier: null,
    availableRewards: [],
    abandonedCart: null,
    bestSellers: [{ name: 'Product A', price: 100 }],
    totalProducts: 10,
    crossSellSuggestions: [],
    upcomingBookings: [],
    availableServices: [],
  };

  it('should prioritize cart recovery for abandoned cart', () => {
    const arsenal = { ...baseArsenal, abandonedCart: { items: ['Phone'], total: 2000 } };
    const plan = selectPersuasion(baseProfile, arsenal, 'browsing', 'neutral', []);
    expect(plan.strategy).toBe('cart_recovery');
  });

  it('should use empathy for angry customer', () => {
    const plan = selectPersuasion(baseProfile, baseArsenal, 'browsing', 'angry', []);
    expect(plan.strategy).toBe('empathy_resolve');
  });

  it('should use loyalty for VIP with points', () => {
    const vipProfile = { ...baseProfile, customerTier: 'vip' as const };
    const arsenal = { ...baseArsenal, loyaltyPoints: 200, loyaltyTier: { name: 'ذهبي', icon: '🥇', discount: 15 } };
    const plan = selectPersuasion(vipProfile, arsenal, 'browsing', 'neutral', []);
    expect(plan.strategy).toBe('loyalty_reward');
    expect(plan.prompt).toContain('ذهبي');
  });

  it('should use loyalty for loyal tier too (v6)', () => {
    const loyalProfile = { ...baseProfile, customerTier: 'loyal' as const };
    const arsenal = { ...baseArsenal, loyaltyPoints: 100 };
    const plan = selectPersuasion(loyalProfile, arsenal, 'browsing', 'neutral', []);
    expect(plan.strategy).toBe('loyalty_reward');
  });

  it('should use cross_sell when suggestions available (v6)', () => {
    const arsenal = {
      ...baseArsenal,
      crossSellSuggestions: [{ productName: 'كفر iPhone', reason: 'من نفس فئة "iPhone 15"' }],
    };
    const plan = selectPersuasion(baseProfile, arsenal, 'browsing', 'neutral', []);
    expect(plan.strategy).toBe('cross_sell');
    expect(plan.prompt).toContain('كفر iPhone');
  });

  it('should use booking_followup when bookings exist (v6)', () => {
    const arsenal = {
      ...baseArsenal,
      upcomingBookings: [{ serviceName: 'قص شعر', date: '2026-05-20' }],
      availableServices: [{ name: 'صبغة', price: 150 }],
    };
    const plan = selectPersuasion(baseProfile, arsenal, 'browsing', 'neutral', []);
    expect(plan.strategy).toBe('booking_followup');
    expect(plan.prompt).toContain('قص شعر');
  });

  it('should use proactive discount for objecting customer', () => {
    const arsenal = { ...baseArsenal, activeDiscounts: [{ code: 'SAVE10', type: 'percentage', value: 10 }] };
    const plan = selectPersuasion(baseProfile, arsenal, 'objecting', 'neutral', []);
    expect(plan.strategy).toBe('proactive_discount');
    expect(plan.sweetener).toBe('SAVE10');
  });

  it('should use social proof for comparing customer', () => {
    const plan = selectPersuasion(baseProfile, baseArsenal, 'comparing', 'neutral', []);
    expect(plan.strategy).toBe('social_proof');
  });

  it('should use smart upsell for ready-to-buy', () => {
    const arsenal = { ...baseArsenal, bestSellers: [{ name: 'A', price: 100 }, { name: 'B', price: 50 }] };
    const plan = selectPersuasion(baseProfile, arsenal, 'ready_to_buy', 'neutral', []);
    expect(plan.strategy).toBe('smart_upsell');
  });

  it('should not repeat used tactics', () => {
    const arsenal = { ...baseArsenal, abandonedCart: { items: ['Phone'], total: 2000 } };
    const plan = selectPersuasion(baseProfile, arsenal, 'browsing', 'neutral', ['cart_recovery']);
    // Should skip cart_recovery since already used
    expect(plan.strategy).not.toBe('cart_recovery');
  });

  it('should return none when no tactics available', () => {
    const plan = selectPersuasion(baseProfile, baseArsenal, 'unknown', 'neutral',
      ['cart_recovery', 'empathy_resolve', 'loyalty_reward', 'proactive_discount', 'social_proof', 'smart_upsell', 'cross_sell', 'booking_followup']);
    expect(plan.strategy).toBe('none');
  });
});

// ═══════════════════════════════════════════════════════════════
// v6: Cross-sell Suggestions Builder
// ═══════════════════════════════════════════════════════════════

describe('Cross-sell Suggestions Builder (v6)', () => {
  const mockProducts = [
    { name: 'iPhone 15', category: 'phones', isActive: true, price: 4000 },
    { name: 'Galaxy S24', category: 'phones', isActive: true, price: 3500 },
    { name: 'AirPods', category: 'audio', isActive: true, price: 800 },
    { name: 'كفر iPhone', category: 'accessories', isActive: true, price: 50 },
    { name: 'شاحن سريع', category: 'accessories', isActive: true, price: 100 },
  ];

  it('should suggest same-category products', () => {
    const suggestions = buildCrossSellSuggestions(['iPhone 15'], mockProducts);
    expect(suggestions.length).toBeGreaterThan(0);
    // Should suggest Galaxy S24 (same 'phones' category)
    const phonesSuggestion = suggestions.find(s => s.productName === 'Galaxy S24');
    expect(phonesSuggestion).toBeDefined();
    expect(phonesSuggestion!.reason).toContain('iPhone 15');
  });

  it('should not suggest already-purchased products', () => {
    const suggestions = buildCrossSellSuggestions(['iPhone 15', 'Galaxy S24'], mockProducts);
    const names = suggestions.map(s => s.productName);
    expect(names).not.toContain('iPhone 15');
    expect(names).not.toContain('Galaxy S24');
  });

  it('should return empty for empty history', () => {
    expect(buildCrossSellSuggestions([], mockProducts)).toEqual([]);
  });

  it('should cap at 3 suggestions', () => {
    const suggestions = buildCrossSellSuggestions(['AirPods'], mockProducts);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 2: Customer Intelligence — Tier Classification
// ═══════════════════════════════════════════════════════════════

describe('Customer Intelligence — Tier Classification', () => {
  it('should classify new customer', () => {
    expect(classifyTier(0, 0)).toBe('new');
  });

  it('should classify returning customer (1+ purchases)', () => {
    expect(classifyTier(1, 200)).toBe('returning');
  });

  it('should classify loyal customer (3+ purchases or 1000+ spent)', () => {
    expect(classifyTier(3, 500)).toBe('loyal');
    expect(classifyTier(1, 1000)).toBe('loyal');
  });

  it('should classify VIP (10+ purchases or 5000+ spent)', () => {
    expect(classifyTier(10, 1000)).toBe('vip');
    expect(classifyTier(2, 5000)).toBe('vip');
  });

  it('should build profile context string for GPT', () => {
    const profile = {
      displayName: 'محمد',
      nickname: 'أبو عبدالله',
      customerTier: 'vip',
      totalSpent: 5000,
      preferences: { priceConscious: true },
      painPoints: ['اشتكى من التأخير'],
      lastObjection: 'delivery',
      purchaseHistory: ['iPhone 15', 'AirPods'],
      childName: 'عبدالله',
    };
    const context = buildProfileContext(profile);
    expect(context).toContain('أبو عبدالله');
    expect(context).toContain('VIP');
    expect(context).toContain('5000');
    expect(context).toContain('يهتم بالسعر');
    expect(context).toContain('التأخير');
    expect(context).toContain('iPhone 15');
  });
});

// ═══════════════════════════════════════════════════════════════
// Topic Change Detection
// ═══════════════════════════════════════════════════════════════

describe('Topic Change Detection', () => {
  it('should not detect topic change on early messages', () => {
    const session = createSession({
      merchantId: 10, conversationId: 500,
      ragFacts: '', ragBehaviors: '',
      relevantProducts: [], contextPrompt: '',
      initialSentiment: 'neutral', initialIntent: 'browsing',
    });
    // messageCount = 1 (< 3), should not rebuild
    expect(detectTopicChange(session, 'موضوع ثاني')).toBe(false);
    destroySession(10, 500);
  });

  it('should detect explicit topic change signals', () => {
    const session = createSession({
      merchantId: 11, conversationId: 501,
      ragFacts: '', ragBehaviors: '',
      relevantProducts: [], contextPrompt: '',
      initialSentiment: 'neutral', initialIntent: 'browsing',
    });
    session.messageCount = 5; // Enough messages
    session.topicsDiscussed = ['phones'];
    expect(detectTopicChange(session, 'شي ثاني ابغى اسأل عن')).toBe(true);
    destroySession(11, 501);
  });
});
