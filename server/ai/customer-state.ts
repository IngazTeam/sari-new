/**
 * Customer State Summary — Pre-Response Briefing
 * 
 * Before every AI response, builds a concise Arabic summary of:
 * - Pending unanswered questions
 * - Current conversation topic and momentum
 * - Escalation history
 * - Time since last interaction
 * - Customer profile highlights
 * 
 * Cost: $0.00 — Pure rule-based analysis, no GPT calls.
 * Injected into system prompt so GPT always knows context.
 */

import type { ChatMessage, TextContent, ImageContent, FileContent } from './openai';
import type { CustomerProfile } from '../db/customer-intelligence';

// Helper: Extract text from ChatMessage content (handles string | multimodal array)
function getTextContent(content: string | (TextContent | ImageContent | FileContent)[]): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textPart = content.find(c => c.type === 'text') as TextContent | undefined;
    return textPart?.text || '';
  }
  return '';
}

// Sanitization: Strip prompt injection from customer-controlled text before system prompt injection
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi,
  /\b(system|assistant|user)\s*:/gi,
  /you\s+are\s+now\s+/gi,
  /forget\s+(everything|all|your)/gi,
  /override\s+(system|all|your)/gi,
  /act\s+as\s+(a|an)?/gi,
  /تصرف\s*(كـ|ك)/gi,
  /تجاهل\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد)/gi,
  /أنت\s+(الآن|الحين)\s+/gi,
];

function sanitizeStateText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let safe = text.normalize('NFKC');
  for (const pattern of INJECTION_PATTERNS) {
    safe = safe.replace(pattern, '[...]');
  }
  return safe.substring(0, 100).trim();
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface CustomerState {
  pendingQuestions: string[];
  lastTopic: string;
  conversationMomentum: 'active' | 'cooling' | 'stale' | 're-engaged';
  timeSinceLastMessage: string;
  unresolved: boolean;
  escalationHistory: string | null;
  buyingStage: string | null;
}

// ═══════════════════════════════════════════════════════════════
// Question Detection Patterns
// ═══════════════════════════════════════════════════════════════

const QUESTION_PATTERNS = [
  // Arabic question patterns
  /كم\s+(سعر|السعر|تكلف|يكلف)/i,
  /وش\s+(سعر|عندكم|لون|حجم)/i,
  /هل\s+(عندكم|يوجد|متوفر|فيه|ممكن)/i,
  /كيف\s+(أطلب|أحجز|أدفع|التوصيل|الشحن)/i,
  /متى\s+(يوصل|يفتح|يقفل|آخر)/i,
  /وين\s+(موقعكم|فرعكم|عنوانكم)/i,
  /ليش\s+(غالي|ما|مو)/i,
  /أبغى\s+(أعرف|أستفسر|أسأل)/i,
  /عندكم\s+.{3,30}\?/i,
  /\?$/, // Ends with question mark
  /؟$/, // Ends with Arabic question mark
];

// Topic extraction patterns
const TOPIC_PATTERNS: { pattern: RegExp; topic: string }[] = [
  { pattern: /سعر|أسعار|كم|تكلف/i, topic: 'الأسعار' },
  { pattern: /توصيل|شحن|يوصل|delivery/i, topic: 'التوصيل والشحن' },
  { pattern: /ضمان|استرجاع|استبدال|return/i, topic: 'الضمان والاسترجاع' },
  { pattern: /دفع|payment|تحويل|فيزا|مدى/i, topic: 'طرق الدفع' },
  { pattern: /حجز|موعد|appointment/i, topic: 'المواعيد والحجز' },
  { pattern: /لون|حجم|مقاس|size|color/i, topic: 'المواصفات' },
  { pattern: /عرض|خصم|تخفيض|discount/i, topic: 'العروض والخصومات' },
  { pattern: /مشكلة|عيب|خراب|كسر/i, topic: 'شكوى أو مشكلة' },
  { pattern: /طلب|order|وين وصل|tracking/i, topic: 'متابعة الطلب' },
];

// ═══════════════════════════════════════════════════════════════
// Core: Build Customer State Summary
// ═══════════════════════════════════════════════════════════════

/**
 * Build a concise state summary for injection into the system prompt.
 * Pure rule-based — zero cost, zero latency.
 */
export function buildCustomerStateSummary(params: {
  previousMessages: ChatMessage[];
  customerProfile: CustomerProfile | null;
  conversationId: number;
}): string {
  const { previousMessages, customerProfile } = params;

  if (previousMessages.length === 0) {
    // First message — no history to analyze
    if (customerProfile && customerProfile.totalConversations > 1) {
      return buildReturningCustomerBrief(customerProfile);
    }
    return '';
  }

  const state = analyzeConversationState(previousMessages, customerProfile);
  return formatStateSummary(state, customerProfile);
}

