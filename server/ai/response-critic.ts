/**
 * Response Critic — Layer 1: Generate-Critique-Fix
 * 
 * Reviews every GPT response against 8 quality criteria BEFORE sending.
 * Uses GPT-4o-mini for fast, cheap critique (~0.5s, ~$0.001/call).
 * If issues found, GPT-4o rewrites the response.
 * 
 * Criteria:
 * 1. Answered the specific question (متى→date, كم→price)
 * 2. Language and tone appropriate to the customer
 * 3. Relevant recommendations after answering the primary need; respect refusal
 * 4. No marketing preamble
 * 5. Clear enough for the decision, without repetition
 * 6. Verified operational claims
 * 7. Context-aware (didn't ignore previous questions)
 * 8. Quoted-reply awareness (understood [رد على رسالة: ...] context)
 */

import { callGPT4 } from './openai';
import { z } from 'zod';

// ════════════════════════════════════════════════
// P3: Cost Guard — Daily critique limit per merchant
// ════════════════════════════════════════════════

const DAILY_CRITIQUE_LIMIT = 200; // Max critiques per merchant per day
const _dailyCritiqueCounts = new Map<string, { count: number; date: string }>();

function getDateKey(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Check if merchant has remaining critique budget.
 * Returns false if limit exceeded (skip critic).
 */
export function hasCritiqueBudget(merchantId: number): boolean {
  const key = `${merchantId}`;
  const today = getDateKey();
  const entry = _dailyCritiqueCounts.get(key);

  if (!entry || entry.date !== today) {
    _dailyCritiqueCounts.set(key, { count: 0, date: today });
    return true;
  }

  return entry.count < DAILY_CRITIQUE_LIMIT;
}

function incrementCritiqueBudget(merchantId: number): void {
  const key = `${merchantId}`;
  const today = getDateKey();
  const entry = _dailyCritiqueCounts.get(key);

  if (!entry || entry.date !== today) {
    _dailyCritiqueCounts.set(key, { count: 1, date: today });
  } else {
    entry.count++;
  }
}

// ════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════

export interface CritiqueResult {
  assessed?: boolean;
  passed: boolean;
  failures: string[];
  suggestions: string;
  score: number; // 0-8; ignored when assessed=false
}

const critiqueSchema = z.object({ passed: z.boolean(), failures: z.array(z.string().max(500)).max(8),
  suggestions: z.string().max(2000), score: z.number().int().min(0).max(8) }).strict();
const notAssessed = (): CritiqueResult => ({ assessed: false, passed: false, failures: [], suggestions: '', score: 0 });

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ════════════════════════════════════════════════
// Critique Prompt
// ════════════════════════════════════════════════

const CRITIQUE_PROMPT = `أنت مراجع جودة لردود مبيعات واتساب. قيّم الرد التالي على 8 معايير:

1. **جاوب السؤال**: إذا سأل "متى" هل أعطاه تاريخ؟ إذا سأل "كم" هل أعطاه سعر؟ إذا سأل عن شي محدد هل جاوب عليه بالضبط؟
2. **لغة ملائمة**: هل يحترم لغة العميل والنبرة المتسقة في الحوار دون فرض لهجة أو لغة أخرى؟ الفصحى ليست خطأً بحد ذاتها.
3. **ترشيح ملائم**: هل أجاب عن الاحتياج الأساسي؟ يسمح ببديل أو إضافة مرتبطة باحتياج واضح، دون تشتيت أو ضغط بعد رفض.
4. **بدون ديباجة**: هل بدأ بمدح عام ("هذي الدورة مهمة جداً في المجال")؟ أو كلام تسويقي فاضي ("استثمار في مستقبلك")؟
5. **واضح وكافٍ**: هل المعلومات اللازمة لاتخاذ القرار والخطوة التالية واضحة دون تكرار؟ لا تحدد طولاً ثابتاً لشرح أو مقارنة مطلوبة.
6. **حقيقة التنفيذ**: هل ادعى خصماً أو إنشاء طلب أو دفعاً دون مرجع مؤكد؟ الروابط المعتمدة ليست خطأً لمجرد كونها روابط.
7. **سياق المحادثة**: هل تجاهل سؤال سابق ما اتجاوب عليه؟
8. **فهم الردود المقتبسة**: إذا رسالة العميل تبدأ بـ [رد على رسالة: "..."] هل فهم الرد أن العميل يشير للرسالة المقتبسة؟ مثلاً [رد على رسالة: "BLS بـ 230"] + "اريد" = يبي BLS. هل الرد فهم هذا؟

أجب بصيغة JSON فقط:
{
  "passed": true/false,
  "failures": ["رقم المعيار: وصف المشكلة"],
  "suggestions": "كيف يُصلح الرد",
  "score": 0-8
}`;

// ════════════════════════════════════════════════
// Core Functions
// ════════════════════════════════════════════════

/**
 * Critique a GPT response against quality checklist
 * Uses GPT-4o-mini for speed (~0.5s)
 */
export async function critiqueResponse(params: {
  response: string;
  customerMessage: string;
  conversationHistory: ChatMessage[];
  merchantId?: number;
  productNames?: string[];
}): Promise<CritiqueResult> {
  const { response, customerMessage, conversationHistory, merchantId } = params;

  // P3 Cost Guard: Skip for trivial messages
  if (customerMessage.trim().length < 10 || response.trim().length < 20) {
    return notAssessed();
  }

  // P3 Cost Guard: Daily limit per merchant
  if (merchantId && !hasCritiqueBudget(merchantId)) {
    console.log(`[Critic] Daily limit reached for merchant ${merchantId} (${DAILY_CRITIQUE_LIMIT}/day) — skipping`);
    return notAssessed();
  }

  // Track usage
  if (merchantId) incrementCritiqueBudget(merchantId);

  // Build context summary (last 3 messages for brevity)
  const recentHistory = conversationHistory.slice(-6)
    .map(m => `${m.role === 'user' ? 'عميل' : 'بوت'}: ${typeof m.content === 'string' ? m.content.substring(0, 100) : ''}`)
    .join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: CRITIQUE_PROMPT },
    { role: 'user', content: `## سياق المحادثة:
${recentHistory}

## رسالة العميل الأخيرة:
${customerMessage}

## منتجات وأسعار مرجعية حالية (لا تفترض تفاصيل أخرى):
${params.productNames?.slice(0, 50).join('\n') || 'لا توجد قائمة موثقة في هذا التقييم'}

## الرد المراد تقييمه:
${response}

قيّم الرد بصيغة JSON:` },
  ];

  try {
    const raw = await callGPT4(messages, {
      merchantId,
      taskType: 'sari.response.critique',
      temperature: 0.1,
      maxTokens: 300,
      model: 'gpt-4o-mini',
    });

    // Parse JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return notAssessed();
    }

    const parsed = critiqueSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success || (parsed.data.passed && parsed.data.failures.length > 0)) return notAssessed();
    return { ...parsed.data, assessed: true };
  } catch (err) {
    // The independent validator still runs; an unavailable assessment is not a pass.
    console.warn('[Critic] Assessment unavailable:', (err as Error).message);
    return notAssessed();
  }
}

