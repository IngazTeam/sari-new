/**
 * Session Context Cache — Phase 1 of Adaptive Sales Engine
 * 
 * Eliminates redundant RAG/embedding/sentiment calls for messages 2-20.
 * First message: full pipeline (RAG + embedding + sentiment + DB)
 * Subsequent messages: use cached session (0ms overhead)
 * 
 * TTL: 30 minutes of inactivity
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ConversationSession {
  merchantId: number;
  conversationId: number;
  // === Built once on first message ===
  ragFacts: string;
  ragBehaviors: string;
  relevantProducts: any[];
  contextPrompt: string;          // Pre-built context (facts + products + FAQs + policies)
  // === Evolves with each message ===
  customerIntent: CustomerIntent;
  sentimentTrajectory: string[];
  topicsDiscussed: string[];
  persuasionUsed: string[];       // Track used tactics to avoid repetition
  messageCount: number;
  // === Metadata ===
  createdAt: number;
  lastActivityAt: number;
}

export type CustomerIntent = 
  | 'browsing'       // Just looking around
  | 'inquiring'      // Asking about specific product/service
  | 'comparing'      // Comparing options/prices
  | 'hesitating'     // Undecided — "بفكر", "بشوف", "مو متأكد"
  | 'objecting'      // Price/quality/timing objection
  | 'ready_to_buy'   // Wants to order
  | 'returning'      // Returning customer starting new conversation
  | 'post_purchase'  // After buying — support/feedback
  | 'unknown';

// ═══════════════════════════════════════════════════════════════
// Hesitation Confidence Score — "بفكر" ≠ always objection
// ═══════════════════════════════════════════════════════════════

export type HesitationIntensity = 'low' | 'medium' | 'high';
export type HesitationType = 'price' | 'trust' | 'need' | 'timing' | 'busy';

export interface HesitationAnalysis {
  type: HesitationType;
  intensity: HesitationIntensity;
  recommendedAction: 'push_now' | 'soft_reminder' | 'wait_and_followup';
}

/**
 * Analyze hesitation depth — not all "بفكر" signals are equal.
 */
export function analyzeHesitation(message: string): HesitationAnalysis {
  const msg = message.toLowerCase();

  // High intensity — real objection disguised as hesitation
  const highSignals = ['غالي', 'كثير عليه', 'مو معقول', 'ما يستاهل'];
  if (highSignals.some(s => msg.includes(s))) {
    return { type: 'price', intensity: 'high', recommendedAction: 'push_now' };
  }

  // Medium — genuine indecision, needs social proof
  const mediumSignals = ['بفكر', 'أفكر', 'بشوف', 'أشوف', 'مو متأكد', 'ما أدري',
    'محتار', 'أقارن', 'let me think', 'not sure'];
  if (mediumSignals.some(s => msg.includes(s))) {
    return { type: 'need', intensity: 'medium', recommendedAction: 'push_now' };
  }

  // Trust hesitation
  const trustSignals = ['ما أعرفكم', 'مضمون', 'موثوق', 'أول مرة أسمع', 'مو نصب'];
  if (trustSignals.some(s => msg.includes(s))) {
    return { type: 'trust', intensity: 'medium', recommendedAction: 'push_now' };
  }

  // Low — likely just busy, don't push
  const lowSignals = ['أرجع لك', 'بعدين', 'مو الحين', 'الحين مشغول', 'later',
    'بكلمك', 'أرد عليك', 'بتواصل معك'];
  if (lowSignals.some(s => msg.includes(s))) {
    return { type: 'busy', intensity: 'low', recommendedAction: 'wait_and_followup' };
  }

  // Default medium
  return { type: 'timing', intensity: 'medium', recommendedAction: 'soft_reminder' };
}

// ═══════════════════════════════════════════════════════════════
// In-Memory Cache (Map)
// ═══════════════════════════════════════════════════════════════

const SESSION_TTL_MS = 60 * 60 * 1000; // 60 minutes — WhatsApp customers may take breaks
const MAX_SESSIONS = 500;               // Memory cap

const sessions = new Map<string, ConversationSession>();