// ═══════════════════════════════════════════════════════════════
// Analysis Engine (Rule-Based)
// ═══════════════════════════════════════════════════════════════

function analyzeConversationState(
  messages: ChatMessage[],
  profile: CustomerProfile | null,
): CustomerState {
  const pendingQuestions = detectPendingQuestions(messages);
  const lastTopic = detectLastTopic(messages);
  const momentum = detectMomentum(messages);
  const escalationHistory = detectEscalationHistory(messages);
  const buyingStage = (profile?.preferences as any)?.buyingStage || null;

  return {
    pendingQuestions,
    lastTopic,
    conversationMomentum: momentum,
    timeSinceLastMessage: '', // Calculated from message timestamps if available
    unresolved: pendingQuestions.length > 0,
    escalationHistory,
    buyingStage,
  };
}

/**
 * Detect questions asked by the customer that weren't adequately answered.
 * Looks for question patterns in user messages and checks if the next
 * assistant message addresses them.
 */
function detectPendingQuestions(messages: ChatMessage[]): string[] {
  const pending: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== 'user') continue;

    const content = getTextContent(msg.content);
    if (!content) continue;

    // Check if this is a question
    const isQuestion = QUESTION_PATTERNS.some(p => p.test(content));
    if (!isQuestion) continue;

    // Check if the next assistant message exists and addresses it
    const nextAssistant = messages.slice(i + 1).find(m => m.role === 'assistant');

    if (!nextAssistant) {
      // No response to this question yet
      pending.push(sanitizeStateText(content.substring(0, 80)));
      continue;
    }

    const assistantContent = getTextContent(nextAssistant.content);

    // Check for evasive/gap responses
    const EVASIVE_PATTERNS = [
      /خلني أتأكد/i,
      /أتحقق.*أرد/i,
      /ما عندي معلومات/i,
      /ما أقدر أفيدك/i,
      /تواصل.*مباشر/i,
      /للأسف/i,
    ];

    if (EVASIVE_PATTERNS.some(p => p.test(assistantContent))) {
      pending.push(sanitizeStateText(content.substring(0, 80)));
    }
  }

  // Return only the last 3 pending questions (most recent)
  return pending.slice(-3);
}

/**
 * Detect the last topic being discussed.
 */
function detectLastTopic(messages: ChatMessage[]): string {
  // Check last 5 messages for topic signals
  const recentUserMessages = messages
    .filter(m => m.role === 'user')
    .slice(-5);

  for (let i = recentUserMessages.length - 1; i >= 0; i--) {
    const content = getTextContent(recentUserMessages[i].content);

    for (const { pattern, topic } of TOPIC_PATTERNS) {
      if (pattern.test(content)) {
        return topic;
      }
    }
  }

  return 'محادثة عامة';
}

/**
 * Detect conversation momentum based on message pattern.
 */
function detectMomentum(messages: ChatMessage[]): CustomerState['conversationMomentum'] {
  if (messages.length <= 1) return 'active';

  const lastMsg = messages[messages.length - 1];
  const secondLastMsg = messages.length >= 2 ? messages[messages.length - 2] : null;

  // If last message is from user and no assistant reply → active (waiting)
  if (lastMsg.role === 'user') return 'active';

  // If the last 2+ messages are from assistant (no user reply) → cooling
  if (lastMsg.role === 'assistant' && secondLastMsg?.role === 'assistant') {
    return 'cooling';
  }

  // Check for re-engagement signals
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  const lastUserContent = lastUserMsg ? getTextContent(lastUserMsg.content) : '';
  const reEngageSignals = ['مرحبا', 'السلام', 'هلا', 'أهلاً', 'hello', 'hi'];
  if (messages.length > 6 && reEngageSignals.some(s => lastUserContent.toLowerCase().includes(s))) {
    return 're-engaged';
  }

  return 'active';
}

/**
 * Detect if there's any escalation history in the conversation.
 */
