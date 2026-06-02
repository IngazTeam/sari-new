/**
 * Supervisor Recovery — Layer 2
 * 
 * After 30 minutes of customer silence, the "Supervisor" reviews the entire
 * conversation, identifies why the customer disengaged, and sends a
 * personalized recovery message.
 * 
 * Trigger conditions (ALL must be true):
 * - Customer silent for 30+ minutes
 * - 3+ messages exchanged in conversation
 * - No purchase/booking completed
 * - Last customer message isn't goodbye (شكراً, مع السلامة, etc.)
 * - Supervisor hasn't intervened in this conversation before
 * - Current time is 8 AM - 10 PM
 */

import { callGPT4 } from './openai';

// ════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════

export type SupervisorReason =
  | 'unanswered_question'
  | 'bad_response_quality'
  | 'price_objection_lost'
  | 'interest_dropped'
  | 'frustrated_customer'
  | 'none';

export interface SupervisorAnalysis {
  shouldIntervene: boolean;
  reason: SupervisorReason;
  confidence: number;       // 0-1
  identifiedGap: string;    // وصف المشكلة
  recoveryMessage: string;  // رسالة المشرف
}

interface ChatMessage {
  role: string;
  content: string;
}

// ════════════════════════════════════════════════
// Analysis Prompt
// ════════════════════════════════════════════════

const SUPERVISOR_ANALYSIS_PROMPT = `أنت محلل محادثات خبير. حلّل المحادثة التالية وحدد:

1. **لماذا سكت العميل؟** (اختر سبب واحد)
   - unanswered_question: سؤال محدد ما اتجاوب
   - bad_response_quality: الرد كان تسويقي/عام/فصحى بدل إجابة مباشرة
   - price_objection_lost: العميل اعترض على السعر وسكت
   - interest_dropped: العميل كان مهتم وفجأة سكت
   - frustrated_customer: العميل بان عليه إحباط من الردود
   - none: المحادثة انتهت بشكل طبيعي (لا يحتاج تدخل)

2. **هل يحتاج تدخل؟** (true/false)

3. **رسالة المتابعة** — إذا يحتاج تدخل، اكتب رسالة قصيرة (2-3 أسطر):
   - ❌ ممنوع تقول "أنا مشرف" أو "مدير" أو أي لقب — تكلم كأنك نفس الشخص اللي يرد
   - ❌ ممنوع تنتقد الردود السابقة
   - أعط الإجابة المباشرة فوراً إذا كان في سؤال ما اتجاوب
   - لهجة سعودية طبيعية — رد مباشر ومركّز
   - مثال صحيح: "هلا! لاحظت إنك سألت عن الأسعار، تفضل التفاصيل: ..."
   - مثال خاطئ: "مرحباً، أنا مشرف خدمة العملاء..."

أجب بصيغة JSON فقط:
{
  "shouldIntervene": true/false,
  "reason": "السبب",
  "confidence": 0-1,
  "identifiedGap": "وصف المشكلة",
  "recoveryMessage": "رسالة المتابعة"
}`;

// ════════════════════════════════════════════════
// Goodbye detection
// ════════════════════════════════════════════════

const GOODBYE_PATTERNS = [
  'شكرا', 'شكراً', 'مشكور', 'يعطيك العافية',
  'مع السلامة', 'الله يسلمك', 'باي', 'تمام',
  'أوك', 'اوكي', 'ok', 'thanks', 'شكرًا',
  'الله يوفقكم', 'ماشي', 'خلاص', 'طيب',
];

function isGoodbyeMessage(msg: string): boolean {
  const cleaned = msg.trim().toLowerCase();
  return GOODBYE_PATTERNS.some(p => cleaned.includes(p)) && cleaned.length < 30;
}

// ════════════════════════════════════════════════
// Core Analysis
// ════════════════════════════════════════════════

/**
 * Analyze a conversation to determine if supervisor should intervene
 */
export async function evaluateConversationForRecovery(params: {
  messages: ChatMessage[];
  merchantBusinessName?: string;
}): Promise<SupervisorAnalysis> {
  const { messages, merchantBusinessName } = params;

  // Format conversation for analysis
  const formatted = messages
    .map(m => {
      const role = m.role === 'user' ? 'العميل' : m.role === 'assistant' ? 'البوت' : 'النظام';
      return `${role}: ${typeof m.content === 'string' ? m.content.substring(0, 200) : ''}`;
    })
    .join('\n');

  const contextNote = merchantBusinessName
    ? `هذا المتجر: ${merchantBusinessName}`
    : '';

  const analysisMessages: { role: 'system' | 'user'; content: string }[] = [
    { role: 'system', content: SUPERVISOR_ANALYSIS_PROMPT },
    { role: 'user', content: `${contextNote}\n\n## المحادثة:\n${formatted}\n\nحلّل وأجب بصيغة JSON:` },
  ];

  try {
    const raw = await callGPT4(analysisMessages, {
      temperature: 0.2,
      maxTokens: 500,
      model: 'gpt-4o-mini', // Fast + cheap for analysis
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { shouldIntervene: false, reason: 'none', confidence: 0, identifiedGap: '', recoveryMessage: '' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      shouldIntervene: parsed.shouldIntervene ?? false,
      reason: parsed.reason || 'none',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      identifiedGap: parsed.identifiedGap || '',
      recoveryMessage: parsed.recoveryMessage || '',
    };
  } catch (err) {
    console.error('[Supervisor] Analysis failed:', (err as Error).message);
    return { shouldIntervene: false, reason: 'none', confidence: 0, identifiedGap: '', recoveryMessage: '' };
  }
}

// ════════════════════════════════════════════════
// Eligibility Check
// ════════════════════════════════════════════════

/**
 * Check if a conversation is eligible for supervisor intervention
 */
export function isEligibleForSupervisor(params: {
  messageCount: number;
  lastCustomerMessage: string;
  hasPurchase: boolean;
  alreadyIntervened: boolean;
  currentHour: number;
}): boolean {
  const { messageCount, lastCustomerMessage, hasPurchase, alreadyIntervened, currentHour } = params;

  // Must have 3+ messages
  if (messageCount < 3) return false;

  // No purchase completed
  if (hasPurchase) return false;

  // Not already intervened
  if (alreadyIntervened) return false;

  // Business hours only (8 AM - 10 PM)
  if (currentHour < 8 || currentHour >= 22) return false;

  // Last message isn't goodbye
  if (isGoodbyeMessage(lastCustomerMessage)) return false;

  return true;
}

// ════════════════════════════════════════════════
// Telemetry
// ════════════════════════════════════════════════

let _supervisorStats = { evaluated: 0, intervened: 0, reasons: {} as Record<string, number> };

export function recordSupervisorAction(reason: SupervisorReason): void {
  _supervisorStats.evaluated++;
  if (reason !== 'none') {
    _supervisorStats.intervened++;
    _supervisorStats.reasons[reason] = (_supervisorStats.reasons[reason] || 0) + 1;
  }
}

export function getSupervisorStats() {
  return { ..._supervisorStats };
}

// Reset stats every hour
setInterval(() => {
  if (_supervisorStats.evaluated > 0) {
    console.log(`[Supervisor] 📊 Hourly: ${_supervisorStats.evaluated} evaluated, ${_supervisorStats.intervened} intervened, reasons: ${JSON.stringify(_supervisorStats.reasons)}`);
  }
  _supervisorStats = { evaluated: 0, intervened: 0, reasons: {} };
}, 3600_000);