function sessionKey(merchantId: number, conversationId: number): string {
  return `${merchantId}:${conversationId}`;
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Get existing session or null if not found / expired.
 */
export function getSession(merchantId: number, conversationId: number): ConversationSession | null {
  const key = sessionKey(merchantId, conversationId);
  const session = sessions.get(key);
  
  if (!session) return null;
  
  // Check TTL
  if (Date.now() - session.lastActivityAt > SESSION_TTL_MS) {
    sessions.delete(key);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Session] Expired: ${key} (inactive ${Math.round((Date.now() - session.lastActivityAt) / 60000)}min)`);
    }
    return null;
  }
  
  return session;
}

/**
 * Create a new session after the first message pipeline completes.
 */
export function createSession(data: {
  merchantId: number;
  conversationId: number;
  ragFacts: string;
  ragBehaviors: string;
  relevantProducts: any[];
  contextPrompt: string;
  initialSentiment: string;
  initialIntent: CustomerIntent;
}): ConversationSession {
  // Evict oldest sessions if we hit the cap
  if (sessions.size >= MAX_SESSIONS) {
    evictOldestSessions(50);
  }
  
  const key = sessionKey(data.merchantId, data.conversationId);
  const now = Date.now();
  
  const session: ConversationSession = {
    merchantId: data.merchantId,
    conversationId: data.conversationId,
    ragFacts: data.ragFacts,
    ragBehaviors: data.ragBehaviors,
    relevantProducts: data.relevantProducts,
    contextPrompt: data.contextPrompt,
    customerIntent: data.initialIntent,
    sentimentTrajectory: [data.initialSentiment],
    topicsDiscussed: [],
    persuasionUsed: [],
    messageCount: 1,
    createdAt: now,
    lastActivityAt: now,
  };
  
  sessions.set(key, session);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Session] Created: ${key} (total active: ${sessions.size})`);
  }
  return session;
}

/**
 * Update session after each subsequent message (lightweight — no DB/API calls).
 */
export function updateSession(
  merchantId: number,
  conversationId: number,
  updates: {
    sentiment?: string;
    intent?: CustomerIntent;
    topic?: string;
    persuasionTactic?: string;
  }
): ConversationSession | null {
  const key = sessionKey(merchantId, conversationId);
  const session = sessions.get(key);
  if (!session) return null;
  
  session.lastActivityAt = Date.now();
  session.messageCount++;
  
  if (updates.sentiment) {
    session.sentimentTrajectory.push(updates.sentiment);
    // Keep last 10 sentiments
    if (session.sentimentTrajectory.length > 10) {
      session.sentimentTrajectory = session.sentimentTrajectory.slice(-10);
    }
  }
  
  if (updates.intent) {
    session.customerIntent = updates.intent;
  }
  
  if (updates.topic && !session.topicsDiscussed.includes(updates.topic)) {
    session.topicsDiscussed.push(updates.topic);
    // SEC-02 FIX: Cap at 20 to prevent memory DoS
    if (session.topicsDiscussed.length > 20) {
      session.topicsDiscussed = session.topicsDiscussed.slice(-20);
    }
  }
  
  if (updates.persuasionTactic && !session.persuasionUsed.includes(updates.persuasionTactic)) {
    session.persuasionUsed.push(updates.persuasionTactic);
    // SEC-02 FIX: Cap at 20
    if (session.persuasionUsed.length > 20) {
      session.persuasionUsed = session.persuasionUsed.slice(-20);
    }
  }
  
  return session;
}

/**
 * Destroy a session (conversation ended or context reset needed).
 */
export function destroySession(merchantId: number, conversationId: number): void {
  const key = sessionKey(merchantId, conversationId);
  sessions.delete(key);
}

/**
 * Check if a topic change requires rebuilding the session.
 * Uses simple keyword comparison — not embedding (too expensive).
 */
export function detectTopicChange(
  session: ConversationSession,
  newMessage: string
): boolean {
  // If less than 3 messages, don't rebuild — too early to judge
  if (session.messageCount < 3) return false;
  
  // Check if new message mentions completely different product categories
  const sessionTopics = session.topicsDiscussed.join(' ').toLowerCase();
  const msgLower = newMessage.toLowerCase();
  
  // Topic change signals (Arabic + English)
  const changeSignals = [
    'موضوع ثاني', 'شيء ثاني', 'شي ثاني', 'بعدين', 'خلنا نتكلم عن',
    'سؤال ثاني', 'another question', 'something else', 'different topic',
  ];
  
  return changeSignals.some(signal => msgLower.includes(signal));
}

// ═══════════════════════════════════════════════════════════════
// Intent Detection (lightweight — keyword-based, no GPT call)
// ═══════════════════════════════════════════════════════════════

/**
 * Detect customer intent from message text.
 * Primary: keyword-based (zero cost, zero latency).
 * Secondary: profile buyingStage fallback when keywords are ambiguous.
 */