function detectEscalationHistory(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = getTextContent(messages[i].content);

    if (content.includes('خلني أتأكد من المعلومة') || content.includes('أتحقق وأرد عليك')) {
      // Count how many messages ago this was
      const messagesAgo = messages.length - i;
      return `تم تصعيد سؤال (قبل ${messagesAgo} رسائل) — تحقق هل تم الرد`;
    }

    if (content.includes('حصلت لك الجواب') || content.includes('تم توصيل ردك')) {
      return null; // Escalation was resolved
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// Formatting
// ═══════════════════════════════════════════════════════════════

function formatStateSummary(
  state: CustomerState,
  profile: CustomerProfile | null,
): string {
  const parts: string[] = [];
  parts.push('\n## 📊 ملخص حالة العميل (اقرأه قبل الرد):');

  // Pending questions — HIGHEST PRIORITY
  if (state.pendingQuestions.length > 0) {
    parts.push(`⏳ **أسئلة تنتظر جواب:**`);
    for (const q of state.pendingQuestions) {
      parts.push(`  - "${q}"`);
    }
    parts.push(`📌 **توجيه: أجب عن هذه الأسئلة أولاً قبل أي شيء آخر!**`);
  }

  // Current topic
  if (state.lastTopic !== 'محادثة عامة') {
    parts.push(`🎯 الموضوع الحالي: ${state.lastTopic}`);
  }

  // Buying stage
  if (state.buyingStage) {
    const stageLabels: Record<string, string> = {
      exploring: '🔍 يستكشف — اعرض الخيارات',
      comparing: '⚖️ يقارن — أبرز التميز',
      ready: '🛒 جاهز للشراء — سهّل الخطوة!',
      purchased: '📦 اشترى — تابع وادعم',
      returning: '🔄 عميل عائد — رحب بحرارة',
    };
    parts.push(`📈 المرحلة: ${stageLabels[state.buyingStage] || state.buyingStage}`);
  }

  // Escalation history
  if (state.escalationHistory) {
    parts.push(`⚠️ ${state.escalationHistory}`);
  }

  // Momentum
  const momentumLabels: Record<string, string> = {
    active: '',  // Don't clutter with obvious state
    cooling: '❄️ المحادثة تبرد — حافظ على الزخم',
    stale: '⚠️ المحادثة متوقفة — أعد تفعيلها بسؤال',
    're-engaged': '🔄 العميل عاد — رحب به واسأل كيف تقدر تساعد',
  };
  if (momentumLabels[state.conversationMomentum]) {
    parts.push(momentumLabels[state.conversationMomentum]);
  }

  // Profile highlights — concise
  if (profile) {
    const highlights: string[] = [];

    if (profile.painPoints && profile.painPoints.length > 0) {
      highlights.push(`نقاط ألم: ${profile.painPoints.slice(-2).map(p => sanitizeStateText(p)).join('، ')}`);
    }

    const interestTags = (profile.preferences as any)?.interestTags;
    if (interestTags && Array.isArray(interestTags) && interestTags.length > 0) {
      highlights.push(`اهتمامات: ${interestTags.slice(0, 3).map((t: string) => sanitizeStateText(t)).join('، ')}`);
    }

    if (highlights.length > 0) {
      parts.push(`🧠 ${highlights.join(' | ')}`);
    }
  }

  // Only return if we have meaningful content (not just the header)
  if (parts.length <= 1) return '';

  return parts.join('\n') + '\n';
}

/**
 * Build brief for a returning customer starting a new conversation.
 */
function buildReturningCustomerBrief(profile: CustomerProfile): string {
  const parts: string[] = [];
  parts.push('\n## 📊 ملخص حالة العميل:');
  parts.push(`🔄 عميل عائد — المحادثة رقم ${profile.totalConversations}`);

  if (profile.purchaseHistory && profile.purchaseHistory.length > 0) {
    const lastPurchase = sanitizeStateText(profile.purchaseHistory[profile.purchaseHistory.length - 1]);
    parts.push(`🛒 آخر شراء: ${lastPurchase}`);
    parts.push(`📌 توجيه: اذكر "${lastPurchase}" طبيعياً واسأل كيف تجربته`);
  }

  if (profile.lastObjection) {
    const objLabels: Record<string, string> = {
      price: 'السعر — ابدأ بالقيمة',
      delivery: 'التوصيل — طمئنه',
      quality: 'الجودة — اذكر الضمان',
      trust: 'الثقة — استخدم دليل اجتماعي',
    };
    parts.push(`⚠️ آخر اعتراض: ${objLabels[profile.lastObjection] || sanitizeStateText(profile.lastObjection)}`);
  }

  if (profile.painPoints && profile.painPoints.length > 0) {
    parts.push(`🧠 نقاط ألم: ${profile.painPoints.slice(-2).map(p => sanitizeStateText(p)).join('، ')}`);
  }

  return parts.join('\n') + '\n';
}