/**
 * Fix a response based on critique feedback
 * Uses GPT-4o for quality (same model as original response)
 */
export async function fixResponse(params: {
  originalResponse: string;
  critique: CritiqueResult;
  customerMessage: string;
  conversationHistory: ChatMessage[];
  productNames?: string[];
  merchantId?: number;
}): Promise<string> {
  const { originalResponse, critique, customerMessage, conversationHistory, productNames, merchantId } = params;

  const recentHistory = conversationHistory.slice(-4)
    .map(m => `${m.role === 'user' ? 'عميل' : 'بوت'}: ${typeof m.content === 'string' ? m.content.substring(0, 100) : ''}`)
    .join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: `أنت موظف مبيعات سعودي محترف. أعد صياغة الرد التالي بناء على الملاحظات.

القواعد:
- حافظ على لغة العميل والنبرة المتسقة في المحادثة
- أجب على السؤال بالضبط — لا كلام زائد
- يمكن عرض بديل مرتبط باحتياج واضح، مع احترام الميزانية والرفض
- لا ديباجة تسويقية — ابدأ بالإجابة مباشرة
- استخدم الطول اللازم لشرح واضح بلا حشو أو تكرار
- لا تشارك أي إيميل أو رقم هاتف
- **🔴 ممنوع تقول "ما عندنا" أو "لا يوجد" إذا المنتج موجود في القائمة أدناه!**
- **مطابقة ذكية**: "ACLS" = "دعم الحياة القلبية المتقدمة (ACLS)" — ابحث بالاسم العربي والإنجليزي

أرجع الرد المُصلح فقط — بدون تعليقات أو شرح.` },
    { role: 'user', content: `## المحادثة:
${recentHistory}
${productNames && productNames.length > 0 ? `
## المنتجات المتوفرة (القائمة الرسمية):
${productNames.slice(0, 50).join('، ')}
` : ''}
## رسالة العميل:
${customerMessage}

## الرد الأصلي:
${originalResponse}

## المشاكل:
${critique.failures.join('\n')}

## الاقتراح:
${critique.suggestions}

أعد صياغة الرد:` },
  ];

  try {
    const fixed = await callGPT4(messages, {
      merchantId,
      taskType: 'sari.response.rewrite',
      temperature: 0.5,
      maxTokens: 400,
    });

    if (fixed && fixed.length > 10) {
      console.log(`[Critic] Response rewritten after assessment: ${critique.score}/8`);
      return fixed;
    }
  } catch (err) {
    console.warn('[Critic] Fix failed (using original):', (err as Error).message);
  }

  // Fallback: return original
  return originalResponse;
}

// ════════════════════════════════════════════════
// Telemetry
// ════════════════════════════════════════════════

let _critiqueStats = { total: 0, passed: 0, fixed: 0, notAssessed: 0 };

export function recordCritique(result: CritiqueResult, wasFixed: boolean): void {
  if (result.assessed === false) { _critiqueStats.notAssessed++; return; }
  _critiqueStats.total++;
  if (result.passed) _critiqueStats.passed++;
  if (wasFixed) _critiqueStats.fixed++;
}

export function getCritiqueStats() {
  return { ..._critiqueStats };
}

// Reset stats every hour
setInterval(() => {
  if (_critiqueStats.total > 0) {
    console.log(`[Critic] 📊 Hourly stats: ${_critiqueStats.total} total, ${_critiqueStats.passed} passed (${Math.round((_critiqueStats.passed / _critiqueStats.total) * 100)}%), ${_critiqueStats.fixed} fixed`);
  }
  _critiqueStats = { total: 0, passed: 0, fixed: 0, notAssessed: 0 };
}, 3600_000);