export function detectIntent(
  message: string,
  customerTotalConversations?: number,
  profileBuyingStage?: string | null,
): CustomerIntent {
  const msg = message.toLowerCase();
  
  // Ready to buy — highest priority
  const buySignals = ['ابغى اطلب', 'أبي أطلب', 'أبي أشتري', 'أبغى أشتري', 'عايز اشتري', 'بدي اشتري',
    'أريد الشراء', 'كيف اطلب', 'طريقة الطلب', 'أبي آخذ', 'i want to buy',
    'اطلب', 'أحجز', 'ابغى احجز', 'تمام أطلب', 'أكمل الطلب', 'سجلني', 'كيف أدفع'];
  if (buySignals.some(s => msg.includes(s))) return 'ready_to_buy';
  
  // Hesitating — BEFORE objecting! "بفكر" is hesitation, not objection
  const hesitationSignals = ['بفكر', 'أفكر', 'بشوف', 'أشوف', 'مو متأكد', 'ما أدري',
    'محتار', 'أرجع لك', 'بعدين', 'مو الحين', 'الحين مشغول', 'let me think',
    'not sure', 'بكلمك', 'أرد عليك', 'بتواصل', 'ما أعرفكم', 'مضمون',
    'موثوق', 'أول مرة أسمع'];
  if (hesitationSignals.some(s => msg.includes(s))) return 'hesitating';

  // Comparing — BEFORE objecting! "لقيته أرخص عند غيركم" is comparing, not just objecting
  const compareSignals = ['أيهم أفضل', 'الفرق بين', 'مقارنة', 'وش الأحسن',
    'أيش الفرق', 'which is better', 'compare', 'difference',
    'هذا ولا هذا', 'هذا أو هذا', 'بين هذا وهذا', 'عند غيركم', 'لقيته أرخص'];
  if (compareSignals.some(s => msg.includes(s))) return 'comparing';

  // Objecting — price/quality/timing complaints
  const objectionSignals = ['غالي', 'كثير', 'مرتفع', 'سعر عالي', 'أرخص', 'خصم',
    'تخفيض', 'expensive', 'cheaper', 'discount', 'مو معقول', 'كثير عليه',
    'ليش غالي', 'ما عندكم عرض', 'بعيد', 'يأخذ وقت', 'متأخر'];
  if (objectionSignals.some(s => msg.includes(s))) return 'objecting';
  
  // Post-purchase
  const postSignals = ['طلبي', 'وين وصل', 'الشحن', 'التوصيل', 'ما وصل',
    'tracking', 'my order', 'استرجاع', 'استبدال', 'ضمان'];
  if (postSignals.some(s => msg.includes(s))) return 'post_purchase';
  
  // Inquiring (specific question)
  const inquirySignals = ['كم سعر', 'كم السعر', 'عندكم', 'يوجد', 'متوفر',
    'how much', 'price', 'available', 'do you have', 'وش عندكم من',
    'أبغى أعرف', 'ابغى اعرف', 'ابغى استفسر'];
  if (inquirySignals.some(s => msg.includes(s))) return 'inquiring';
  
  // Returning customer — detected by conversation count, not keywords
  // (first message of a new conversation from a known customer)
  if (customerTotalConversations && customerTotalConversations > 1) {
    // Check if this looks like a greeting (start of new convo)
    const greetSignals = ['السلام', 'مرحبا', 'أهلاً', 'هلا', 'مساء', 'صباح',
      'hello', 'hi', 'hey'];
    if (greetSignals.some(s => msg.includes(s))) return 'returning';
  }

  // Browsing (generic — new customer greeting)
  const browseSignals = ['السلام', 'مرحبا', 'أهلاً', 'هلا', 'مساء', 'صباح',
    'hello', 'hi', 'hey', 'وش عندكم', 'ابغى اشوف'];
  if (browseSignals.some(s => msg.includes(s))) return 'browsing';
  
  // ── Profile-Informed Fallback ──
  // When keywords are ambiguous, use GPT-enriched buyingStage from profile
  if (profileBuyingStage) {
    const stageToIntent: Record<string, CustomerIntent> = {
      'ready': 'ready_to_buy',
      'purchased': 'post_purchase',
      'comparing': 'comparing',
      'returning': 'returning',
      'exploring': 'browsing',
    };
    if (stageToIntent[profileBuyingStage]) {
      return stageToIntent[profileBuyingStage];
    }
  }

  return 'unknown';
}

// ═══════════════════════════════════════════════════════════════
// Session Stats (for monitoring / debugging)
// ═══════════════════════════════════════════════════════════════

export function getSessionStats(): { active: number; totalCreated: number } {
  // Cleanup expired sessions
  const now = Date.now();
  const entries = Array.from(sessions.entries());
  for (const [key, session] of entries) {
    if (now - session.lastActivityAt > SESSION_TTL_MS) {
      sessions.delete(key);
    }
  }
  return { active: sessions.size, totalCreated: sessions.size };
}

// ═══════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════

function evictOldestSessions(count: number): void {
  const entries = Array.from(sessions.entries())
    .sort((a, b) => a[1].lastActivityAt - b[1].lastActivityAt);
  
  for (let i = 0; i < Math.min(count, entries.length); i++) {
    sessions.delete(entries[i][0]);
  }
  console.log(`[Session] Evicted ${Math.min(count, entries.length)} oldest sessions (remaining: ${sessions.size})`);
}
